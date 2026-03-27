import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import cron from 'node-cron'
import { getDb } from '../db'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type { ScheduledTask } from '../../shared/types'

// Track active cron jobs: taskId -> cron.ScheduledTask
const cronJobs = new Map<string, cron.ScheduledTask>()

function rowToTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    scriptId: row.script_id as string,
    cron: row.cron as string,
    enabled: (row.enabled as number) === 1,
    params: JSON.parse(row.params as string),
    lastRunAt: row.last_run_at as string | undefined,
    lastStatus: row.last_status as ScheduledTask['lastStatus'],
    createdAt: row.created_at as string
  }
}

function scheduleTask(task: ScheduledTask): void {
  if (cronJobs.has(task.id)) {
    cronJobs.get(task.id)!.stop()
    cronJobs.delete(task.id)
  }
  if (!task.enabled) return
  if (!cron.validate(task.cron)) return

  const job = cron.schedule(task.cron, () => {
    triggerTask(task.id)
  })
  cronJobs.set(task.id, job)
}

async function triggerTask(taskId: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined
  if (!row) return

  const task = rowToTask(row)
  const now = new Date().toISOString()
  db.prepare('UPDATE scheduled_tasks SET last_run_at = ?, last_status = ? WHERE id = ?').run(now, 'running', taskId)

  // Notify all windows
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.TASK_LIST)
  }

  // Trigger via IPC reuse - send to main handler
  ipcMain.emit(IPC.SCRIPT_RUN, { sender: { send: () => {} } }, task.scriptId, task.params)
}

export function initScheduler(): void {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all() as Record<string, unknown>[]
  for (const row of rows) {
    scheduleTask(rowToTask(row))
  }
}

export function registerSchedulerHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.TASK_LIST, () => {
    return toIpcReply(
      (db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(rowToTask)
    )
  })

  ipcMain.handle(IPC.TASK_CREATE, (_e, data: Omit<ScheduledTask, 'id' | 'createdAt'>) => {
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO scheduled_tasks (id, name, description, script_id, cron, enabled, params, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.description, data.scriptId, data.cron, data.enabled ? 1 : 0, JSON.stringify(data.params), now)

    const task = rowToTask(db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as Record<string, unknown>)
    scheduleTask(task)
    return toIpcReply(task)
  })

  ipcMain.handle(IPC.TASK_UPDATE, (_e, id: string, data: Partial<ScheduledTask>) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.cron !== undefined) { fields.push('cron = ?'); values.push(data.cron) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }
    if (data.params !== undefined) { fields.push('params = ?'); values.push(JSON.stringify(data.params)) }

    values.push(id)
    db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    const task = rowToTask(db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as Record<string, unknown>)
    scheduleTask(task)
    return toIpcReply(task)
  })

  ipcMain.handle(IPC.TASK_TOGGLE, (_e, id: string) => {
    const row = db.prepare('SELECT enabled FROM scheduled_tasks WHERE id = ?').get(id) as { enabled: number }
    const newEnabled = row.enabled === 1 ? 0 : 1
    db.prepare('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?').run(newEnabled, id)

    const task = rowToTask(db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as Record<string, unknown>)
    scheduleTask(task)
    return toIpcReply(task)
  })

  ipcMain.handle(IPC.TASK_DELETE, (_e, id: string) => {
    if (cronJobs.has(id)) {
      cronJobs.get(id)!.stop()
      cronJobs.delete(id)
    }
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle(IPC.TASK_RUN_NOW, (_e, id: string) => {
    triggerTask(id)
    return true
  })
}
