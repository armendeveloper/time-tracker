import { useCallback, useEffect, useState } from 'react'
import type { AppData } from '@shared/types'
import { errorMessage } from '../lib/format'

export interface AppStateHook {
  state: AppData | null
  loadError: string | null
  /** Runs a call that returns the new state, and applies that state. Rethrows errors. */
  apply: (call: () => Promise<AppData>) => Promise<AppData>
}

export function useAppState(): AppStateHook {
  const [state, setState] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = window.api.onStateChanged((next) => {
      if (active) setState(next)
    })
    window.api
      .getState()
      .then((next) => active && setState(next))
      .catch((error: unknown) => active && setLoadError(errorMessage(error)))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const apply = useCallback(async (call: () => Promise<AppData>) => {
    const next = await call()
    setState(next)
    return next
  }, [])

  return { state, loadError, apply }
}
