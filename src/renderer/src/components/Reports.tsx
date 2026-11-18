import { useMemo, useState } from 'react'
import {
  addDays,
  formatDecimalHours,
  formatDuration,
  rangeForPreset,
  totalInRange,
  totalsByDay,
  totalsByProject,
  type RangePreset
} from '@shared/time'
import type { AppData } from '@shared/types'
import { dayLabel, projectById } from '../lib/format'

interface Props {
  state: AppData
  now: Date
  onExport: (from: Date, to: Date) => void
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' }
]

const NO_PROJECT_COLOR = '#9ca3af'

export function Reports({ state, now, onExport }: Props) {
  const [preset, setPreset] = useState<RangePreset>('thisWeek')
  const weekStartsOn = state.settings.weekStartsOn
  const range = useMemo(() => rangeForPreset(preset, now, weekStartsOn), [preset, now, weekStartsOn])

  const { total, byProject, byDay } = useMemo(
    () => ({
      total: totalInRange(state.entries, range, now),
      byProject: totalsByProject(state.entries, range, now),
      byDay: totalsByDay(state.entries, range, now)
    }),
    [state.entries, range, now]
  )
  const projects = projectById(state.projects)
  const maxDay = Math.max(1, ...byDay.map((d) => d.totalMs))
  const lastDay = addDays(range.to, -1)

  return (
    <section className="reports">
      <div className="section-header">
        <h2>Reports</h2>
        <div className="toolbar">
          <select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => onExport(range.from, range.to)}>
            Export CSV
          </button>
        </div>
      </div>

      <p className="range-label">
        {range.from.toLocaleDateString()}
        {lastDay.getTime() !== range.from.getTime() && ` – ${lastDay.toLocaleDateString()}`}
      </p>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total tracked</span>
          <span className="stat-value" data-testid="report-total">
            {formatDuration(total, { seconds: false })}
          </span>
          <span className="stat-sub">{formatDecimalHours(total)} hours</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Projects</span>
          <span className="stat-value">{byProject.filter((p) => p.projectId !== null).length}</span>
          <span className="stat-sub">with tracked time</span>
        </div>
      </div>

      <h3 className="subheading">By project</h3>
      {byProject.length === 0 ? (
        <p className="empty">No time tracked in this period.</p>
      ) : (
        <ul className="bar-list">
          {byProject.map((row) => {
            const project = row.projectId ? projects.get(row.projectId) : undefined
            const color = project?.color ?? NO_PROJECT_COLOR
            const share = total > 0 ? row.totalMs / total : 0
            return (
              <li key={row.projectId ?? 'none'} className="bar-row">
                <span className="bar-label">
                  <span className="swatch" style={{ background: color }} />
                  {project?.name ?? 'No project'}
                </span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${share * 100}%`, background: color }} />
                </span>
                <span className="bar-value">
                  {formatDuration(row.totalMs, { seconds: false })}
                  <span className="muted"> {Math.round(share * 100)}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {byDay.length > 1 && (
        <>
          <h3 className="subheading">By day</h3>
          <ul className="bar-list">
            {byDay.map((day) => (
              <li key={day.key} className="bar-row">
                <span className="bar-label">{dayLabel(day.date, now)}</span>
                <span className="bar-track">
                  {day.totalMs > 0 && (
                    <span className="bar-fill accent" style={{ width: `${(day.totalMs / maxDay) * 100}%` }} />
                  )}
                </span>
                <span className="bar-value">{formatDuration(day.totalMs, { seconds: false })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
