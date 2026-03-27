import { ipcMain } from 'electron'
import { getDb } from '../db'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import {
  getSettingsSnapshot,
  setExecutionHistoryMaxCount,
  setExecutionOutputMaxBytes,
  setSessionReceiverEnabled,
  setSessionReceiverPort,
  setSessionReceiverToken,
  setApiWorkflowGlobalParams,
  setApiWorkflowParamLayerOrder
} from '../app-settings'
import type { ApiWorkflowParamLayer } from '../../shared/types/api-workflow'
import { restartSessionReceiver } from '../session-receiver'

export function registerSettingsHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return toIpcReply(getSettingsSnapshot())
  })

  ipcMain.handle(
    IPC.SETTINGS_SET,
    (
      _e,
      partial: {
        executionHistoryMaxCount?: number
        executionOutputMaxBytes?: number
        sessionReceiverEnabled?: boolean
        sessionReceiverPort?: number
        sessionReceiverToken?: string
        apiWorkflowGlobalParams?: Record<string, string>
        apiWorkflowParamLayerOrder?: ApiWorkflowParamLayer[]
      }
    ) => {
      if (partial.executionHistoryMaxCount !== undefined) {
        setExecutionHistoryMaxCount(db, partial.executionHistoryMaxCount)
      }
      if (partial.executionOutputMaxBytes !== undefined) {
        setExecutionOutputMaxBytes(db, partial.executionOutputMaxBytes)
      }
      if (partial.sessionReceiverEnabled !== undefined) {
        setSessionReceiverEnabled(db, partial.sessionReceiverEnabled)
      }
      if (partial.sessionReceiverPort !== undefined) {
        setSessionReceiverPort(db, partial.sessionReceiverPort)
      }
      if (partial.sessionReceiverToken !== undefined) {
        setSessionReceiverToken(db, partial.sessionReceiverToken)
      }
      if (partial.apiWorkflowGlobalParams !== undefined) {
        setApiWorkflowGlobalParams(db, partial.apiWorkflowGlobalParams)
      }
      if (partial.apiWorkflowParamLayerOrder !== undefined) {
        setApiWorkflowParamLayerOrder(db, partial.apiWorkflowParamLayerOrder)
      }
      restartSessionReceiver()
      return toIpcReply(getSettingsSnapshot())
    }
  )
}
