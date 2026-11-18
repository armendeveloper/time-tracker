import { addDays, startOfDay } from '@shared/time'
import type { Project } from '@shared/types'

export const PROJECT_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16'
]

/** Turns an IPC error into the message the main process meant to show. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function dayLabel(date: Date, now: Date): string {
  const today = startOfDay(now)
  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === addDays(today, -1).getTime()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  })
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function projectById(projects: Project[]): Map<string, Project> {
  return new Map(projects.map((p) => [p.id, p]))
}
