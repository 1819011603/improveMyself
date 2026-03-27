import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionBundle } from '../shared/types/api-workflow'

/** 插入 api_environments 行，返回新 id */
export function insertApiEnvironment(db: Database.Database, name: string, bundle: SessionBundle): string {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO api_environments (id, name, bundle_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, JSON.stringify(bundle), now, now)
  return id
}
