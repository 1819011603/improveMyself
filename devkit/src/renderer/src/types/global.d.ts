import type {
  AppSettingsSnapshot,
  Script,
  ScriptInterpreter,
  CheatsheetEntry,
  ScheduledTask,
  ExecutionLog,
  ExecutionLogListItem,
  ExecutionLogListQuery,
  ApiEnvironment,
  ApiWorkflow,
  ApiWorkflowRunResult,
  ApiWorkflowTryStepResult,
  ApiHttpHostEnv,
  ApiWorkflowParamLayer
} from '@shared/types'

declare global {
  interface Window {
    api: {
      // Scripts
      scriptList(opts?: { search?: string; tags?: string[] }): Promise<Script[]>
      scriptGet(id: string): Promise<Script | null>
      scriptCreate(data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>): Promise<Script>
      scriptUpdate(id: string, data: Partial<Script>): Promise<Script>
      scriptDelete(id: string): Promise<boolean>
      scriptRun(
        id: string,
        params?: Record<string, string>,
        debug?: { content?: string; interpreter?: ScriptInterpreter }
      ): Promise<{ executionId: string; pid: number | null }>
      scriptExecutionBuffer(executionId: string): Promise<{ output: string; pid: number | undefined }>
      scriptKill(executionId: string): Promise<boolean>
      onScriptOutput(cb: (p: { executionId: string; data: string; done: boolean; exitCode?: number }) => void): () => void

      // Cheatsheet
      cheatsheetList(opts?: { search?: string; category?: string }): Promise<CheatsheetEntry[]>
      cheatsheetCreate(data: Omit<CheatsheetEntry, 'id' | 'isBuiltin'>): Promise<CheatsheetEntry>
      cheatsheetDelete(id: string): Promise<boolean>

      // Scheduler
      taskList(): Promise<ScheduledTask[]>
      taskCreate(data: Omit<ScheduledTask, 'id' | 'createdAt'>): Promise<ScheduledTask>
      taskUpdate(id: string, data: Partial<ScheduledTask>): Promise<ScheduledTask>
      taskDelete(id: string): Promise<boolean>
      taskToggle(id: string): Promise<ScheduledTask>
      taskRunNow(id: string): Promise<boolean>
      onTaskListChanged(cb: () => void): () => void
      onTaskRunAlert(
        cb: (p: {
          taskId: string
          taskName: string
          exitCode: number
          executionId: string
          scriptName: string
        }) => void
      ): () => void

      executionLogList(opts?: ExecutionLogListQuery): Promise<ExecutionLogListItem[]>
      executionLogGet(id: string): Promise<ExecutionLog | null>

      settingsGet(): Promise<AppSettingsSnapshot>
      settingsSet(partial: {
        executionHistoryMaxCount?: number
        executionOutputMaxBytes?: number
        sessionReceiverEnabled?: boolean
        sessionReceiverPort?: number
        sessionReceiverToken?: string
        apiWorkflowGlobalParams?: Record<string, string>
        apiWorkflowParamLayerOrder?: ApiWorkflowParamLayer[]
      }): Promise<AppSettingsSnapshot>

      apiEnvList(): Promise<ApiEnvironment[]>
      apiEnvGet(id: string): Promise<ApiEnvironment | null>
      apiEnvCreate(data: { name: string; bundle: unknown }): Promise<ApiEnvironment>
      apiEnvImportJson(data: { name: string; json: string }): Promise<ApiEnvironment>
      apiEnvUpdate(id: string, data: { name?: string; bundle?: unknown }): Promise<ApiEnvironment>
      apiEnvDelete(id: string): Promise<boolean>
      apiWorkflowList(): Promise<ApiWorkflow[]>
      apiWorkflowGet(id: string): Promise<ApiWorkflow | null>
      apiWorkflowCreate(data: unknown): Promise<ApiWorkflow>
      apiWorkflowUpdate(id: string, data: unknown): Promise<ApiWorkflow>
      apiWorkflowDelete(id: string): Promise<boolean>
      apiWorkflowRun(id: string, opts?: { httpHostEnv?: ApiHttpHostEnv }): Promise<ApiWorkflowRunResult>
      apiWorkflowTryStep(
        step: unknown,
        opts?: { httpHostEnv?: ApiHttpHostEnv }
      ): Promise<ApiWorkflowTryStepResult>
      apiWorkflowTryStepCurl(
        step: unknown,
        opts?: { httpHostEnv?: ApiHttpHostEnv }
      ): Promise<{ curl: string } | { error: string }>
    }
  }
}
