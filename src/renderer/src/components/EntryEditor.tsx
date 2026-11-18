import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fromLocalInputValue, toLocalInputValue, MS_PER_HOUR } from '@shared/time'
import type { EntryInput, Project, TimeEntry } from '@shared/types'
import { ProjectSelect } from './ProjectSelect'

interface Props {
  /** The entry to edit, or undefined to create a new one. */
  entry?: TimeEntry
  projects: Project[]
  onSave: (input: EntryInput) => Promise<boolean>
  onClose: () => void
}

export function EntryEditor({ entry, projects, onSave, onClose }: Props) {
  const [description, setDescription] = useState(entry?.description ?? '')
  const [projectId, setProjectId] = useState<string | null>(entry?.projectId ?? null)
  const [start, setStart] = useState(() =>
    toLocalInputValue(entry ? entry.start : new Date(Date.now() - MS_PER_HOUR))
  )
  const [end, setEnd] = useState(() => toLocalInputValue(entry?.end ?? new Date()))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)
  // The parent re-renders every second while a timer runs, so keep the latest
  // onClose in a ref instead of re-running the effect (which would steal focus).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const startDate = fromLocalInputValue(start)
    const endDate = fromLocalInputValue(end)
    if (!startDate || !endDate) {
      setError('Please enter a valid start and end time.')
      return
    }
    if (endDate <= startDate) {
      setError('End time must be after the start time.')
      return
    }
    setError(null)
    setSaving(true)
    const ok = await onSave({
      description,
      projectId,
      start: startDate.toISOString(),
      end: endDate.toISOString()
    })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="entry-editor-title" onSubmit={submit}>
        <h2 id="entry-editor-title">{entry ? 'Edit entry' : 'Add entry'}</h2>

        <label className="field">
          <span>Description</span>
          <input
            ref={firstField}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
          />
        </label>

        <label className="field">
          <span>Project</span>
          <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Start</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field">
            <span>End</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {entry ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}
