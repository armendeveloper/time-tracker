import { useEffect, useState } from 'react'
import type { AppData, AppInfo, WeekStart } from '@shared/types'

interface Props {
  state: AppData
  run: (call: () => Promise<AppData>) => Promise<boolean>
}

export function SettingsView({ state, run }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.getAppInfo().then(setInfo, () => setInfo(null))
  }, [])

  return (
    <section className="settings">
      <div className="section-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-group">
        <label className="setting">
          <input
            type="checkbox"
            checked={state.settings.closeToTray}
            onChange={(e) => void run(() => window.api.updateSettings({ closeToTray: e.target.checked }))}
          />
          <span>
            <strong>Keep running in the system tray when the window is closed</strong>
            <small>Use the tray icon to start or stop timers, or choose Quit from its menu to exit.</small>
          </span>
        </label>

        <label className="setting setting-inline">
          <span>
            <strong>First day of the week</strong>
            <small>Used for the weekly report.</small>
          </span>
          <select
            value={state.settings.weekStartsOn}
            onChange={(e) =>
              void run(() => window.api.updateSettings({ weekStartsOn: Number(e.target.value) as WeekStart }))
            }
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
      </div>

      <div className="settings-group">
        <div className="setting setting-inline">
          <span>
            <strong>Data file</strong>
            <small className="mono">{info?.dataFilePath ?? '…'}</small>
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => void window.api.revealDataFile()}>
            Show in folder
          </button>
        </div>
        <p className="muted small">Time Tracker {info ? `v${info.version}` : ''}</p>
      </div>
    </section>
  )
}
