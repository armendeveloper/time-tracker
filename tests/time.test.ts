import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKey,
  entryDurationMs,
  formatDecimalHours,
  formatDuration,
  fromLocalInputValue,
  groupEntriesByDay,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  overlapMs,
  rangeForPreset,
  startOfWeek,
  toLocalInputValue,
  totalsByDay,
  totalsByProject
} from '../src/shared/time'
import type { TimeEntry } from '../src/shared/types'

// All dates are built in local time so the tests pass in any time zone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0): Date => new Date(y, mo - 1, d, h, mi)

function entry(start: Date, end: Date | null, extra: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: Math.random().toString(36).slice(2),
    description: '',
    projectId: null,
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    ...extra
  }
}

describe('formatDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00:00')
    expect(formatDuration(59_999)).toBe('0:00:59')
    expect(formatDuration(MS_PER_HOUR + 2 * MS_PER_MINUTE + 3000)).toBe('1:02:03')
    expect(formatDuration(27 * MS_PER_HOUR)).toBe('27:00:00')
  })

  it('can omit seconds and clamps negative values', () => {
    expect(formatDuration(90 * MS_PER_MINUTE, { seconds: false })).toBe('1:30')
    expect(formatDuration(-5000)).toBe('0:00:00')
  })
})

describe('formatDecimalHours', () => {
  it('uses two decimals', () => {
    expect(formatDecimalHours(90 * MS_PER_MINUTE)).toBe('1.50')
    expect(formatDecimalHours(20 * MS_PER_MINUTE)).toBe('0.33')
  })
})

describe('entryDurationMs and overlapMs', () => {
  const now = at(2026, 3, 10, 12)

  it('measures running entries up to now', () => {
    expect(entryDurationMs(entry(at(2026, 3, 10, 11), null), now)).toBe(MS_PER_HOUR)
  })

  it('clips to the range', () => {
    const e = entry(at(2026, 3, 9, 23), at(2026, 3, 10, 1))
    const day = { from: at(2026, 3, 10), to: at(2026, 3, 11) }
    expect(overlapMs(e, day, now)).toBe(MS_PER_HOUR)
    expect(overlapMs(e, { from: at(2026, 3, 11), to: at(2026, 3, 12) }, now)).toBe(0)
  })
})

describe('startOfWeek and rangeForPreset', () => {
  // Wednesday, 11 March 2026.
  const wed = at(2026, 3, 11, 15, 30)

  it('supports Monday and Sunday week starts', () => {
    expect(dayKey(startOfWeek(wed, 1))).toBe('2026-03-09')
    expect(dayKey(startOfWeek(wed, 0))).toBe('2026-03-08')
    // A Sunday belongs to the week that started the previous Monday.
    expect(dayKey(startOfWeek(at(2026, 3, 15), 1))).toBe('2026-03-09')
  })

  it('computes preset ranges', () => {
    const thisWeek = rangeForPreset('thisWeek', wed, 1)
    expect([dayKey(thisWeek.from), dayKey(thisWeek.to)]).toEqual(['2026-03-09', '2026-03-16'])
    const lastWeek = rangeForPreset('lastWeek', wed, 1)
    expect([dayKey(lastWeek.from), dayKey(lastWeek.to)]).toEqual(['2026-03-02', '2026-03-09'])
    const lastMonth = rangeForPreset('lastMonth', at(2026, 1, 15), 1)
    expect([dayKey(lastMonth.from), dayKey(lastMonth.to)]).toEqual(['2025-12-01', '2026-01-01'])
    const today = rangeForPreset('today', wed, 1)
    expect([dayKey(today.from), dayKey(today.to)]).toEqual(['2026-03-11', '2026-03-12'])
  })

  it('adds calendar days across month ends', () => {
    expect(dayKey(addDays(at(2026, 1, 31), 1))).toBe('2026-02-01')
  })
})

describe('local input values', () => {
  it('round-trips datetime-local strings', () => {
    const date = at(2026, 7, 4, 9, 5)
    expect(toLocalInputValue(date)).toBe('2026-07-04T09:05')
    expect(fromLocalInputValue('2026-07-04T09:05')?.getTime()).toBe(date.getTime())
  })

  it('rejects invalid values', () => {
    expect(fromLocalInputValue('')).toBeNull()
    expect(fromLocalInputValue('2026-02-31T10:00')).toBeNull()
    expect(fromLocalInputValue('not a date')).toBeNull()
  })
})

describe('grouping and totals', () => {
  const now = at(2026, 3, 11, 18)
  const entries = [
    entry(at(2026, 3, 10, 9), at(2026, 3, 10, 10), { projectId: 'a' }),
    entry(at(2026, 3, 11, 9), at(2026, 3, 11, 11), { projectId: 'b' }),
    entry(at(2026, 3, 11, 13), at(2026, 3, 11, 13, 30), { projectId: 'a' }),
    entry(at(2026, 3, 11, 17), null)
  ]

  it('groups by start day, newest first', () => {
    const groups = groupEntriesByDay(entries, now)
    expect(groups.map((g) => g.key)).toEqual(['2026-03-11', '2026-03-10'])
    expect(groups[0].totalMs).toBe(3.5 * MS_PER_HOUR)
    // Newest entry first inside a day.
    expect(groups[0].entries[0].end).toBeNull()
  })

  it('totals by project, largest first', () => {
    const range = { from: at(2026, 3, 9), to: at(2026, 3, 16) }
    expect(totalsByProject(entries, range, now)).toEqual([
      { projectId: 'b', totalMs: 2 * MS_PER_HOUR },
      { projectId: 'a', totalMs: 1.5 * MS_PER_HOUR },
      { projectId: null, totalMs: MS_PER_HOUR }
    ])
  })

  it('splits entries that cross midnight between days', () => {
    const late = [entry(at(2026, 3, 10, 22), at(2026, 3, 11, 2))]
    const days = totalsByDay(late, { from: at(2026, 3, 10), to: at(2026, 3, 12) }, now)
    expect(days.map((d) => [d.key, d.totalMs / MS_PER_HOUR])).toEqual([
      ['2026-03-10', 2],
      ['2026-03-11', 2]
    ])
  })
})
