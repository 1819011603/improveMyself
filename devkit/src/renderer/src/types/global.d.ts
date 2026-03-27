import type {
  AppSettingsSnapshot,
  Script,
  ScriptInterpreter,
  CheatsheetEntry,
  ScheduledTask,
  ExecutionLog,
  ExecutionLogListItem
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

      executionLogList(opts?: { limit?: number }): Promise<ExecutionLogListItem[]>
      executionLogGet(id: string): Promise<ExecutionLog | null>

      settingsGet(): Promise<AppSettingsSnapshot>
      settingsSet(partial: {
        executionHistoryMaxCount?: number
        executionOutputMaxBytes?: number
      }): Promise<AppSettingsSnapshot>
    }
  }
}
