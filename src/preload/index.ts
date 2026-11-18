import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppData, TimeTrackerApi } from '../shared/types'

const api: TimeTrackerApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  startTimer: (input) => ipcRenderer.invoke(IPC.startTimer, input),
  stopTimer: () => ipcRenderer.invoke(IPC.stopTimer),
  addEntry: (input) => ipcRenderer.invoke(IPC.addEntry, input),
  updateEntry: (id, patch) => ipcRenderer.invoke(IPC.updateEntry, id, patch),
  deleteEntry: (id) => ipcRenderer.invoke(IPC.deleteEntry, id),
  addProject: (input) => ipcRenderer.invoke(IPC.addProject, input),
  updateProject: (id, patch) => ipcRenderer.invoke(IPC.updateProject, id, patch),
  deleteProject: (id) => ipcRenderer.invoke(IPC.deleteProject, id),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  exportCsv: (request) => ipcRenderer.invoke(IPC.exportCsv, request),
  revealDataFile: () => ipcRenderer.invoke(IPC.revealDataFile),
  onStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppData): void => listener(state)
    ipcRenderer.on(IPC.stateChanged, handler)
    return () => {
      ipcRenderer.removeListener(IPC.stateChanged, handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
