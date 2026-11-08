// Everything that runs in the background of the app: service worker, badge, daily ping, push
// times, automatic sync, and "open To Do" messages from a tapped notification. Renders nothing.
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTodoCount } from '../app/useTodoCount'
import { db, getSettings, topUpStudy } from '../data'
import { toLocalISODate } from '../lib/date'
import { toasts } from '../ui/overlay'
import { applyBadge } from './badge'
import { API_URL } from './env'
import { checkFeedsIfDue, feedNotice } from './feeds'
import { pingIfDue } from './ping'
import { syncPush } from './push-client'
import { registerServiceWorker } from './register'
import { scheduleSync } from './sync-runner'

// StrictMode runs effects twice in development; the once-per-open work happens once.
let opened = false
let feedsChecked = false

export function PwaEffects() {
  const navigate = useNavigate()
  // The same live count as the To Do badge in the shell.
  const count = useTodoCount()

  useEffect(() => {
    void applyBadge(navigator, count)
  }, [count])

  useEffect(() => {
    if (opened) return
    opened = true
    registerServiceWorker()
    void pingIfDue(db, fetch, API_URL, toLocalISODate(new Date()))
    void getSettings(db).then((s) => syncPush(db, s)).catch(() => undefined)
    void topUpStudy(db, toLocalISODate(new Date())).catch(() => undefined)
    scheduleSync(0)
  }, [])

  // Calendar links kept in sync: at most every 6 hours, on open; new items wait for the person's review.
  useEffect(() => {
    if (feedsChecked) return
    feedsChecked = true
    void checkFeedsIfDue(db, fetch, API_URL, Date.now(), toLocalISODate(new Date())).then((found) => {
      for (const c of found) {
        toasts.add({
          title: 'Your course calendar changed',
          description: feedNotice(c.added, c.changed, c.moved),
          action: { label: 'Review', onPress: () => void navigate(`/import?tab=calendar&feed=${c.feed.id}`) },
        })
      }
    })
  }, [navigate])

  // Sync again when the connection comes back or the app returns to the foreground. Coming back on a new day also
  // plans that day's study session (study time plans), as nothing else runs the scheduler overnight.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      scheduleSync()
      void topUpStudy(db, toLocalISODate(new Date())).catch(() => undefined)
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
