import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDb } from '../db'
import { executionBufferGet } from '../execution-buffer'
import { runningProcesses, startScriptExecution } from '../script-execution'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type { Script, ScriptInterpreter } from '../../shared/types'

export function rowToScript(row: Record<string, unknown>): Script {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    tags: JSON.parse(row.tags as string),
    platforms: JSON.parse(row.platforms as string),
    params: JSON.parse(row.params as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

function attachLastRunStats(db: Database.Database, scripts: Script[]): Script[] {
  const lastRows = db
    .prepare(
      `
    SELECT e.script_id as script_id, e.started_at as started_at, e.finished_at as finished_at
    FROM execution_logs e
    INNER JOIN (
      SELECT script_id as sid, MAX(finished_at) as mf
      FROM execution_logs
      WHERE finished_at IS NOT NULL AND script_id IS NOT NULL
      GROUP BY script_id
    ) t ON e.script_id = t.sid AND e.finished_at = t.mf
  `
    )
    .all() as { script_id: string; started_at: string; finished_at: string }[]

  const lastMap = new Map(lastRows.map((r) => [r.script_id, r]))
  return scripts.map((s) => {
    const L = lastMap.get(s.id)
    if (!L) return s
    const ms = Date.parse(L.finished_at) - Date.parse(L.started_at)
    return {
      ...s,
      lastExecutedAt: L.finished_at,
      lastRunDurationMs: Number.isFinite(ms) ? ms : undefined
    }
  })
}

export function registerScriptHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.SCRIPT_LIST, (_e, { search, tags }: { search?: string; tags?: string[] } = {}) => {
    let sql = 'SELECT * FROM scripts'
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push("(name LIKE ? OR description LIKE ?)")
      params.push(`%${search}%`, `%${search}%`)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY updated_at DESC'

    let rows = db.prepare(sql).all(...params) as Record<string, unknown>[]

    // Filter by tags in JS (SQLite JSON arrays)
    if (tags && tags.length > 0) {
      rows = rows.filter((row) => {
        const rowTags: string[] = JSON.parse(row.tags as string)
        return tags.some((t) => rowTags.includes(t))
      })
    }

    const scripts = rows.map(rowToScript)
    return toIpcReply(attachLastRunStats(db, scripts))
  })

  ipcMain.handle(IPC.SCRIPT_GET, (_e, id: string) => {
    const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toIpcReply(rowToScript(row)) : null
  })

  ipcMain.handle(IPC.SCRIPT_CREATE, (_e, data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO scripts (id, name, description, tags, platforms, params, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.description, JSON.stringify(data.tags), JSON.stringify(data.platforms), JSON.stringify(data.params), now, now)

    const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown>
    return toIpcReply(rowToScript(row))
  })

  ipcMain.handle(IPC.SCRIPT_UPDATE, (_e, id: string, data: Partial<Script>) => {
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)) }
    if (data.platforms !== undefined) { fields.push('platforms = ?'); values.push(JSON.stringify(data.platforms)) }
    if (data.params !== undefined) { fields.push('params = ?'); values.push(JSON.stringify(data.params)) }

    fields.push('updated_at = ?')
    values.push(now, id)

    db.prepare(`UPDATE scripts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown>
    return toIpcReply(rowToScript(row))
  })

  ipcMain.handle(IPC.SCRIPT_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM scripts WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle(
    IPC.SCRIPT_RUN,
    (
      e,
      id: string,
      params: Record<string, string> = {},
      debug: { content?: string; interpreter?: ScriptInterpreter } = {}
    ) => {
      const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row) throw new Error(`Script ${id} not found`)

      const script = rowToScript(row)
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = startScriptExecution({
        db,
        script,
        params,
        debug,
        taskId: null,
        outputWebContents: win?.webContents ?? null
      })
      return toIpcReply(result)
    }
  )

  ipcMain.handle(IPC.SCRIPT_EXECUTION_BUFFER, (_e, executionId: string) => {
    return toIpcReply(executionBufferGet(executionId))
  })

  ipcMain.handle(IPC.SCRIPT_KILL, (_e, executionId: string) => {
    const child = runningProcesses.get(executionId)
    if (child) {
      child.kill('SIGTERM')
      runningProcesses.delete(executionId)
      return true
    }
    return false
  })
}
