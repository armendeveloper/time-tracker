import { useMemo, useState } from 'react'
import { entryDurationMs, formatDuration, groupEntriesByDay } from '@shared/time'
import type { Project, TimeEntry } from '@shared/types'
import { clockTime, dayLabel, projectById } from '../lib/format'

interface Props {
  entries: TimeEntry[]
  projects: Project[]
  now: Date
  onAdd: () => void
  onContinue: (entry: TimeEntry) => void
  onEdit: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
}

const DAYS_PER_PAGE = 14

export function EntryList({ entries, projects, now, onAdd, onContinue, onEdit, onDelete }: Props) {
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE)
  const groups = useMemo(() => groupEntriesByDay(entries, now), [entries, now])
  const projectMap = useMemo(() => projectById(projects), [projects])

  return (
    <section className="entries">
      <div className="section-header">
        <h2>Time entries</h2>
        <button type="button" className="btn btn-secondary" onClick={onAdd}>
          Add entry
        </button>
      </div>

      {groups.length === 0 && (
        <p className="empty">
          No time entries yet. Type what you are working on above and press <kbd>Start</kbd>.
        </p>
      )}

      {groups.slice(0, visibleDays).map((group) => (
        <div className="day" key={group.key}>
          <div className="day-header">
            <h3>{dayLabel(group.date, now)}</h3>
            <span className="day-total">{formatDuration(group.totalMs, { seconds: false })}</span>
          </div>
          <ul className="entry-rows">
            {group.entries.map((entry) => {
              const project = entry.projectId ? projectMap.get(entry.projectId) : undefined
              return (
                <li className="entry-row" key={entry.id} data-testid="entry-row">
                  <div className="entry-main">
                    <span className={`entry-description${entry.description ? '' : ' muted'}`}>
                      {entry.description || '(no description)'}
                    </span>
                    {project && (
                      <span className="project-tag" style={{ ['--project-color' as string]: project.color }}>
                        {project.name}
                      </span>
                    )}
                  </div>
                  <span className="entry-times">
                    {clockTime(entry.start)} – {entry.end ? clockTime(entry.end) : 'now'}
                  </span>
                  <span className="entry-duration">{formatDuration(entryDurationMs(entry, now))}</span>
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Start a new timer with this description and project"
                      aria-label="Continue"
                      onClick={() => onContinue(entry)}
                    >
                      ▶
                    </button>
                    <button type="button" className="icon-btn" title="Edit" aria-label="Edit" onClick={() => onEdit(entry)}>
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => onDelete(entry)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {groups.length > visibleDays && (
        <button type="button" className="btn btn-secondary show-more" onClick={() => setVisibleDays((n) => n + DAYS_PER_PAGE)}>
          Show older entries
        </button>
      )}
    </section>
  )
}
