import { dayKey, entryDurationMs, formatDecimalHours, formatDuration, timeOfDay, type DateRange } from './time'
import type { Project, TimeEntry } from './types'

const HEADER = ['Date', 'Start', 'End', 'Duration', 'Hours', 'Project', 'Description']

/**
 * Quotes a CSV cell. Cells that a spreadsheet would treat as a formula are
 * prefixed with an apostrophe so that opening the export cannot run anything.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Completed entries whose start falls inside `range`, oldest first. */
export function entriesForExport(entries: TimeEntry[], range: DateRange): TimeEntry[] {
  const from = range.from.getTime()
  const to = range.to.getTime()
  return entries
    .filter((entry) => {
      if (entry.end === null) return false
      const start = Date.parse(entry.start)
      return start >= from && start < to
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** Builds a CSV document (CRLF line endings, no BOM) from completed entries. */
export function entriesToCsv(entries: TimeEntry[], projects: Project[], range: DateRange): string {
  const projectNames = new Map(projects.map((p) => [p.id, p.name]))
  const rows = entriesForExport(entries, range).map((entry) => {
    const start = new Date(entry.start)
    const end = new Date(entry.end as string)
    const ms = entryDurationMs(entry, end)
    return [
      dayKey(start),
      timeOfDay(start),
      timeOfDay(end),
      formatDuration(ms, { seconds: false }),
      formatDecimalHours(ms),
      entry.projectId ? (projectNames.get(entry.projectId) ?? '') : '',
      entry.description
    ]
  })
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
