import type Database from 'better-sqlite3'
import { getDb } from './db'
import { DEFAULT_EXECUTION_OUTPUT_MAX_BYTES, pruneFinishedExecutionLogs } from './execution-log-maintenance'

export const SETTING_KEYS = {
  executionHistoryMaxCount: 'execution_history_max_count',
  executionOutputMaxBytes: 'execution_output_max_bytes'
} as const

const DEFAULT_EXECUTION_HISTORY_MAX = 200
const MIN_HISTORY = 10
const MAX_HISTORY = 10_000

const MIN_OUTPUT_BYTES = 64 * 1024 // 64KB
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024 // 50MB

function clampHistory(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EXECUTION_HISTORY_MAX
  return Math.min(MAX_HISTORY, Math.max(MIN_HISTORY, Math.floor(n)))
}

function clampOutputBytes(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EXECUTION_OUTPUT_MAX_BYTES
  return Math.min(MAX_OUTPUT_BYTES, Math.max(MIN_OUTPUT_BYTES, Math.floor(n)))
}

export function getExecutionHistoryMaxCount(db: Database.Database): number {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.executionHistoryMaxCount) as { value: string } | undefined
  if (!row?.value) return DEFAULT_EXECUTION_HISTORY_MAX
  return clampHistory(parseInt(row.value, 10))
}

export function getExecutionOutputMaxBytes(db: Database.Database): number {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.executionOutputMaxBytes) as { value: string } | undefined
  if (!row?.value) return DEFAULT_EXECUTION_OUTPUT_MAX_BYTES
  return clampOutputBytes(parseInt(row.value, 10))
}

export function setExecutionHistoryMaxCount(db: Database.Database, count: number): number {
  const v = clampHistory(count)
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.executionHistoryMaxCount,
    String(v)
  )
  pruneFinishedExecutionLogs(db, v)
  return v
}

export function setExecutionOutputMaxBytes(db: Database.Database, bytes: number): number {
  const v = clampOutputBytes(bytes)
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.executionOutputMaxBytes,
    String(v)
  )
  return v
}

/** 供 IPC：读取当前与允许范围 */
export function getSettingsSnapshot(): {
  executionHistoryMaxCount: number
  executionHistoryMin: number
  executionHistoryMax: number
  executionOutputMaxBytes: number
  executionOutputMinBytes: number
  executionOutputLimitMaxBytes: number
} {
  const db = getDb()
  return {
    executionHistoryMaxCount: getExecutionHistoryMaxCount(db),
    executionHistoryMin: MIN_HISTORY,
    executionHistoryMax: MAX_HISTORY,
    executionOutputMaxBytes: getExecutionOutputMaxBytes(db),
    executionOutputMinBytes: MIN_OUTPUT_BYTES,
    executionOutputLimitMaxBytes: MAX_OUTPUT_BYTES
  }
}
