// A record view that stays current (TSK-0038; HH-ARC-10, HH-PORT-06). The first read shows loading, then the record
// or a truthful failure state. While the record is shown it refreshes itself every `refreshSeconds` the server gives
// (portal.refresh; 0: only when asked), pauses while the tab is hidden and refreshes once it is visible again. After a
// write the caller asks for a refresh (refresh()).
// - A failed refresh never erases what was shown and never passes it off as current: the record stays, marked stale,
//   with the time of the last successful read, until a refresh succeeds.
// - An ended session (401) replaces the record with the expired state: nothing stays on screen once access is gone.
// - The record is replaced in place: the same components re-render, so focus and anything typed are kept.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Failure, Result } from './api'

export type Live<T> =
  | { phase: 'loading' }
  | { phase: 'failed'; failure: Failure; retrying: boolean }
  | {
      phase: 'ready'
      data: T
      /** The server time of the last successful read. */
      refreshedAt: Date
      /** The last refresh failed: what is shown is from refreshedAt. */
      stale: boolean
      refreshing: boolean
    }

export type LiveView<T> = { live: Live<T>; refresh: () => Promise<void> }

const serverTime = (data: { refreshedAt: string }) => new Date(data.refreshedAt)

export function useLive<T extends { refreshedAt: string; refreshSeconds: number }>(
  load: () => Promise<Result<T>>,
  key: string,
): LiveView<T> {
  const [live, setLive] = useState<Live<T>>({ phase: 'loading' })
  const loadRef = useRef(load)
  loadRef.current = load
  const inFlight = useRef<Promise<void> | null>(null)

  const refresh = useCallback(() => {
    // One read at a time: a tick that lands during a manual refresh joins it.
    if (inFlight.current) return inFlight.current
    setLive((l) =>
      l.phase === 'ready' ? { ...l, refreshing: true } : l.phase === 'failed' ? { ...l, retrying: true } : l,
    )
    const run = (async () => {
      const r = await loadRef.current()
      setLive((l) => {
        if (r.ok)
          return { phase: 'ready', data: r.data, refreshedAt: serverTime(r.data), stale: false, refreshing: false }
        if (r.failure === 'expired' || l.phase !== 'ready')
          return { phase: 'failed', failure: r.failure, retrying: false }
        // Keep what was shown, marked stale; never as current.
        return { ...l, stale: true, refreshing: false }
      })
    })()
    inFlight.current = run.finally(() => {
      inFlight.current = null
    })
    return inFlight.current
  }, [])

  useEffect(() => {
    setLive({ phase: 'loading' })
    void refresh()
  }, [key, refresh])

  const seconds = live.phase === 'ready' ? live.data.refreshSeconds : 0
  useEffect(() => {
    if (seconds <= 0) return
    const tick = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    const timer = setInterval(tick, seconds * 1000)
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [seconds, refresh])

  return { live, refresh }
}
