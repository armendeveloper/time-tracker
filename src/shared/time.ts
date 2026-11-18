import type { TimeEntry, WeekStart } from './types'

export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND
export const MS_PER_HOUR = 60 * MS_PER_MINUTE

export interface DateRange {
  /** Inclusive. */
  from: Date
  /** Exclusive. */
  to: Date
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Duration of an entry in milliseconds. A running entry is measured up to `now`. */
export function entryDurationMs(entry: TimeEntry, now: Date): number {
  const start = Date.parse(entry.start)
  const end = entry.end === null ? now.getTime() : Date.parse(entry.end)
  return Math.max(0, end - start)
}

/** The part of an entry's duration that falls inside `range`. */
export function overlapMs(entry: TimeEntry, range: DateRange, now: Date): number {
  const start = Date.parse(entry.start)
  const end = entry.end === null ? now.getTime() : Date.parse(entry.end)
  const from = Math.max(start, range.from.getTime())
  const to = Math.min(end, range.to.getTime())
  return Math.max(0, to - from)
}

/** Formats a duration as H:MM:SS (or H:MM when `seconds` is false). Negative values clamp to zero. */
export function formatDuration(ms: number, options: { seconds?: boolean } = {}): string {
  const { seconds = true } = options
  const totalSeconds = Math.floor(Math.max(0, ms) / MS_PER_SECOND)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return seconds ? `${h}:${pad2(m)}:${pad2(s)}` : `${h}:${pad2(m)}`
}

/** Formats a duration as decimal hours with two digits, e.g. 1.25. */
export function formatDecimalHours(ms: number): string {
  return (Math.max(0, ms) / MS_PER_HOUR).toFixed(2)
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Adds calendar days in local time, so DST changes do not shift the time of day. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function startOfWeek(date: Date, weekStartsOn: WeekStart): Date {
  const day = startOfDay(date)
  const diff = (day.getDay() - weekStartsOn + 7) % 7
  return addDays(day, -diff)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local time as HH:mm. */
export function timeOfDay(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** Value for an <input type="datetime-local">: YYYY-MM-DDTHH:mm in local time. */
export function toLocalInputValue(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${dayKey(date)}T${timeOfDay(date)}`
}

/** Parses a datetime-local value (YYYY-MM-DDTHH:mm[:ss]) as local time. Returns null if invalid. */
export function fromLocalInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
  // Reject values like 2026-02-31 that Date silently rolls over.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null
  return date
}

export interface DayGroup {
  key: string
  date: Date
  entries: TimeEntry[]
  totalMs: number
}

/**
 * Groups entries by the local day they started on, newest day first.
 * Entries inside a day are sorted newest first.
 */
export function groupEntriesByDay(entries: TimeEntry[], now: Date): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const entry of entries) {
    const start = new Date(entry.start)
    const key = dayKey(start)
    let group = groups.get(key)
    if (!group) {
      group = { key, date: startOfDay(start), entries: [], totalMs: 0 }
      groups.set(key, group)
    }
    group.entries.push(entry)
    group.totalMs += entryDurationMs(entry, now)
  }
  const result = [...groups.values()]
  for (const group of result) {
    group.entries.sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  }
  return result.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export function totalInRange(entries: TimeEntry[], range: DateRange, now: Date): number {
  return entries.reduce((sum, entry) => sum + overlapMs(entry, range, now), 0)
}

export interface ProjectTotal {
  projectId: string | null
  totalMs: number
}

/** Time per project inside `range`, largest first. Projects with no time are omitted. */
export function totalsByProject(entries: TimeEntry[], range: DateRange, now: Date): ProjectTotal[] {
  const totals = new Map<string | null, number>()
  for (const entry of entries) {
    const ms = overlapMs(entry, range, now)
    if (ms > 0) totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + ms)
  }
  return [...totals.entries()]
    .map(([projectId, totalMs]) => ({ projectId, totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

export interface DayTotal {
  key: string
  date: Date
  totalMs: number
}

/** One row per calendar day in `range`. Entries that cross midnight are split between days. */
export function totalsByDay(entries: TimeEntry[], range: DateRange, now: Date): DayTotal[] {
  const days: DayTotal[] = []
  for (let day = startOfDay(range.from); day < range.to; day = addDays(day, 1)) {
    const dayRange = { from: day, to: addDays(day, 1) }
    days.push({ key: dayKey(day), date: day, totalMs: totalInRange(entries, dayRange, now) })
  }
  return days
}

export type RangePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

export function rangeForPreset(preset: RangePreset, now: Date, weekStartsOn: WeekStart): DateRange {
  switch (preset) {
    case 'today': {
      const from = startOfDay(now)
      return { from, to: addDays(from, 1) }
    }
    case 'thisWeek': {
      const from = startOfWeek(now, weekStartsOn)
      return { from, to: addDays(from, 7) }
    }
    case 'lastWeek': {
      const to = startOfWeek(now, weekStartsOn)
      return { from: addDays(to, -7), to }
    }
    case 'thisMonth': {
      const from = startOfMonth(now)
      return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) }
    }
    case 'lastMonth': {
      const to = startOfMonth(now)
      return { from: new Date(to.getFullYear(), to.getMonth() - 1, 1), to }
    }
  }
}
