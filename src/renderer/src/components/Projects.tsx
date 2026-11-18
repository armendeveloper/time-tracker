import { useMemo, useState, type FormEvent } from 'react'
import { entryDurationMs, formatDuration } from '@shared/time'
import type { AppData, Project } from '@shared/types'
import { PROJECT_COLORS } from '../lib/format'

interface Props {
  state: AppData
  now: Date
  run: (call: () => Promise<AppData>) => Promise<boolean>
}

function ProjectRow({ project, totalMs, run }: { project: Project; totalMs: number; run: Props['run'] }) {
  const [name, setName] = useState(project.name)

  const saveName = (): void => {
    if (name.trim() === project.name) return
    void run(() => window.api.updateProject(project.id, { name })).then((ok) => {
      if (!ok) setName(project.name)
    })
  }

  const remove = (): void => {
    const ok = window.confirm(
      `Delete the project "${project.name}"?\n\nIts time entries are kept and will have no project.`
    )
    if (ok) void run(() => window.api.deleteProject(project.id))
  }

  return (
    <li className={`project-row${project.archived ? ' is-archived' : ''}`} data-testid="project-row">
      <input
        type="color"
        className="color-input"
        aria-label={`Color for ${project.name}`}
        value={project.color}
        onChange={(e) => void run(() => window.api.updateProject(project.id, { color: e.target.value }))}
      />
      <input
        className="project-name-input"
        aria-label="Project name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="project-total">{formatDuration(totalMs, { seconds: false })}</span>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={() => void run(() => window.api.updateProject(project.id, { archived: !project.archived }))}
      >
        {project.archived ? 'Unarchive' : 'Archive'}
      </button>
      <button type="button" className="btn btn-danger btn-small" onClick={remove}>
        Delete
      </button>
    </li>
  )
}

export function Projects({ state, now, run }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length])

  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of state.entries) {
      if (entry.projectId) map.set(entry.projectId, (map.get(entry.projectId) ?? 0) + entryDurationMs(entry, now))
    }
    return map
  }, [state.entries, now])

  const sorted = [...state.projects].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)
  )

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (await run(() => window.api.addProject({ name, color }))) {
      setName('')
      setColor(PROJECT_COLORS[(state.projects.length + 1) % PROJECT_COLORS.length])
    }
  }

  return (
    <section className="projects">
      <div className="section-header">
        <h2>Projects</h2>
      </div>

      <form className="project-form" onSubmit={add}>
        <input
          type="color"
          className="color-input"
          aria-label="New project color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <input
          aria-label="New project name"
          placeholder="New project name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={name.trim() === ''}>
          Add project
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="empty">No projects yet. Projects help you group and report on your time.</p>
      ) : (
        <ul className="project-list">
          {sorted.map((project) => (
            <ProjectRow key={project.id} project={project} totalMs={totals.get(project.id) ?? 0} run={run} />
          ))}
        </ul>
      )}
    </section>
  )
}
