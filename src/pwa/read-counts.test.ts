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
  return { db, tasks, planId }
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

  const problemRow = (planId: string, id: string, date: string, status: 'open' | 'done', deleted = false) =>
    ({ id, planId, date, slug: id, title: id, difficulty: 'easy', minutes: 15, status, deleted, updatedAt: 1, deviceId: 'd' }) as const

  it('counts stored daily problems like the app badge does', async () => {
    const { db, planId } = await seeded()
    await db.plans.update(planId, { dailyPracticeOn: true })
    const row = (id: string, date: string, status: 'open' | 'done', deleted = false) =>
      ({ id, planId, date, slug: id, title: id, difficulty: 'easy', minutes: 15, status, deleted, updatedAt: 1, deviceId: 'd' }) as const
    await db.practiceItems.bulkPut([row('a', TODAY, 'open'), row('b', '2026-11-08', 'open'), row('c', TODAY, 'done'), row('d', TODAY, 'open', true), row('e', '2026-11-10', 'open')])
    const r = await readBreakdown(indexedDB, NOW, db.name)
    expect(r.today).toBe(4) // 3 tasks + problem a
    expect(r.overdue).toBe(2) // 1 task + problem b
  })

  it('leaves out daily problems and their review cards of a plan with daily practice switched off', async () => {
    const { db, planId } = await seeded()
    const before = await readBreakdown(indexedDB, NOW, db.name)
    await db.practiceItems.bulkPut([problemRow(planId, 'a', TODAY, 'open'), problemRow(planId, 'b', '2026-11-08', 'open')])
    const card = { id: 'c1', planId, slug: 'a', topics: [], due: NOW.getTime() - 1000, stability: 1, difficulty: 1, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 2, minutes: 10, suspended: false, deleted: false, updatedAt: 1, deviceId: 'd' }
    await db.reviewCards.put(card as never)
    const on = async (value: boolean | undefined) => {
      await db.plans.update(planId, { dailyPracticeOn: value })
      return readBreakdown(indexedDB, NOW, db.name)
    }
    const off = await on(false)
    expect([off.today, off.overdue, off.reviews]).toEqual([before.today, before.overdue, before.reviews])
    const enabled = await on(true)
    expect([enabled.today, enabled.overdue, enabled.reviews]).toEqual([before.today + 1, before.overdue + 1, before.reviews + 1])
    expect(enabled.total).toBe((await on(true)).total)
  })

  it('counts open personal to-dos due today or earlier like the app badge does', async () => {
    const { db } = await seeded()
    const before = await readBreakdown(indexedDB, NOW, db.name)
    const todo = (id: string, date: string | undefined, done = false) => ({ id, title: id, date, done, deleted: false, updatedAt: 1, deviceId: 'd' })
    await db.personalTodos.bulkPut([todo('a', TODAY), todo('b', '2026-11-01'), todo('c', TODAY, true), todo('d', undefined), todo('e', '2026-11-10')])
    const r = await readBreakdown(indexedDB, NOW, db.name)
    expect([r.today - before.today, r.overdue - before.overdue]).toEqual([1, 1])
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
