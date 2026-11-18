import { useCallback, useEffect, useMemo, useState } from 'react'
import { entryDurationMs, formatDuration } from '@shared/time'
import type { AppData, EntryInput, TimeEntry } from '@shared/types'
import { EntryEditor } from './components/EntryEditor'
import { EntryList } from './components/EntryList'
import { Projects } from './components/Projects'
import { Reports } from './components/Reports'
import { SettingsView } from './components/SettingsView'
import { TimerBar } from './components/TimerBar'
import { useAppState } from './hooks/useAppState'
import { useNow } from './hooks/useNow'
import { errorMessage } from './lib/format'

type Tab = 'timer' | 'reports' | 'projects' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'timer', label: 'Timer' },
  { id: 'reports', label: 'Reports' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings' }
]

interface Notice {
  kind: 'error' | 'info'
  text: string
}

/** Editor state: closed, adding a new entry, or editing an existing one. */
type Editing = null | { mode: 'add' } | { mode: 'edit'; entry: TimeEntry }

export function App() {
  const { state, loadError, apply } = useAppState()
  const [tab, setTab] = useState<Tab>('timer')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<Editing>(null)

  const running = state?.entries.find((e) => e.end === null)
  // Tick every second while a timer runs; otherwise once a minute keeps "Today" labels fresh.
  const now = useNow(running ? 1000 : 60_000)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), notice.kind === 'error' ? 6000 : 4000)
    return () => clearTimeout(id)
  }, [notice])

  useEffect(() => {
    document.title = running
      ? `${formatDuration(entryDurationMs(running, now))} · ${running.description || 'Time Tracker'}`
      : 'Time Tracker'
  }, [running, now])

  /** Runs a data change and shows any error. Resolves to true on success. */
  const run = useCallback(
    async (call: () => Promise<AppData>): Promise<boolean> => {
      try {
        await apply(call)
        return true
      } catch (error) {
        setNotice({ kind: 'error', text: errorMessage(error) })
        return false
      }
    },
    [apply]
  )

  const completed = useMemo(() => state?.entries.filter((e) => e.end !== null) ?? [], [state?.entries])

  if (loadError) {
    return <div className="fatal">Could not load your data: {loadError}</div>
  }
  if (!state) {
    return <div className="loading">Loading…</div>
  }

  const saveEntry = (input: EntryInput): Promise<boolean> =>
    editing?.mode === 'edit'
      ? run(() => window.api.updateEntry(editing.entry.id, input))
      : run(() => window.api.addEntry(input))

  const deleteEntry = (entry: TimeEntry): void => {
    const label = entry.description ? `"${entry.description}"` : 'this entry'
    if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
      void run(() => window.api.deleteEntry(entry.id))
    }
  }

  const exportCsv = async (from: Date, to: Date): Promise<void> => {
    try {
      const result = await window.api.exportCsv({ from: from.toISOString(), to: to.toISOString() })
      if (result.saved) {
        setNotice({ kind: 'info', text: `Exported ${result.count} entries to ${result.filePath}` })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) })
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className={`brand-dot${running ? ' is-running' : ''}`} aria-hidden="true" />
          Time Tracker
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab${tab === t.id ? ' is-active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <TimerBar state={state} running={running} now={now} run={run} />

      <main className="content">
        {tab === 'timer' && (
          <EntryList
            entries={completed}
            projects={state.projects}
            now={now}
            onAdd={() => setEditing({ mode: 'add' })}
            onEdit={(entry) => setEditing({ mode: 'edit', entry })}
            onDelete={deleteEntry}
            onContinue={(entry) =>
              void run(() => window.api.startTimer({ description: entry.description, projectId: entry.projectId }))
            }
          />
        )}
        {tab === 'reports' && <Reports state={state} now={now} onExport={exportCsv} />}
        {tab === 'projects' && <Projects state={state} now={now} run={run} />}
        {tab === 'settings' && <SettingsView state={state} run={run} />}
      </main>

      {editing && (
        <EntryEditor
          entry={editing.mode === 'edit' ? editing.entry : undefined}
          projects={state.projects}
          onSave={saveEntry}
          onClose={() => setEditing(null)}
        />
      )}

      {notice && (
        <div className={`toast toast-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
