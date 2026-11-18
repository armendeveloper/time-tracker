import { describe, expect, it } from 'vitest'
import { csvCell, entriesToCsv } from '../src/shared/csv'
import type { Project, TimeEntry } from '../src/shared/types'

const at = (d: number, h: number, mi = 0): Date => new Date(2026, 2, d, h, mi)

const projects: Project[] = [
  { id: 'p1', name: 'Client, Inc.', color: '#3b82f6', archived: false, createdAt: at(1, 0).toISOString() }
]

function entry(start: Date, end: Date | null, description: string, projectId: string | null = null): TimeEntry {
  return { id: description, description, projectId, start: start.toISOString(), end: end?.toISOString() ?? null }
}

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@cmd')).toBe("'@cmd")
  })
})

describe('entriesToCsv', () => {
  const range = { from: at(10, 0), to: at(11, 0) }
  const entries = [
    entry(at(10, 13), at(10, 14, 30), 'Second', 'p1'),
    entry(at(10, 9), at(10, 9, 20), 'First'),
    entry(at(9, 9), at(9, 10), 'Outside range'),
    entry(at(10, 15), null, 'Still running')
  ]

  it('exports finished entries in range, oldest first', () => {
    const lines = entriesToCsv(entries, projects, range).trimEnd().split('\r\n')
    expect(lines).toEqual([
      'Date,Start,End,Duration,Hours,Project,Description',
      '2026-03-10,09:00,09:20,0:20,0.33,,First',
      '2026-03-10,13:00,14:30,1:30,1.50,"Client, Inc.",Second'
    ])
  })
})
