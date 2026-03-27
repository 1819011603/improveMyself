import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getExecutionHistoryMaxCount, getExecutionOutputMaxBytes } from '../app-settings'
import { getDb } from '../db'
import { pruneFinishedExecutionLogs, truncateExecutionOutputUtf8 } from '../execution-log-maintenance'
import {
  executionBufferAppend,
  executionBufferDispose,
  executionBufferGet,
  executionBufferInit,
  executionBufferSetPid
} from '../execution-buffer'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type { Script, ScriptInterpreter } from '../../shared/types'

// Track running processes: executionId -> process
const runningProcesses = new Map<string, ChildProcess>()

function rowToScript(row: Record<string, unknown>): Script {
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
    async (
      e,
      id: string,
      params: Record<string, string> = {},
      debug: { content?: string; interpreter?: ScriptInterpreter } = {}
    ) => {
      const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row) throw new Error(`Script ${id} not found`)

      const script = rowToScript(row)
      const platform = process.platform === 'win32' ? 'windows' : 'macos'
      const config = script.platforms[platform]
      const hasDebugBody = debug.content != null && String(debug.content).trim().length > 0
      if (!config && !hasDebugBody) throw new Error(`No ${platform} version for this script`)

      const rawTemplate = hasDebugBody ? String(debug.content) : (config?.content ?? '')
      if (!rawTemplate.trim()) throw new Error('脚本内容为空')

      const interpreter: ScriptInterpreter = hasDebugBody
        ? debug.interpreter ?? config?.interpreter ?? 'bash'
        : config!.interpreter

      let content = rawTemplate
      for (const [key, val] of Object.entries(params)) {
        content = content.replaceAll(`{{${key}}}`, val)
      }

      const executionId = randomUUID()
      const startedAt = new Date().toISOString()

      db.prepare(`
      INSERT INTO execution_logs (id, script_id, started_at, params, output)
      VALUES (?, ?, ?, ?, '')
    `).run(executionId, id, startedAt, JSON.stringify(params))

      executionBufferInit(executionId, undefined)

      const win = BrowserWindow.fromWebContents(e.sender)

      const interpreterMap: Record<string, string[]> = {
        bash: ['bash', '-c'],
        zsh: ['zsh', '-c'],
        python: ['python3', '-c'],
        node: ['node', '-e'],
        powershell: ['powershell', '-Command'],
        cmd: ['cmd', '/c']
      }
      const [cmd, ...spawnArgs] = interpreterMap[interpreter] || interpreterMap.bash
      const child = spawn(cmd, [...spawnArgs, content], { shell: false })

      runningProcesses.set(executionId, child)
      const pid = typeof child.pid === 'number' ? child.pid : undefined
      executionBufferSetPid(executionId, pid)
      db.prepare(`UPDATE execution_logs SET spawn_pid = ? WHERE id = ?`).run(pid ?? null, executionId)

      let output = ''

      const sendOutput = (data: string, done = false, exitCode?: number) => {
        if (data) executionBufferAppend(executionId, data)
        output += data
        const payload =
          exitCode !== undefined
            ? { executionId, data, done, exitCode }
            : { executionId, data, done }
        win?.webContents.send(IPC.SCRIPT_OUTPUT, toIpcReply(payload))
      }

      child.stdout.on('data', (data: Buffer) => sendOutput(data.toString()))
      child.stderr.on('data', (data: Buffer) => sendOutput(data.toString()))

      child.on('close', (code) => {
        runningProcesses.delete(executionId)
        executionBufferDispose(executionId)
        const finishedAt = new Date().toISOString()
        const storedOutput = truncateExecutionOutputUtf8(output, getExecutionOutputMaxBytes(db))
        db.prepare(`
        UPDATE execution_logs SET finished_at = ?, exit_code = ?, output = ? WHERE id = ?
      `).run(finishedAt, code, storedOutput, executionId)
        pruneFinishedExecutionLogs(db, getExecutionHistoryMaxCount(db))
        sendOutput('', true, code ?? -1)
      })

      return toIpcReply({ executionId, pid: pid ?? null })
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
