import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { dueCards, tasksByStatus } from '../data'
import { newDb } from '../data/test-db'
import { importPlan, listTasks, softDelete } from '../data'
import { fixtureTexts, validateParts } from '../data/fixtures'
import { completeTask } from '../data'
import { badgeCount } from '../domain/badge'
import { toLocalISODate } from '../lib/date'
import { handlePush, pushKind, type PushDeps } from './push-handler'
import { readBreakdown } from './read-counts'

const NOW = new Date(2026, 10, 9, 8, 0)
const TODAY = toLocalISODate(NOW)

async function seeded() {
  const db = newDb()
  const plan = validateParts([fixtureTexts.sd]).plans[0]!
  const { planId } = await importPlan(db, plan, { startDate: TODAY })
  const tasks = await listTasks(db, planId)
  // Three tasks today, one yesterday (overdue), one tomorrow (not counted).
  const at = (i: number, date: string) => db.tasks.update(tasks[i]!.id, { scheduledDate: date })
  await at(0, TODAY)
  await at(1, TODAY)
  await at(2, TODAY)
  await at(3, '2026-11-08')
  await at(4, '2026-11-10')
  return { db, tasks }
}

describe('readBreakdown (what the service worker counts)', () => {
  it('counts today, overdue and due reviews', async () => {
    const { db, tasks } = await seeded()
    // Completing a task makes a card; backdate it so it is due today.
    await completeTask(db, tasks[5]!.id, 'good', NOW.getTime() - 3 * 86_400_000, { fuzz: false })
    const r = await readBreakdown(indexedDB, NOW, db.name)
    expect(r.today).toBe(3)
    expect(r.overdue).toBe(1)
    expect(r.reviews).toBe(1)
    expect(r.total).toBe(5)
  })

  it('matches the number the app puts on the badge, including deleted tasks', async () => {
    const { db, tasks } = await seeded()
    await completeTask(db, tasks[5]!.id, 'good', NOW.getTime() - 3 * 86_400_000, { fuzz: false })
    await softDelete(db, 'tasks', tasks[1]!.id)
    await db.tasks.update(tasks[2]!.id, { status: 'done' })
    const app = badgeCount(await tasksByStatus(db, 'open'), await dueCards(db, TODAY), TODAY)
    expect((await readBreakdown(indexedDB, NOW, db.name)).total).toBe(app)
    expect(app).toBeGreaterThan(0)
  })

  it('counts stored daily problems like the app badge does', async () => {
    const { db } = await seeded()
    const row = (id: string, date: string, status: 'open' | 'done', deleted = false) =>
      ({ id, planId: 'p', date, slug: id, title: id, difficulty: 'easy', minutes: 15, status, deleted, updatedAt: 1, deviceId: 'd' }) as const
    await db.practiceItems.bulkPut([row('a', TODAY, 'open'), row('b', '2026-11-08', 'open'), row('c', TODAY, 'done'), row('d', TODAY, 'open', true), row('e', '2026-11-10', 'open')])
    const r = await readBreakdown(indexedDB, NOW, db.name)
    expect(r.today).toBe(4) // 3 tasks + problem a
    expect(r.overdue).toBe(2) // 1 task + problem b
  })

  it('returns zeros and creates nothing when the app never ran', async () => {
    const name = 'never-opened'
    const r = await readBreakdown(indexedDB, NOW, name)
    expect(r.total).toBe(0)
    const dbs = await indexedDB.databases()
    expect(dbs.map((d) => d.name)).not.toContain(name)
  })

  it('works on an empty database', async () => {
    const db = newDb()
    await db.open()
    expect((await readBreakdown(indexedDB, NOW, db.name)).total).toBe(0)
  })
})

describe('pushKind', () => {
  it('reads the kind and falls back to a reminder', () => {
    expect(pushKind({ json: () => ({ kind: 'nudge' }) })).toBe('nudge')
    expect(pushKind({ json: () => ({ kind: 'reminder' }) })).toBe('reminder')
    expect(pushKind({ json: () => ({ kind: 'other' }) })).toBe('reminder')
    expect(pushKind({ json: () => { throw new Error('not json') } })).toBe('reminder')
    expect(pushKind(null)).toBe('reminder')
  })
})

describe('handlePush', () => {
  it('shows the count and sets the badge', async () => {
    const { db } = await seeded()
    const show = vi.fn<PushDeps['show']>(async () => {})
    const setAppBadge = vi.fn(async () => {})
    await handlePush({ json: () => ({ kind: 'reminder' }) }, { indexedDB, now: () => NOW, show, badge: { setAppBadge }, dbName: db.name })
    expect(show).toHaveBeenCalledTimes(1)
    expect(show.mock.calls[0]?.[0]).toBe('Kiln')
    expect(show.mock.calls[0]?.[1]).toMatchObject({ body: '4 tasks today (1 overdue)', tag: 'kiln-daily' })
    expect(setAppBadge).toHaveBeenCalledWith(4)
  })

  it('says all done for a nudge when nothing is open, and clears the badge', async () => {
    const db = newDb()
    await db.open()
    const show = vi.fn<PushDeps['show']>(async () => {})
    const clearAppBadge = vi.fn(async () => {})
    await handlePush({ json: () => ({ kind: 'nudge' }) }, { indexedDB, now: () => NOW, show, badge: { clearAppBadge }, dbName: db.name })
    expect(show.mock.calls[0]?.[1]).toMatchObject({ body: 'All done for today' })
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('still shows a notification when the database cannot be read', async () => {
    const show = vi.fn<PushDeps['show']>(async () => {})
    const broken = {
      open: () => {
        throw new Error('blocked')
      },
    } as unknown as IDBFactory
    await handlePush({ json: () => ({ kind: 'nudge' }) }, { indexedDB: broken, now: () => NOW, show, badge: {} })
    expect(show).toHaveBeenCalledTimes(1)
    expect(show.mock.calls[0]?.[1]).toMatchObject({ body: "Open Kiln to see today's tasks" })
  })
})
