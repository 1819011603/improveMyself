import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, closeDb } from './db'
import { registerScriptHandlers } from './ipc/scripts'
import { registerCheatsheetHandlers, seedBuiltinCheatsheet } from './ipc/cheatsheet'
import { registerSchedulerHandlers, initScheduler } from './ipc/scheduler'
import { registerSettingsHandlers } from './ipc/settings'
import { registerExecutionLogHandlers } from './ipc/execution-logs'

process.on('unhandledRejection', (reason) => {
  console.error('[DevKit main] unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[DevKit main] uncaughtException:', err)
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('preload-error', (_ev, preloadPath, error) => {
    console.error('[DevKit preload-error]', preloadPath, error)
  })
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    win.webContents.on('console-message', (_event, level, message) => {
      const labels = ['verbose', 'info', 'warning', 'error'] as const
      const label = labels[level] ?? `level-${level}`
      console.log(`[DevKit renderer ${label}]`, message)
    })
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devkit')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  // Init database
  initDb()

  // Register IPC handlers
  registerScriptHandlers()
  registerCheatsheetHandlers()
  registerSchedulerHandlers()
  registerSettingsHandlers()
  registerExecutionLogHandlers()

  // Seed built-in cheatsheet data
  seedBuiltinCheatsheet()

  // Start cron scheduler
  initScheduler()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
