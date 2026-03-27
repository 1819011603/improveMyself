import type Database from 'better-sqlite3'
import { getDb } from './db'
import { DEFAULT_EXECUTION_OUTPUT_MAX_BYTES, pruneFinishedExecutionLogs } from './execution-log-maintenance'
import { normalizeParamLayerOrder } from './api-workflow/param-merge'
import type { ApiWorkflowParamLayer } from '../shared/types/api-workflow'

export const SETTING_KEYS = {
  executionHistoryMaxCount: 'execution_history_max_count',
  executionOutputMaxBytes: 'execution_output_max_bytes',
  sessionReceiverEnabled: 'session_receiver_enabled',
  sessionReceiverPort: 'session_receiver_port',
  sessionReceiverToken: 'session_receiver_token',
  apiWorkflowGlobalParams: 'api_workflow_global_params',
  apiWorkflowParamLayerOrder: 'api_workflow_param_layer_order'
} as const

const DEFAULT_SESSION_RECEIVER_PORT = 17373
const MIN_SESSION_PORT = 1024
const MAX_SESSION_PORT = 65535

function clampSessionPort(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SESSION_RECEIVER_PORT
  return Math.min(MAX_SESSION_PORT, Math.max(MIN_SESSION_PORT, Math.floor(n)))
}

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

export function getSessionReceiverEnabled(db: Database.Database): boolean {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.sessionReceiverEnabled) as { value: string } | undefined
  if (row?.value === undefined || row?.value === '') return true
  return row.value === '1' || row.value === 'true'
}

export function getSessionReceiverPort(db: Database.Database): number {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.sessionReceiverPort) as { value: string } | undefined
  if (!row?.value) return DEFAULT_SESSION_RECEIVER_PORT
  return clampSessionPort(parseInt(row.value, 10))
}

export function getSessionReceiverToken(db: Database.Database): string {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.sessionReceiverToken) as { value: string } | undefined
  return row?.value ?? ''
}

export function setSessionReceiverEnabled(db: Database.Database, enabled: boolean): void {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.sessionReceiverEnabled,
    enabled ? '1' : '0'
  )
}

export function setSessionReceiverPort(db: Database.Database, port: number): number {
  const v = clampSessionPort(port)
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.sessionReceiverPort,
    String(v)
  )
  return v
}

export function setSessionReceiverToken(db: Database.Database, token: string): void {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.sessionReceiverToken,
    token
  )
}

function parseJsonObject(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {}
  try {
    const o = JSON.parse(raw) as unknown
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
      else if (v != null) out[k] = String(v)
    }
    return out
  } catch {
    return {}
  }
}

export function getApiWorkflowGlobalParams(db: Database.Database): Record<string, string> {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.apiWorkflowGlobalParams) as { value: string } | undefined
  return parseJsonObject(row?.value)
}

export function setApiWorkflowGlobalParams(db: Database.Database, params: Record<string, string>): void {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.apiWorkflowGlobalParams,
    JSON.stringify(params ?? {})
  )
}

export function getApiWorkflowParamLayerOrder(db: Database.Database): ApiWorkflowParamLayer[] {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTING_KEYS.apiWorkflowParamLayerOrder) as { value: string } | undefined
  if (!row?.value?.trim()) return ['step', 'global', 'push']
  try {
    const arr = JSON.parse(row.value) as unknown
    return normalizeParamLayerOrder(arr)
  } catch {
    return ['step', 'global', 'push']
  }
}

export function setApiWorkflowParamLayerOrder(db: Database.Database, order: ApiWorkflowParamLayer[]): void {
  const normalized = normalizeParamLayerOrder(order)
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(
    SETTING_KEYS.apiWorkflowParamLayerOrder,
    JSON.stringify(normalized)
  )
}

/** 供 IPC：读取当前与允许范围 */
export function getSettingsSnapshot(): {
  executionHistoryMaxCount: number
  executionHistoryMin: number
  executionHistoryMax: number
  executionOutputMaxBytes: number
  executionOutputMinBytes: number
  executionOutputLimitMaxBytes: number
  sessionReceiverEnabled: boolean
  sessionReceiverPort: number
  sessionReceiverPortMin: number
  sessionReceiverPortMax: number
  sessionReceiverToken: string
  apiWorkflowGlobalParams: Record<string, string>
  apiWorkflowParamLayerOrder: ApiWorkflowParamLayer[]
} {
  const db = getDb()
  return {
    executionHistoryMaxCount: getExecutionHistoryMaxCount(db),
    executionHistoryMin: MIN_HISTORY,
    executionHistoryMax: MAX_HISTORY,
    executionOutputMaxBytes: getExecutionOutputMaxBytes(db),
    executionOutputMinBytes: MIN_OUTPUT_BYTES,
    executionOutputLimitMaxBytes: MAX_OUTPUT_BYTES,
    sessionReceiverEnabled: getSessionReceiverEnabled(db),
    sessionReceiverPort: getSessionReceiverPort(db),
    sessionReceiverPortMin: MIN_SESSION_PORT,
    sessionReceiverPortMax: MAX_SESSION_PORT,
    sessionReceiverToken: getSessionReceiverToken(db),
    apiWorkflowGlobalParams: getApiWorkflowGlobalParams(db),
    apiWorkflowParamLayerOrder: getApiWorkflowParamLayerOrder(db)
  }
}
