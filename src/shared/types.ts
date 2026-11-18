export interface Project {
  id: string
  name: string
  /** Hex color in the form #rrggbb. */
  color: string
  archived: boolean
  createdAt: string
}

export interface TimeEntry {
  id: string
  description: string
  projectId: string | null
  /** ISO 8601 timestamp. */
  start: string
  /** ISO 8601 timestamp, or null while the timer is running. */
  end: string | null
}

export type WeekStart = 0 | 1

export interface Settings {
  /** When true, closing the window hides it to the system tray instead of quitting. */
  closeToTray: boolean
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: WeekStart
}

export interface AppData {
  version: 1
  projects: Project[]
  entries: TimeEntry[]
  settings: Settings
}

export interface StartTimerInput {
  description: string
  projectId: string | null
}

export interface EntryInput {
  description: string
  projectId: string | null
  start: string
  end: string
}

export type EntryPatch = Partial<EntryInput>

export interface ProjectInput {
  name: string
  color: string
}

export type ProjectPatch = Partial<ProjectInput & { archived: boolean }>

export type SettingsPatch = Partial<Settings>

export interface ExportRequest {
  /** ISO timestamp, inclusive. */
  from: string
  /** ISO timestamp, exclusive. */
  to: string
}

export interface ExportResult {
  saved: boolean
  filePath?: string
  count?: number
}

export interface AppInfo {
  version: string
  dataFilePath: string
}

/** The API the preload script exposes to the renderer as `window.api`. */
export interface TimeTrackerApi {
  getState(): Promise<AppData>
  getAppInfo(): Promise<AppInfo>
  startTimer(input: StartTimerInput): Promise<AppData>
  stopTimer(): Promise<AppData>
  addEntry(input: EntryInput): Promise<AppData>
  updateEntry(id: string, patch: EntryPatch): Promise<AppData>
  deleteEntry(id: string): Promise<AppData>
  addProject(input: ProjectInput): Promise<AppData>
  updateProject(id: string, patch: ProjectPatch): Promise<AppData>
  deleteProject(id: string): Promise<AppData>
  updateSettings(patch: SettingsPatch): Promise<AppData>
  exportCsv(request: ExportRequest): Promise<ExportResult>
  revealDataFile(): Promise<void>
  onStateChanged(listener: (state: AppData) => void): () => void
}
