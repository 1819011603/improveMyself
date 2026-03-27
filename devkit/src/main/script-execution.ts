import { BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getExecutionHistoryMaxCount, getExecutionOutputMaxBytes } from './app-settings'
import {
  executionBufferAppend,
  executionBufferDispose,
  executionBufferInit,
  executionBufferSetPid
} from './execution-buffer'
import { pruneFinishedExecutionLogs, truncateExecutionOutputUtf8 } from './execution-log-maintenance'
import { toIpcReply } from '../shared/ipc-clone'
import { IPC } from '../shared/types'
import type { Script, ScriptInterpreter } from '../shared/types'

export const runningProcesses = new Map<string, ChildProcess>()

const defaultScriptInterpreter: ScriptInterpreter =
  process.platform === 'win32' ? 'powershell' : 'bash'

function getOutputTargets(outputWebContents: Electron.WebContents | null | undefined): Electron.WebContents[] {
  if (outputWebContents) return [outputWebContents]
  return BrowserWindow.getAllWindows().map((w) => w.webContents)
}

function broadcastTaskListChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.TASK_LIST_CHANGED)
  }
}

function broadcastTaskRunAlert(payload: {
  taskId: string
  taskName: string
  exitCode: number
  executionId: string
  scriptName: string
}): void {
  const data = toIpcReply(payload)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.TASK_RUN_ALERT, data)
  }
}

/**
 * 启动脚本子进程：手动运行（单窗口推送输出）或定时任务（全窗口广播 + task_id 落库）
 */
export function startScriptExecution(opts: {
  db: Database.Database
  script: Script
  params: Record<string, string>
  debug?: { content?: string; interpreter?: ScriptInterpreter }
  taskId?: string | null
  /** 手动运行传入当前 WebContents；定时任务传 null 以广播所有窗口 */
  outputWebContents: Electron.WebContents | null
}): { executionId: string; pid: number | null } {
  const { db, script, params, debug = {}, taskId = null, outputWebContents } = opts
  const id = script.id

  const platform = process.platform === 'win32' ? 'windows' : 'macos'
  const config = script.platforms[platform]
  const hasDebugBody = debug.content != null && String(debug.content).trim().length > 0
  if (!config && !hasDebugBody) throw new Error(`No ${platform} version for this script`)

  const rawTemplate = hasDebugBody ? String(debug.content) : (config?.content ?? '')
  if (!rawTemplate.trim()) throw new Error('脚本内容为空')

  const interpreter: ScriptInterpreter = hasDebugBody
    ? debug.interpreter ?? config?.interpreter ?? defaultScriptInterpreter
    : config!.interpreter

  let content = rawTemplate
  for (const [key, val] of Object.entries(params)) {
    content = content.replaceAll(`{{${key}}}`, val)
  }

  /** 管道输出按 UTF-8，避免中文 Windows 默认代码页在终端里乱码 */
  if (interpreter === 'powershell' && process.platform === 'win32') {
    content =
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)' 
      +'\n' +
       ' $OutputEncoding = [Console]::OutputEncoding' +
      '\n' +
      content
  }

  const executionId = randomUUID()
  const startedAt = new Date().toISOString()

  db.prepare(`
      INSERT INTO execution_logs (id, script_id, task_id, started_at, params, output)
      VALUES (?, ?, ?, ?, ?, '')
    `).run(executionId, id, taskId, startedAt, JSON.stringify(params))

  executionBufferInit(executionId, undefined)

  const targets = getOutputTargets(outputWebContents)

  const interpreterMap: Record<string, string[]> = {
    bash: ['bash', '-c'],
    zsh: ['zsh', '-c'],
    python: ['python3', '-c'],
    node: ['node', '-e'],
    powershell: ['powershell', '-NoProfile', '-Command'],
    cmd: ['cmd', '/c']
  }
  const [cmd, ...spawnArgs] =
    interpreterMap[interpreter] || interpreterMap[defaultScriptInterpreter]
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
    const ipcPayload = toIpcReply(payload)
    for (const wc of targets) {
      try {
        wc.send(IPC.SCRIPT_OUTPUT, ipcPayload)
      } catch {
        /* 窗口已关闭 */
      }
    }
  }

  child.stdout.on('data', (data: Buffer) => sendOutput(data.toString()))
  child.stderr.on('data', (data: Buffer) => sendOutput(data.toString()))

  /** Windows 上部分 PowerShell/管道场景下 stdio 句柄未释放会导致 `close` 永不触发；`exit` 仍会在进程结束时触发 */
  let settled = false
  const finalize = (code: number | null, signal?: NodeJS.Signals) => {
    if (settled) return
    settled = true
    const exitCode = code === null ? (signal ? -1 : 0) : code

    runningProcesses.delete(executionId)
    executionBufferDispose(executionId)
    const finishedAt = new Date().toISOString()
    const storedOutput = truncateExecutionOutputUtf8(output, getExecutionOutputMaxBytes(db))
    db.prepare(`
        UPDATE execution_logs SET finished_at = ?, exit_code = ?, output = ? WHERE id = ?
      `).run(finishedAt, exitCode, storedOutput, executionId)
    pruneFinishedExecutionLogs(db, getExecutionHistoryMaxCount(db))

    if (taskId) {
      const status = exitCode === 0 ? 'success' : 'error'
      db.prepare(`UPDATE scheduled_tasks SET last_run_at = ?, last_status = ? WHERE id = ?`).run(
        finishedAt,
        status,
        taskId
      )
      broadcastTaskListChanged()
      if (exitCode !== 0) {
        const trow = db.prepare(`SELECT name FROM scheduled_tasks WHERE id = ?`).get(taskId) as
          | { name: string }
          | undefined
        broadcastTaskRunAlert({
          taskId,
          taskName: trow?.name ?? taskId,
          exitCode,
          executionId,
          scriptName: script.name
        })
      }
    }

    sendOutput('', true, exitCode)
  }

  child.on('exit', (code, signal) => finalize(code, signal))
  child.on('error', (err) => {
    sendOutput(`\n[spawn error] ${err.message}\n`)
    finalize(1)
  })

  return { executionId, pid: pid ?? null }
}
