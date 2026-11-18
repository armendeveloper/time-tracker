import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { entryDurationMs, formatDuration } from '../shared/time'
import type { AppData } from '../shared/types'
import idle16 from '../../resources/tray-idle-16.png?asset'
import idle32 from '../../resources/tray-idle-32.png?asset'
import active16 from '../../resources/tray-active-16.png?asset'
import active32 from '../../resources/tray-active-32.png?asset'

export interface TrayActions {
  showWindow(): void
  startNew(): void
  continueLast(): void
  stopTimer(): void
  quit(): void
}

function loadIcon(small: string, large: string): NativeImage {
  const image = nativeImage.createEmpty()
  image.addRepresentation({ scaleFactor: 1, buffer: nativeImage.createFromPath(small).toPNG() })
  image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(large).toPNG() })
  return image
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** System tray icon with a menu to start and stop the timer. */
export class AppTray {
  private readonly tray: Tray
  private readonly idleIcon = loadIcon(idle16, idle32)
  private readonly activeIcon = loadIcon(active16, active32)
  private tooltipTimer: NodeJS.Timeout | null = null
  private state: AppData | null = null
  private hiddenNoticeShown = false

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(this.idleIcon)
    this.tray.setToolTip('Time Tracker')
    this.tray.on('click', () => this.actions.showWindow())
  }

  update(state: AppData): void {
    this.state = state
    const running = state.entries.find((e) => e.end === null)
    this.tray.setImage(running ? this.activeIcon : this.idleIcon)
    this.refreshTooltip()

    // Refresh the elapsed time in the tooltip while a timer runs.
    if (running && !this.tooltipTimer) {
      this.tooltipTimer = setInterval(() => this.refreshTooltip(), 30_000)
    } else if (!running && this.tooltipTimer) {
      clearInterval(this.tooltipTimer)
      this.tooltipTimer = null
    }

    const last = [...state.entries]
      .filter((e) => e.end !== null)
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0]

    const template: Electron.MenuItemConstructorOptions[] = running
      ? [
          { label: `Running: ${truncate(running.description || '(no description)', 40)}`, enabled: false },
          { label: 'Stop timer', click: () => this.actions.stopTimer() }
        ]
      : [
          { label: 'Start new timer', click: () => this.actions.startNew() },
          ...(last
            ? [
                {
                  label: `Continue: ${truncate(last.description || '(no description)', 40)}`,
                  click: () => this.actions.continueLast()
                }
              ]
            : [])
        ]

    template.push(
      { type: 'separator' },
      { label: 'Show Time Tracker', click: () => this.actions.showWindow() },
      { label: 'Quit', click: () => this.actions.quit() }
    )
    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  /** Tells the user (once per session, Windows only) that closing the window kept the app running. */
  notifyHiddenToTray(): void {
    if (this.hiddenNoticeShown || process.platform !== 'win32') return
    this.hiddenNoticeShown = true
    this.tray.displayBalloon({
      iconType: 'info',
      title: 'Time Tracker is still running',
      content: 'Timers keep running in the system tray. Right-click the tray icon and choose Quit to exit.'
    })
  }

  destroy(): void {
    if (this.tooltipTimer) clearInterval(this.tooltipTimer)
    this.tray.destroy()
  }

  private refreshTooltip(): void {
    const running = this.state?.entries.find((e) => e.end === null)
    if (!running) {
      this.tray.setToolTip('Time Tracker: no timer running')
      return
    }
    const elapsed = formatDuration(entryDurationMs(running, new Date()), { seconds: false })
    const label = truncate(running.description || '(no description)', 50)
    this.tray.setToolTip(`Time Tracker: ${elapsed} on ${label}`)
  }
}
