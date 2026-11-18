import type { Project } from '@shared/types'

interface Props {
  projects: Project[]
  value: string | null
  onChange: (projectId: string | null) => void
  id?: string
  className?: string
}

/** Project dropdown. Archived projects are hidden unless one is already selected. */
export function ProjectSelect({ projects, value, onChange, id, className }: Props) {
  const options = projects.filter((p) => !p.archived || p.id === value)
  return (
    <select
      id={id}
      className={className}
      aria-label="Project"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No project</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.archived ? ' (archived)' : ''}
        </option>
      ))}
    </select>
  )
}
