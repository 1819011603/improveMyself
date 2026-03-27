import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getExecutionHistoryMaxCount } from '../app-settings'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type { ExecutionLog, ExecutionLogListItem } from '../../shared/types'

function rowToListItem(row: Record<string, unknown>): ExecutionLogListItem {
  return {
    id: row.id as string,
    scriptId: (row.script_id as string) ?? undefined,
    scriptName: (row.script_name as string) ?? undefined,
    taskId: (row.task_id as string) ?? undefined,
    taskName: (row.task_name as string) ?? undefined,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? undefined,
    exitCode: row.exit_code === null || row.exit_code === undefined ? null : (row.exit_code as number),
    params: JSON.parse((row.params as string) || '{}')
  }
}

function rowToFullLog(row: Record<string, unknown>): ExecutionLog {
  return {
    id: row.id as string,
    scriptId: (row.script_id as string) ?? undefined,
    taskId: (row.task_id as string) ?? undefined,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? undefined,
    exitCode: row.exit_code === null || row.exit_code === undefined ? undefined : (row.exit_code as number),
    output: (row.output as string) ?? '',
    params: JSON.parse((row.params as string) || '{}')
  }
}

export function registerExecutionLogHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.LOG_LIST, (_e, opts: { limit?: number } = {}) => {
    const max = getExecutionHistoryMaxCount(db)
    const limit = Math.min(Math.max(1, opts.limit ?? max), 2000)
    const rows = db
      .prepare(
        `
      SELECT
        e.id,
        e.script_id,
        e.task_id,
        e.started_at,
        e.finished_at,
        e.exit_code,
        e.params,
        s.name AS script_name,
        t.name AS task_name
      FROM execution_logs e
      LEFT JOIN scripts s ON e.script_id = s.id
      LEFT JOIN scheduled_tasks t ON e.task_id = t.id
      ORDER BY e.started_at DESC
      LIMIT ?
    `
      )
      .all(limit) as Record<string, unknown>[]
    return toIpcReply(rows.map(rowToListItem))
  })

  ipcMain.handle(IPC.LOG_GET, (_e, id: string) => {
    const row = db
      .prepare(
        `
      SELECT e.id, e.script_id, e.task_id, e.started_at, e.finished_at, e.exit_code, e.output, e.params
      FROM execution_logs e
      WHERE e.id = ?
    `
      )
      .get(id) as Record<string, unknown> | undefined
    return row ? toIpcReply(rowToFullLog(row)) : null
  })
}
