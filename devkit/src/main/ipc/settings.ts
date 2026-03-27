import { ipcMain } from 'electron'
import { getDb } from '../db'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import {
  getSettingsSnapshot,
  setExecutionHistoryMaxCount,
  setExecutionOutputMaxBytes
} from '../app-settings'

export function registerSettingsHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return toIpcReply(getSettingsSnapshot())
  })

  ipcMain.handle(
    IPC.SETTINGS_SET,
    (_e, partial: { executionHistoryMaxCount?: number; executionOutputMaxBytes?: number }) => {
      if (partial.executionHistoryMaxCount !== undefined) {
        setExecutionHistoryMaxCount(db, partial.executionHistoryMaxCount)
      }
      if (partial.executionOutputMaxBytes !== undefined) {
        setExecutionOutputMaxBytes(db, partial.executionOutputMaxBytes)
      }
      return toIpcReply(getSettingsSnapshot())
    }
  )
}
