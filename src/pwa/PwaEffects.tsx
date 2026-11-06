// Everything that runs in the background of the app: service worker, badge, daily ping, push
// times, automatic sync, and "open To Do" messages from a tapped notification. Renders nothing.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, dueCards, getSettings, tasksByStatus } from '../data'
import { badgeCount } from '../domain/badge'
import { toLocalISODate } from '../lib/date'
import { applyBadge } from './badge'
import { API_URL } from './env'
import { pingIfDue } from './ping'
import { syncPush } from './push-client'
import { registerServiceWorker } from './register'
import { scheduleSync } from './sync-runner'

/** The number on the app icon: today's open and overdue tasks plus due reviews. Follows the local day. */
function useBadgeCount(): number {
  const [today, setToday] = useState(() => toLocalISODate(new Date()))
  useEffect(() => {
    const refresh = () => setToday(toLocalISODate(new Date()))
    const id = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return useLiveQuery(async () => badgeCount(await tasksByStatus(db, 'open'), await dueCards(db, today), today), [today], 0)
}

// StrictMode runs effects twice in development; the once-per-open work happens once.
let opened = false

export function PwaEffects() {
  const navigate = useNavigate()
  const count = useBadgeCount()

  useEffect(() => {
    void applyBadge(navigator, count)
  }, [count])

  useEffect(() => {
    if (opened) return
    opened = true
    registerServiceWorker()
    void pingIfDue(db, fetch, API_URL, toLocalISODate(new Date()))
    void getSettings(db).then((s) => syncPush(db, s)).catch(() => undefined)
    scheduleSync(0)
  }, [])

  // Sync again when the connection comes back or the app returns to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleSync()
    }
    const onOnline = () => scheduleSync()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // A tapped notification asks an open window to show the To Do page.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; to?: string } | null
      if (data?.type === 'open' && typeof data.to === 'string' && data.to.startsWith('/')) void navigate(data.to)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return null
}
