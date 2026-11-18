/** IPC channel names shared by the main process and the preload script. */
export const IPC = {
  getState: 'state:get',
  getAppInfo: 'app:info',
  stateChanged: 'state:changed',
  startTimer: 'timer:start',
  stopTimer: 'timer:stop',
  addEntry: 'entry:add',
  updateEntry: 'entry:update',
  deleteEntry: 'entry:delete',
  addProject: 'project:add',
  updateProject: 'project:update',
  deleteProject: 'project:delete',
  updateSettings: 'settings:update',
  exportCsv: 'export:csv',
  revealDataFile: 'data:reveal'
} as const
