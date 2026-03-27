import type { ApiWorkflowParamLayer } from './api-workflow'

export type { SessionBundle, SessionBundleCookie, SessionBundleHeaderRule } from './api-workflow'
export type {
  ApiEnvironment,
  ApiWorkflow,
  ApiWorkflowStep,
  ApiWorkflowRunResult,
  ApiWorkflowRunStepResult,
  ApiWorkflowRunContext,
  ApiHttpHostEnv,
  ApiWorkflowParamLayer,
  ApiWorkflowRunOptions,
  ApiWorkflowTryStepInput,
  ApiWorkflowTryStepResult
} from './api-workflow'
export { SESSION_BUNDLE_VERSION } from './api-workflow'

export type Platform = 'macos' | 'windows'

export type ScriptInterpreter = 'bash' | 'zsh' | 'python' | 'node' | 'powershell' | 'cmd'

export interface ScriptParam {
  name: string
  description: string
  defaultValue?: string
  required?: boolean
}

export interface ScriptPlatformConfig {
  content: string
  interpreter: ScriptInterpreter
}

export interface Script {
  id: string
  name: string
  description: string
  tags: string[]
  platforms: {
    macos?: ScriptPlatformConfig
    windows?: ScriptPlatformConfig
  }
  params: ScriptParam[]
  createdAt: string
  updatedAt: string
  /** 最近一次已完成执行（有 finished_at）的结束时间 */
  lastExecutedAt?: string
  /** 最近一次已完成执行的耗时（ms） */
  lastRunDurationMs?: number
}

export type TaskStatus = 'idle' | 'running' | 'success' | 'error'

export interface ScheduledTask {
  id: string
  name: string
  description: string
  scriptId: string
  cron: string
  enabled: boolean
  params: Record<string, string>
  lastRunAt?: string
  lastStatus?: TaskStatus
  createdAt: string
}

export interface ExecutionLog {
  id: string
  scriptId?: string
  taskId?: string
  startedAt: string
  finishedAt?: string
  exitCode?: number
  output: string
  params: Record<string, string>
}

/** 执行记录列表（不含 output 全文） */
export interface ExecutionLogListItem {
  id: string
  scriptId?: string
  scriptName?: string
  taskId?: string
  taskName?: string
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  params: Record<string, string>
}

/** 执行记录列表筛选（主进程 LOG_LIST） */
export type ExecutionLogStatusFilter = 'all' | 'success' | 'error' | 'running'
export type ExecutionLogSourceFilter = 'all' | 'script' | 'task'

export interface ExecutionLogListQuery {
  limit?: number
  /** 成功：已结束且 exit_code=0；失败：已结束且 exit_code≠0；进行中：无 finished_at */
  status?: ExecutionLogStatusFilter
  /** 仅脚本手动运行 / 仅定时任务触发 */
  source?: ExecutionLogSourceFilter
  /** 仅某条定时任务 */
  taskId?: string
  /** 匹配脚本名、定时任务名或记录 id 片段 */
  search?: string
}

export type CheatsheetCategory =
  | 'git'
  | 'docker'
  | 'macos'
  | 'terminal'
  | 'vim'
  | 'network'
  | 'process'
  | 'custom'

export interface CheatsheetEntry {
  id: string
  category: CheatsheetCategory
  command: string
  description: string
  tags: string[]
  platform?: Platform | 'all'
  isBuiltin: boolean
}

export interface Snippet {
  id: string
  name: string
  description: string
  content: string
  language: string
  tags: string[]
  createdAt: string
}

/** 设置页可读写的应用设置 */
export interface AppSettingsSnapshot {
  executionHistoryMaxCount: number
  executionHistoryMin: number
  executionHistoryMax: number
  /** 单条执行日志允许的最大体积（字节），超出则保留 UTF-8 末尾 */
  executionOutputMaxBytes: number
  executionOutputMinBytes: number
  executionOutputLimitMaxBytes: number
  /** 本机接收 Chrome 扩展推送的环境包（仅 127.0.0.1） */
  sessionReceiverEnabled: boolean
  sessionReceiverPort: number
  sessionReceiverPortMin: number
  sessionReceiverPortMax: number
  /** 非空则扩展请求需带相同 Bearer / X-DevKit-Token */
  sessionReceiverToken: string
  /** HTTP 编排：全局扁平参数（键将合并进请求头，合法 token 名） */
  apiWorkflowGlobalParams: Record<string, string>
  /** 合并顺序：从左到右叠加，后者覆盖前者；默认 step→global→push（推送优先） */
  apiWorkflowParamLayerOrder: ApiWorkflowParamLayer[]
}

// IPC channel names
export const IPC = {
  // Scripts
  SCRIPT_LIST: 'script:list',
  SCRIPT_GET: 'script:get',
  SCRIPT_CREATE: 'script:create',
  SCRIPT_UPDATE: 'script:update',
  SCRIPT_DELETE: 'script:delete',
  SCRIPT_RUN: 'script:run',
  SCRIPT_KILL: 'script:kill',
  SCRIPT_OUTPUT: 'script:output',  // pushed from main to renderer
  /** 运行中按 executionId 取输出缓冲与 spawn_pid（结束后为空） */
  SCRIPT_EXECUTION_BUFFER: 'script:executionBuffer',

  // Cheatsheet
  CHEATSHEET_LIST: 'cheatsheet:list',
  CHEATSHEET_CREATE: 'cheatsheet:create',
  CHEATSHEET_DELETE: 'cheatsheet:delete',

  // Scheduler
  TASK_LIST: 'task:list',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_TOGGLE: 'task:toggle',
  TASK_RUN_NOW: 'task:runNow',
  /** 定时任务状态或列表有变，渲染进程可刷新任务列表 */
  TASK_LIST_CHANGED: 'task:listChanged',
  /** 定时任务本次执行失败（非 0 退出码），用于桌面提醒 */
  TASK_RUN_ALERT: 'task:runAlert',

  // Logs
  LOG_LIST: 'log:list',
  LOG_GET: 'log:get',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // API workflow (HTTP 编排 / 环境)
  API_ENV_LIST: 'apiEnv:list',
  API_ENV_GET: 'apiEnv:get',
  API_ENV_CREATE: 'apiEnv:create',
  API_ENV_UPDATE: 'apiEnv:update',
  API_ENV_DELETE: 'apiEnv:delete',
  API_ENV_IMPORT_JSON: 'apiEnv:importJson',
  API_WORKFLOW_LIST: 'apiWorkflow:list',
  API_WORKFLOW_GET: 'apiWorkflow:get',
  API_WORKFLOW_CREATE: 'apiWorkflow:create',
  API_WORKFLOW_UPDATE: 'apiWorkflow:update',
  API_WORKFLOW_DELETE: 'apiWorkflow:delete',
  API_WORKFLOW_RUN: 'apiWorkflow:run',
  API_WORKFLOW_TRY_STEP: 'apiWorkflow:tryStep',
  API_WORKFLOW_TRY_STEP_CURL: 'apiWorkflow:tryStepCurl'
} as const
