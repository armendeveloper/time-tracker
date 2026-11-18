import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AppData,
  EntryInput,
  EntryPatch,
  Project,
  ProjectInput,
  ProjectPatch,
  Settings,
  SettingsPatch,
  StartTimerInput,
  TimeEntry
} from '../shared/types'

export const DEFAULT_SETTINGS: Settings = { closeToTray: true, weekStartsOn: 1 }

const MAX_DESCRIPTION = 500
const MAX_PROJECT_NAME = 100
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

/** Thrown for invalid input. Its message is safe to show to the user. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function createEmptyData(): AppData {
  return { version: 1, projects: [], entries: [], settings: { ...DEFAULT_SETTINGS } }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Keeps only well-formed records from a loaded file so one bad record cannot break the app. */
export function normalizeData(raw: unknown): AppData {
  const data = createEmptyData()
  if (!isObject(raw)) return data

  if (Array.isArray(raw.projects)) {
    for (const p of raw.projects) {
      if (!isObject(p) || typeof p.id !== 'string' || typeof p.name !== 'string') continue
      data.projects.push({
        id: p.id,
        name: p.name,
        color: typeof p.color === 'string' && COLOR_PATTERN.test(p.color) ? p.color : '#6b7280',
        archived: p.archived === true,
        createdAt: isIsoDate(p.createdAt) ? p.createdAt : new Date(0).toISOString()
      })
    }
  }

  const projectIds = new Set(data.projects.map((p) => p.id))
  let hasRunning = false
  if (Array.isArray(raw.entries)) {
    for (const e of raw.entries) {
      if (!isObject(e) || typeof e.id !== 'string' || !isIsoDate(e.start)) continue
      let end = e.end === null ? null : isIsoDate(e.end) ? e.end : undefined
      if (end === undefined) continue
      // Only one timer may run at a time; stop any extra ones at their start time.
      if (end === null) {
        if (hasRunning) end = e.start
        hasRunning = true
      }
      data.entries.push({
        id: e.id,
        description: typeof e.description === 'string' ? e.description : '',
        projectId: typeof e.projectId === 'string' && projectIds.has(e.projectId) ? e.projectId : null,
        start: e.start,
        end
      })
    }
  }

  if (isObject(raw.settings)) {
    const s = raw.settings
    if (typeof s.closeToTray === 'boolean') data.settings.closeToTray = s.closeToTray
    if (s.weekStartsOn === 0 || s.weekStartsOn === 1) data.settings.weekStartsOn = s.weekStartsOn
  }
  return data
}

function cleanDescription(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Description must be text.')
  const trimmed = value.trim()
  if (trimmed.length > MAX_DESCRIPTION) {
    throw new ValidationError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
  }
  return trimmed
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== 'string') throw new ValidationError(`${label} is required.`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} is not a valid date.`)
  return date
}

export interface DataStoreOptions {
  /** Clock used for timer start/stop. Injectable for tests. */
  now?: () => Date
}

/**
 * Holds the app's data in memory and persists every change to a JSON file.
 * Mutations run one at a time, and the in-memory state only changes after
 * the file was written successfully.
 */
export class DataStore {
  private data: AppData
  private queue: Promise<unknown> = Promise.resolve()
  private readonly now: () => Date

  private constructor(
    readonly filePath: string,
    data: AppData,
    options: DataStoreOptions
  ) {
    this.data = data
    this.now = options.now ?? (() => new Date())
  }

  static async open(filePath: string, options: DataStoreOptions = {}): Promise<DataStore> {
    let data: AppData
    try {
      const text = await fs.readFile(filePath, 'utf8')
      data = normalizeData(JSON.parse(text))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        data = createEmptyData()
      } else if (error instanceof SyntaxError) {
        // Keep the unreadable file for manual recovery and start fresh.
        const backup = `${filePath}.corrupt-${Date.now()}`
        await fs.rename(filePath, backup)
        data = createEmptyData()
      } else {
        throw error
      }
    }
    return new DataStore(filePath, data, options)
  }

  getState(): AppData {
    return structuredClone(this.data)
  }

  get runningEntry(): TimeEntry | undefined {
    return this.data.entries.find((e) => e.end === null)
  }

  startTimer(input: StartTimerInput): Promise<AppData> {
    return this.mutate((draft) => {
      const description = cleanDescription(input?.description ?? '')
      const projectId = this.checkProjectId(draft, input?.projectId ?? null)
      const now = this.now().toISOString()
      for (const entry of draft.entries) {
        if (entry.end === null) entry.end = now
      }
      draft.entries.push({ id: randomUUID(), description, projectId, start: now, end: null })
    })
  }

  stopTimer(): Promise<AppData> {
    return this.mutate((draft) => {
      const now = this.now().toISOString()
      for (const entry of draft.entries) {
        if (entry.end === null) entry.end = now
      }
    })
  }

  addEntry(input: EntryInput): Promise<AppData> {
    return this.mutate((draft) => {
      if (!isObject(input)) throw new ValidationError('Invalid entry.')
      const start = parseDate(input.start, 'Start time')
      const end = parseDate(input.end, 'End time')
      if (end <= start) throw new ValidationError('End time must be after the start time.')
      draft.entries.push({
        id: randomUUID(),
        description: cleanDescription(input.description ?? ''),
        projectId: this.checkProjectId(draft, input.projectId ?? null),
        start: start.toISOString(),
        end: end.toISOString()
      })
    })
  }

  updateEntry(id: string, patch: EntryPatch): Promise<AppData> {
    return this.mutate((draft) => {
      const entry = draft.entries.find((e) => e.id === id)
      if (!entry) throw new ValidationError('That entry no longer exists.')
      if (!isObject(patch)) throw new ValidationError('Invalid changes.')
      if (patch.description !== undefined) entry.description = cleanDescription(patch.description)
      if (patch.projectId !== undefined) entry.projectId = this.checkProjectId(draft, patch.projectId)
      if (patch.start !== undefined) entry.start = parseDate(patch.start, 'Start time').toISOString()
      if (patch.end !== undefined) entry.end = parseDate(patch.end, 'End time').toISOString()

      const start = Date.parse(entry.start)
      if (entry.end === null) {
        if (start > this.now().getTime()) {
          throw new ValidationError('A running timer cannot start in the future.')
        }
      } else if (Date.parse(entry.end) <= start) {
        throw new ValidationError('End time must be after the start time.')
      }
    })
  }

  deleteEntry(id: string): Promise<AppData> {
    return this.mutate((draft) => {
      const index = draft.entries.findIndex((e) => e.id === id)
      if (index === -1) throw new ValidationError('That entry no longer exists.')
      draft.entries.splice(index, 1)
    })
  }

  addProject(input: ProjectInput): Promise<AppData> {
    return this.mutate((draft) => {
      if (!isObject(input)) throw new ValidationError('Invalid project.')
      const project: Project = {
        id: randomUUID(),
        name: this.checkProjectName(draft, input.name, null),
        color: this.checkColor(input.color),
        archived: false,
        createdAt: this.now().toISOString()
      }
      draft.projects.push(project)
    })
  }

  updateProject(id: string, patch: ProjectPatch): Promise<AppData> {
    return this.mutate((draft) => {
      const project = draft.projects.find((p) => p.id === id)
      if (!project) throw new ValidationError('That project no longer exists.')
      if (!isObject(patch)) throw new ValidationError('Invalid changes.')
      if (patch.name !== undefined) project.name = this.checkProjectName(draft, patch.name, id)
      if (patch.color !== undefined) project.color = this.checkColor(patch.color)
      if (patch.archived !== undefined) project.archived = patch.archived === true
    })
  }

  /** Deletes a project. Its entries are kept and become "no project". */
  deleteProject(id: string): Promise<AppData> {
    return this.mutate((draft) => {
      const index = draft.projects.findIndex((p) => p.id === id)
      if (index === -1) throw new ValidationError('That project no longer exists.')
      draft.projects.splice(index, 1)
      for (const entry of draft.entries) {
        if (entry.projectId === id) entry.projectId = null
      }
    })
  }

  updateSettings(patch: SettingsPatch): Promise<AppData> {
    return this.mutate((draft) => {
      if (!isObject(patch)) throw new ValidationError('Invalid settings.')
      if (patch.closeToTray !== undefined) draft.settings.closeToTray = patch.closeToTray === true
      if (patch.weekStartsOn !== undefined) {
        if (patch.weekStartsOn !== 0 && patch.weekStartsOn !== 1) {
          throw new ValidationError('Week must start on Sunday or Monday.')
        }
        draft.settings.weekStartsOn = patch.weekStartsOn
      }
    })
  }

  private checkProjectId(draft: AppData, value: unknown): string | null {
    if (value === null || value === '') return null
    if (typeof value !== 'string' || !draft.projects.some((p) => p.id === value)) {
      throw new ValidationError('Unknown project.')
    }
    return value
  }

  private checkProjectName(draft: AppData, value: unknown, ownId: string | null): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ValidationError('Project name is required.')
    }
    const name = value.trim()
    if (name.length > MAX_PROJECT_NAME) {
      throw new ValidationError(`Project name must be at most ${MAX_PROJECT_NAME} characters.`)
    }
    const taken = draft.projects.some(
      (p) => p.id !== ownId && p.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    )
    if (taken) throw new ValidationError(`A project named "${name}" already exists.`)
    return name
  }

  private checkColor(value: unknown): string {
    if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
      throw new ValidationError('Color must be a hex value like #3b82f6.')
    }
    return value.toLowerCase()
  }

  /** Applies a change to a copy, writes it to disk, then makes it the current state. */
  private mutate(change: (draft: AppData) => void): Promise<AppData> {
    const run = async (): Promise<AppData> => {
      const draft = structuredClone(this.data)
      change(draft)
      await this.write(draft)
      this.data = draft
      return this.getState()
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async write(data: AppData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
    // On Windows, antivirus or indexing can briefly lock the file; retry a few times.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tempPath, this.filePath)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
  }
}
