import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataStore, normalizeData } from '../src/main/store'

let dir: string
let file: string
let clock: Date

const tick = (minutes: number): void => {
  clock = new Date(clock.getTime() + minutes * 60_000)
}

const open = (): Promise<DataStore> => DataStore.open(file, { now: () => clock })

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'time-tracker-test-'))
  file = path.join(dir, 'data.json')
  clock = new Date('2026-03-10T09:00:00.000Z')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('DataStore', () => {
  it('starts empty when there is no file', async () => {
    const store = await open()
    expect(store.getState()).toMatchObject({ version: 1, projects: [], entries: [] })
  })

  it('starts and stops a timer and persists it', async () => {
    const store = await open()
    await store.startTimer({ description: '  Write report  ', projectId: null })
    expect(store.runningEntry?.description).toBe('Write report')

    tick(30)
    const state = await store.stopTimer()
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({
      start: '2026-03-10T09:00:00.000Z',
      end: '2026-03-10T09:30:00.000Z'
    })

    const reopened = await open()
    expect(reopened.getState()).toEqual(state)
  })

  it('stops the running timer when a new one starts', async () => {
    const store = await open()
    await store.startTimer({ description: 'A', projectId: null })
    tick(10)
    const state = await store.startTimer({ description: 'B', projectId: null })
    expect(state.entries.filter((e) => e.end === null)).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ description: 'A', end: '2026-03-10T09:10:00.000Z' })
    expect(state.entries[1]).toMatchObject({ description: 'B', end: null })
  })

  it('validates manual entries', async () => {
    const store = await open()
    await expect(
      store.addEntry({ description: '', projectId: null, start: '2026-03-10T10:00:00Z', end: '2026-03-10T09:00:00Z' })
    ).rejects.toThrow('End time must be after the start time.')
    await expect(
      store.addEntry({ description: '', projectId: 'nope', start: '2026-03-10T08:00:00Z', end: '2026-03-10T09:00:00Z' })
    ).rejects.toThrow('Unknown project.')
    expect(store.getState().entries).toHaveLength(0)
  })

  it('does not change state when an update is invalid', async () => {
    const store = await open()
    const { entries } = await store.addEntry({
      description: 'Meeting',
      projectId: null,
      start: '2026-03-10T08:00:00Z',
      end: '2026-03-10T09:00:00Z'
    })
    await expect(store.updateEntry(entries[0].id, { end: '2026-03-10T07:00:00Z' })).rejects.toThrow()
    expect(store.getState().entries[0].end).toBe('2026-03-10T09:00:00.000Z')
  })

  it('manages projects and keeps entries when a project is deleted', async () => {
    const store = await open()
    let state = await store.addProject({ name: 'Client A', color: '#3B82F6' })
    const projectId = state.projects[0].id
    expect(state.projects[0].color).toBe('#3b82f6')

    await expect(store.addProject({ name: 'client a', color: '#000000' })).rejects.toThrow('already exists')

    await store.startTimer({ description: 'Work', projectId })
    tick(5)
    await store.stopTimer()

    state = await store.deleteProject(projectId)
    expect(state.projects).toHaveLength(0)
    expect(state.entries[0].projectId).toBeNull()
  })

  it('runs concurrent changes one after another without losing any', async () => {
    const store = await open()
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.addEntry({
          description: `Entry ${i}`,
          projectId: null,
          start: '2026-03-10T08:00:00Z',
          end: '2026-03-10T09:00:00Z'
        })
      )
    )
    expect(store.getState().entries).toHaveLength(10)
    expect((await open()).getState().entries).toHaveLength(10)
  })

  it('backs up a corrupt file and starts fresh', async () => {
    await writeFile(file, '{ not json', 'utf8')
    const store = await open()
    expect(store.getState().entries).toEqual([])
    const files = await readdir(dir)
    const backup = files.find((f) => f.startsWith('data.json.corrupt-'))
    expect(backup).toBeDefined()
    expect(await readFile(path.join(dir, backup as string), 'utf8')).toBe('{ not json')
  })
})

describe('normalizeData', () => {
  it('drops malformed records and keeps only one running timer', () => {
    const data = normalizeData({
      projects: [{ id: 'p', name: 'P', color: 'red' }, { name: 'missing id' }],
      entries: [
        { id: '1', start: '2026-03-10T08:00:00Z', end: null, projectId: 'p' },
        { id: '2', start: '2026-03-10T09:00:00Z', end: null, projectId: 'gone' },
        { id: '3', start: 'garbage', end: null },
        { id: '4', start: '2026-03-10T09:00:00Z', end: 'garbage' }
      ],
      settings: { closeToTray: false, weekStartsOn: 5 }
    })
    expect(data.projects).toEqual([
      { id: 'p', name: 'P', color: '#6b7280', archived: false, createdAt: new Date(0).toISOString() }
    ])
    expect(data.entries.map((e) => [e.id, e.end, e.projectId])).toEqual([
      ['1', null, 'p'],
      ['2', '2026-03-10T09:00:00Z', null]
    ])
    expect(data.settings).toEqual({ closeToTray: false, weekStartsOn: 1 })
  })
})
