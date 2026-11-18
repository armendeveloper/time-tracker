import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { entriesForExport, entriesToCsv } from '../shared/csv'
import { IPC } from '../shared/ipc'
import { dayKey } from '../shared/time'
import type { AppData, AppInfo, ExportRequest, ExportResult } from '../shared/types'
import { DataStore, ValidationError } from './store'
import { AppTray } from './tray'
import appIcon from '../../resources/icon.png?asset'

const APP_ID = 'com.timetracker.desktop'

// Lets tests (and power users) keep data in a separate folder.
if (process.env.TIME_TRACKER_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.TIME_TRACKER_USER_DATA))
}

let mainWindow: BrowserWindow | null = null
let tray: AppTray | null = null
let store: DataStore
let isQuitting = false

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function isTrustedUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Time Tracker',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (event) => {
    if (!isQuitting && store.getState().settings.closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Never open new windows inside the app; send web links to the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function broadcast(state: AppData): void {
  mainWindow?.webContents.send(IPC.stateChanged, state)
  tray?.update(state)
}

/** Registers an IPC handler that only answers our own window and turns errors into readable messages. */
function handle<Args extends unknown[], Result>(
  channel: string,
  handler: (...args: Args) => Promise<Result> | Result
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const senderUrl = event.senderFrame?.url ?? ''
    if (!isTrustedUrl(senderUrl)) throw new Error('Blocked IPC call from an untrusted page.')
    try {
      return await handler(...(args as Args))
    } catch (error) {
      if (error instanceof ValidationError) throw new Error(error.message)
      console.error(`IPC ${channel} failed:`, error)
      throw new Error('Something went wrong while saving. Please try again.')
    }
  })
}

/** Registers a handler for a call that changes data and notifies the window and tray. */
function handleMutation<Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => Promise<AppData>
): void {
  handle(channel, async (...args: Args) => {
    const state = await handler(...args)
    broadcast(state)
    return state
  })
}

async function exportCsv(request: ExportRequest): Promise<ExportResult> {
  const from = new Date(request?.from)
  const to = new Date(request?.to)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new ValidationError('Invalid export range.')
  }
  const state = store.getState()
  const range = { from, to }
  const count = entriesForExport(state.entries, range).length
  if (count === 0) throw new ValidationError('There are no finished entries in this period.')

  const lastDay = new Date(to.getTime() - 1)
  const defaultName = `time-entries_${dayKey(from)}_${dayKey(lastDay)}.csv`
  const options = {
    title: 'Export time entries',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'CSV file', extensions: ['csv'] }]
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false }

  // The BOM makes Excel read the file as UTF-8.
  await fs.writeFile(result.filePath, '﻿' + entriesToCsv(state.entries, state.projects, range), 'utf8')
  return { saved: true, filePath: result.filePath, count }
}

function registerIpc(): void {
  handle(IPC.getState, () => store.getState())
  handle(IPC.getAppInfo, (): AppInfo => ({ version: app.getVersion(), dataFilePath: store.filePath }))
  handleMutation(IPC.startTimer, (input) => store.startTimer(input as never))
  handleMutation(IPC.stopTimer, () => store.stopTimer())
  handleMutation(IPC.addEntry, (input) => store.addEntry(input as never))
  handleMutation(IPC.updateEntry, (id, patch) => store.updateEntry(String(id), patch as never))
  handleMutation(IPC.deleteEntry, (id) => store.deleteEntry(String(id)))
  handleMutation(IPC.addProject, (input) => store.addProject(input as never))
  handleMutation(IPC.updateProject, (id, patch) => store.updateProject(String(id), patch as never))
  handleMutation(IPC.deleteProject, (id) => store.deleteProject(String(id)))
  handleMutation(IPC.updateSettings, (patch) => store.updateSettings(patch as never))
  handle(IPC.exportCsv, (request) => exportCsv(request as ExportRequest))
  handle(IPC.revealDataFile, () => shell.showItemInFolder(store.filePath))
}

async function runFromTray(action: () => Promise<AppData>): Promise<void> {
  try {
    broadcast(await action())
  } catch (error) {
    console.error('Tray action failed:', error)
  }
}

function createTray(): void {
  tray = new AppTray({
    showWindow,
    startNew: () => void runFromTray(() => store.startTimer({ description: '', projectId: null })),
    continueLast: () =>
      void runFromTray(() => {
        const last = store
          .getState()
          .entries.filter((e) => e.end !== null)
          .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0]
        return store.startTimer({ description: last?.description ?? '', projectId: last?.projectId ?? null })
      }),
    stopTimer: () => void runFromTray(() => store.stopTimer()),
    quit: () => {
      isQuitting = true
      app.quit()
    }
  })
  tray.update(store.getState())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    // With close-to-tray off, closing the window quits the app (except on macOS).
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', showWindow)

  app.on('will-quit', () => {
    tray?.destroy()
    tray = null
  })

  void app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
    try {
      store = await DataStore.open(path.join(app.getPath('userData'), 'data.json'))
    } catch (error) {
      dialog.showErrorBox('Time Tracker', `Could not load your data.\n\n${String(error)}`)
      app.exit(1)
      return
    }
    registerIpc()
    createWindow()
    createTray()
  })
}
