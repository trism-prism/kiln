// Runs sync for the app: on demand from Settings and automatically (open, back online, tab visible).
// Remembers the last run's summary so Settings can show it however the run started.
import { useSyncExternalStore } from 'react'
import { db } from '../data'
import { getSyncStatus, syncNow, type SyncErrorKind, type SyncSummary } from '../sync'
import { toasts } from '../ui/overlay'
import { API_URL } from './env'

export interface SyncState {
  running: boolean
  last?: SyncSummary
  /** ms epoch when `last` finished. */
  at?: number
}

let state: SyncState = { running: false }
const listeners = new Set<() => void>()
const set = (next: SyncState) => {
  state = next
  listeners.forEach((l) => l())
}

export const useSyncState = (): SyncState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => state,
  )

/** Errors the person has to act on get a toast, once per kind per page load. The rest show in Settings. */
const TOAST: Partial<Record<SyncErrorKind, { title: string; description: string }>> = {
  'wrong-key': { title: 'Sync key does not match', description: 'The server refused this key. Check it in Settings > Sync.' },
  quota: { title: 'Sync storage is full', description: 'Kiln cannot upload more until you delete something.' },
  'update-required': { title: 'Update Kiln to see all changes', description: 'Another device saved data in a newer format.' },
}
const toasted = new Set<SyncErrorKind>()

/** Syncs now and records the result. Resolves to undefined when sync is off or has no server address. */
export async function runSyncNow(): Promise<SyncSummary | undefined> {
  if (API_URL === '' || !(await getSyncStatus(db)).enabled) return undefined
  set({ ...state, running: true })
  try {
    const summary = await syncNow(db, fetch, API_URL)
    set({ running: false, last: summary, at: Date.now() })
    const kind = summary.error?.kind
    const toast = kind && TOAST[kind]
    if (kind && toast && !toasted.has(kind)) {
      toasted.add(kind)
      toasts.add(toast, { timeout: 10_000 })
    }
    return summary
  } finally {
    if (state.running) set({ ...state, running: false })
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Debounced `runSyncNow` for events that can come in bursts (visibility, online, app open). */
export function scheduleSync(delayMs = 1500): void {
  clearTimeout(timer)
  timer = setTimeout(() => void runSyncNow().catch(() => undefined), delayMs)
}
