import { useEffect, useState, type FormEvent } from 'react'
import { entryDurationMs, formatDuration } from '@shared/time'
import type { AppData, TimeEntry } from '@shared/types'
import { ProjectSelect } from './ProjectSelect'

interface Props {
  state: AppData
  running: TimeEntry | undefined
  now: Date
  run: (call: () => Promise<AppData>) => Promise<boolean>
}

export function TimerBar({ state, running, now, run }: Props) {
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)

  // Show the running entry's values, including when it was started from the tray.
  useEffect(() => {
    if (running) {
      setDescription(running.description)
      setProjectId(running.projectId)
    }
  }, [running?.id, running?.description, running?.projectId])

  const saveRunningDescription = (): void => {
    if (running && description.trim() !== running.description) {
      void run(() => window.api.updateEntry(running.id, { description }))
    }
  }

  const changeProject = (next: string | null): void => {
    setProjectId(next)
    if (running) void run(() => window.api.updateEntry(running.id, { projectId: next }))
  }

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (running) {
      if (await run(() => window.api.stopTimer())) {
        setDescription('')
        setProjectId(null)
      }
    } else {
      await run(() => window.api.startTimer({ description, projectId }))
    }
  }

  return (
    <form className={`timer-bar${running ? ' is-running' : ''}`} onSubmit={onSubmit}>
      <input
        className="timer-description"
        aria-label="What are you working on?"
        placeholder="What are you working on?"
        value={description}
        maxLength={500}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveRunningDescription}
        onKeyDown={(e) => {
          // While running, Enter saves the description instead of stopping the timer.
          if (e.key === 'Enter' && running) {
            e.preventDefault()
            saveRunningDescription()
            e.currentTarget.blur()
          }
        }}
      />
      <ProjectSelect
        className="timer-project"
        projects={state.projects}
        value={projectId}
        onChange={changeProject}
      />
      <span className="timer-elapsed" aria-live="off" data-testid="timer-elapsed">
        {formatDuration(running ? entryDurationMs(running, now) : 0)}
      </span>
      <button type="submit" className={running ? 'btn btn-stop' : 'btn btn-start'}>
        {running ? 'Stop' : 'Start'}
      </button>
    </form>
  )
}
