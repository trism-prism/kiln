// Today's counts straight from IndexedDB without Dexie or React, so the service worker stays small.
// Reads the tables the app's own queries read (src/data/mastery.ts liveCards) and counts with domain/badge.
import { badgeBreakdown, type BadgeBreakdown } from '../domain/badge'
import { toLocalISODate } from '../lib/date'

interface Row {
  id: string
  deleted?: boolean
}
interface TaskRow extends Row {
  status: string
  scheduledDate?: string
}
interface PracticeRow extends Row {
  status: string
  date: string
}
interface CardRow extends Row {
  taskId?: string
  due: number
  suspended?: boolean
}

/** Opens the app's database if it exists. A missing database stays missing (the upgrade is aborted). */
function open(idb: IDBFactory, name: string): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    const req = idb.open(name)
    req.onupgradeneeded = () => req.transaction?.abort()
    req.onsuccess = () => resolve(req.result)
    req.onerror = (e) => {
      e.preventDefault()
      resolve(undefined)
    }
    req.onblocked = () => resolve(undefined)
  })
}

function all<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

/** Open and overdue tasks plus due reviews for the local day of `now`. All zero when the app was never opened. */
export async function readBreakdown(idb: IDBFactory, now: Date, name = 'kiln'): Promise<BadgeBreakdown> {
  const today = toLocalISODate(now)
  const db = await open(idb, name)
  if (!db) return badgeBreakdown([], [], today)
  try {
    const [tasks, cards, problems] = await Promise.all([
      all<TaskRow>(db, 'tasks'),
      all<CardRow>(db, 'reviewCards'),
      all<PracticeRow>(db, 'practiceItems'), // stored daily problems; absent in a version 2 database
    ])
    const live = tasks.filter((t) => !t.deleted)
    const alive = new Set(live.map((t) => t.id))
    // One card per task (the smallest id), none for deleted tasks or suspended cards.
    const seen = new Set<string>()
    const due: { due: number }[] = []
    for (const c of cards.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (c.deleted) continue
      if (c.taskId) {
        if (!alive.has(c.taskId) || seen.has(c.taskId)) continue
        seen.add(c.taskId)
      }
      if (!c.suspended) due.push(c)
    }
    const items = [...live, ...problems.filter((p) => !p.deleted).map((p) => ({ status: p.status, scheduledDate: p.date }))]
    return badgeBreakdown(items, due, today)
  } finally {
    db.close()
  }
}
