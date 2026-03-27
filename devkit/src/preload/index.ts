import { contextBridge, ipcRenderer } from 'electron'
import { cloneForIpc } from '../shared/ipc-clone'
import { IPC } from '../shared/types'

/**
 * 不向 ipcRenderer.invoke 传入「作为独立参数的 undefined」。
 * 部分 Chromium/Electron 版本对参数做结构化克隆时，undefined 会触发
 * "An object could not be cloned" 或静默失败；对象位统一用 {} 占位。
 */
function invokeTwo<A>(channel: string, a: A): Promise<unknown> {
  return ipcRenderer.invoke(channel, a)
}

function invokeThree<A, B>(channel: string, a: A, b: B): Promise<unknown> {
  return ipcRenderer.invoke(channel, a, b)
}

// Expose IPC bridge to renderer
contextBridge.exposeInMainWorld('api', {
  // Scripts
  scriptList: (opts?: { search?: string; tags?: string[] }) =>
    invokeTwo(IPC.SCRIPT_LIST, cloneForIpc(opts ?? {})),
  scriptGet: (id: string) => invokeTwo(IPC.SCRIPT_GET, id),
  scriptCreate: (data: unknown) => {
    if (data === null || typeof data !== 'object') {
      console.error('[preload] scriptCreate 需要对象 payload，收到:', typeof data, data)
      return Promise.reject(new Error('scriptCreate: 无效的保存数据'))
    }
    return invokeTwo(IPC.SCRIPT_CREATE, cloneForIpc(data))
  },
  scriptUpdate: (id: string, data: unknown) => {
    if (data === null || typeof data !== 'object') {
      console.error('[preload] scriptUpdate 需要对象 payload，收到:', typeof data, data)
      return Promise.reject(new Error('scriptUpdate: 无效的更新数据'))
    }
    return invokeThree(IPC.SCRIPT_UPDATE, id, cloneForIpc(data))
  },
  scriptDelete: (id: string) => invokeTwo(IPC.SCRIPT_DELETE, id),
  scriptRun: (
    id: string,
    params?: Record<string, string>,
    debug?: { content?: string; interpreter?: string }
  ) =>
    ipcRenderer.invoke(IPC.SCRIPT_RUN, id, cloneForIpc(params ?? {}), cloneForIpc(debug ?? {})),
  scriptExecutionBuffer: (executionId: string) => invokeTwo(IPC.SCRIPT_EXECUTION_BUFFER, executionId),
  scriptKill: (executionId: string) => invokeTwo(IPC.SCRIPT_KILL, executionId),
  onScriptOutput: (cb: (payload: { executionId: string; data: string; done: boolean; exitCode?: number }) => void) => {
    ipcRenderer.on(IPC.SCRIPT_OUTPUT, (_e, payload) => {
      try {
        cb(payload)
      } catch (e) {
        console.error('[preload] onScriptOutput 回调异常', e)
      }
    })
    return () => ipcRenderer.removeAllListeners(IPC.SCRIPT_OUTPUT)
  },

  // Cheatsheet
  cheatsheetList: (opts?: { search?: string; category?: string }) =>
    invokeTwo(IPC.CHEATSHEET_LIST, cloneForIpc(opts ?? {})),
  cheatsheetCreate: (data: unknown) => {
    if (data === null || typeof data !== 'object') {
      console.error('[preload] cheatsheetCreate 需要对象 payload', data)
      return Promise.reject(new Error('cheatsheetCreate: 无效数据'))
    }
    return invokeTwo(IPC.CHEATSHEET_CREATE, cloneForIpc(data))
  },
  cheatsheetDelete: (id: string) => invokeTwo(IPC.CHEATSHEET_DELETE, id),

  // Scheduler
  taskList: () => ipcRenderer.invoke(IPC.TASK_LIST),
  taskCreate: (data: unknown) => {
    if (data === null || typeof data !== 'object') {
      console.error('[preload] taskCreate 需要对象 payload', data)
      return Promise.reject(new Error('taskCreate: 无效数据'))
    }
    return invokeTwo(IPC.TASK_CREATE, cloneForIpc(data))
  },
  taskUpdate: (id: string, data: unknown) => {
    if (data === null || typeof data !== 'object') {
      console.error('[preload] taskUpdate 需要对象 payload', data)
      return Promise.reject(new Error('taskUpdate: 无效数据'))
    }
    return invokeThree(IPC.TASK_UPDATE, id, cloneForIpc(data))
  },
  taskDelete: (id: string) => invokeTwo(IPC.TASK_DELETE, id),
  taskToggle: (id: string) => invokeTwo(IPC.TASK_TOGGLE, id),
  taskRunNow: (id: string) => invokeTwo(IPC.TASK_RUN_NOW, id),

  // Settings
  settingsGet: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  settingsSet: (partial: { executionHistoryMaxCount?: number; executionOutputMaxBytes?: number }) =>
    invokeTwo(IPC.SETTINGS_SET, cloneForIpc(partial ?? {}))
})

// Type declaration merged in renderer
