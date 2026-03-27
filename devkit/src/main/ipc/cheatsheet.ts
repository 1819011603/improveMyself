import { ipcMain, app } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type { CheatsheetEntry } from '../../shared/types'

function rowToEntry(row: Record<string, unknown>): CheatsheetEntry {
  return {
    id: row.id as string,
    category: row.category as CheatsheetEntry['category'],
    command: row.command as string,
    description: row.description as string,
    tags: JSON.parse(row.tags as string),
    platform: (row.platform as CheatsheetEntry['platform']) || 'all',
    isBuiltin: (row.is_builtin as number) === 1
  }
}

export function seedBuiltinCheatsheet(): void {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) as c FROM cheatsheet_entries WHERE is_builtin = 1').get() as { c: number }).c
  if (count > 0) return

  const presetsDir = join(app.getAppPath(), 'presets')
  try {
    const files = readdirSync(presetsDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      const entries: Omit<CheatsheetEntry, 'id' | 'isBuiltin'>[] = JSON.parse(
        readFileSync(join(presetsDir, file), 'utf-8')
      )
      const insert = db.prepare(`
        INSERT OR IGNORE INTO cheatsheet_entries (id, category, command, description, tags, platform, is_builtin)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      for (const entry of entries) {
        insert.run(randomUUID(), entry.category, entry.command, entry.description, JSON.stringify(entry.tags), entry.platform || 'all')
      }
    }
  } catch {
    // presets dir may not exist yet in dev
  }
}

export function registerCheatsheetHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.CHEATSHEET_LIST, (_e, { search, category }: { search?: string; category?: string } = {}) => {
    let sql = 'SELECT * FROM cheatsheet_entries'
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(command LIKE ? OR description LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY is_builtin DESC, category, command'

    return toIpcReply((db.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToEntry))
  })

  ipcMain.handle(IPC.CHEATSHEET_CREATE, (_e, data: Omit<CheatsheetEntry, 'id' | 'isBuiltin'>) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO cheatsheet_entries (id, category, command, description, tags, platform, is_builtin)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, data.category, data.command, data.description, JSON.stringify(data.tags), data.platform || 'all')
    const row = db.prepare('SELECT * FROM cheatsheet_entries WHERE id = ?').get(id) as Record<string, unknown>
    return toIpcReply(rowToEntry(row))
  })

  ipcMain.handle(IPC.CHEATSHEET_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM cheatsheet_entries WHERE id = ? AND is_builtin = 0').run(id)
    return true
  })
}
