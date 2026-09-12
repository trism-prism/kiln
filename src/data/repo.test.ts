import { describe, expect, it, vi } from 'vitest'
import type { KilnDB } from './db'
import { fixtureTexts, validateParts } from './fixtures'
import {
  DEFAULT_SETTINGS,
  getDeviceId,
  getPlanByKey,
  insertRecord,
  getSettings,
  importPlan,
  isPlanComplete,
  listModules,
  listPlans,
  listTasks,
  revertWrite,
  setTaskStatus,
  softDelete,
  softDeletePlan,
  tasksScheduledBetween,
  updateRecord,
  updateSettings,
} from './repo'
import { newDb } from './test-db'

const dsa = validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans
const sd = validateParts([fixtureTexts.sd]).plans[0]!
const opts = { startDate: '2026-11-09' }

describe('importPlan with the real fixtures', () => {
  it('skips tasks of a module the user deleted, without throwing', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const gone = (await listModules(db, planId))[0]!
    const inGone = sd.tasks.filter((t) => t.moduleId === gone.key)
    expect(inGone.length).toBeGreaterThan(0)
    await softDelete(db, 'modules', gone.id)
    const changed = structuredClone(sd)
    changed.tasks.push({ ...structuredClone(inGone[0]!), id: 'new-in-deleted-module' })
    const r = await importPlan(db, changed, opts)
    expect(r).toMatchObject({ tasksAdded: 0, modulesAdded: 0 })
    expect(await db.tasks.filter((t) => t.key === 'new-in-deleted-module').count()).toBe(0)
  })

  it('imports the DSA parts in order, then the system design plan', async () => {
    const db = newDb()
    const results = []
    for (const p of dsa) results.push(await importPlan(db, p, opts))
    const sdResult = await importPlan(db, sd, { ...opts, share: 'less' })

    expect(results.map((r) => [r.created, r.partsIn, r.complete])).toEqual([
      [true, [1], false],
      [false, [1, 2], false],
      [false, [1, 2, 3], true],
    ])
    expect(new Set(results.map((r) => r.planId)).size).toBe(1)
    expect(sdResult.created).toBe(true)
    expect(sdResult.complete).toBe(true)

    const plans = await listPlans(db)
    expect(plans).toHaveLength(2)
    const dsaPlan = plans.find((p) => p.key === dsa[0]!.id)!
    const sdPlan = plans.find((p) => p.key === sd.id)!
    expect(isPlanComplete(dsaPlan)).toBe(true)
    expect(sdPlan).toMatchObject({ share: 'less', weight: 2 })

    const dsaTasks = await listTasks(db, dsaPlan.id)
    expect(dsaTasks).toHaveLength(dsa.reduce((n, p) => n + p.tasks.length, 0))
    expect(dsaTasks).toHaveLength(85)
    expect(await listTasks(db, sdPlan.id)).toHaveLength(34)
    expect(await listModules(db, dsaPlan.id)).toHaveLength(11)
    expect(await listModules(db, sdPlan.id)).toHaveLength(5)
    expect(dsaTasks.every((t) => t.status === 'open' && !t.deleted && t.deviceId !== '')).toBe(true)
  })

  it('refuses a later part before part 1', async () => {
    await expect(importPlan(newDb(), dsa[1]!, opts)).rejects.toThrow(/part 1/)
  })

  it('re-import keeps progress, adds new keys and removes nothing', async () => {
    const db = newDb()
    const first = await importPlan(db, sd, opts)
    const tasks = await listTasks(db, first.planId)
    const done = tasks.find((t) => t.key === sd.tasks[0]!.id)!
    await setTaskStatus(db, done.id, 'done')
    await updateRecord(db, 'tasks', done.id, { scheduledDate: '2026-11-10' })

    const changed = structuredClone(sd)
    changed.tasks[0]!.title = 'Renamed task'
    const extra = { ...structuredClone(changed.tasks[1]!), id: 'brand-new-task' }
    changed.tasks = [extra, ...changed.tasks.slice(0, -1)] // drops the last task, adds one
    const again = await importPlan(db, changed, opts)

    expect(again).toMatchObject({ created: false, planId: first.planId, tasksAdded: 1, tasksUpdated: 1, modulesAdded: 0 })
    const after = await listTasks(db, first.planId)
    expect(after).toHaveLength(tasks.length + 1)
    const kept = after.find((t) => t.id === done.id)!
    expect(kept).toMatchObject({ title: 'Renamed task', status: 'done', scheduledDate: '2026-11-10' })
    expect(kept.completedAt).toBeTypeOf('number')
    expect(await listPlans(db)).toHaveLength(1)
  })

  it('an unchanged re-import writes nothing', async () => {
    const db = newDb()
    await importPlan(db, sd, opts)
    const before = await db.tasks.toArray()
    const r = await importPlan(db, sd, opts)
    expect(r).toMatchObject({ tasksAdded: 0, tasksUpdated: 0 })
    expect(await db.tasks.toArray()).toEqual(before)
  })
})

describe('writes and reads', () => {
  it('soft delete sets the tombstone, bumps updatedAt, and reads hide it', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const t = (await listTasks(db, planId))[0]!
    await softDelete(db, 'tasks', t.id)
    const raw = await db.tasks.get(t.id)
    expect(raw).toMatchObject({ deleted: true, deviceId: await getDeviceId(db) })
    expect(raw!.updatedAt).toBeGreaterThanOrEqual(t.updatedAt)
    expect(await listTasks(db, planId)).toHaveLength(sd.tasks.length - 1)

    await softDeletePlan(db, planId)
    expect(await listPlans(db)).toEqual([])
    expect(await listTasks(db, planId)).toEqual([])
    expect(await listModules(db, planId)).toEqual([])
    expect(await db.tasks.count()).toBe(sd.tasks.length)
  })

  it('does not bring a deleted task back on re-import', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    await softDelete(db, 'tasks', (await listTasks(db, planId))[0]!.id)
    await importPlan(db, sd, opts)
    expect(await listTasks(db, planId)).toHaveLength(sd.tasks.length - 1)
  })

  it('finds tasks by scheduled date range', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const [a, b, c] = await listTasks(db, planId)
    await updateRecord(db, 'tasks', a!.id, { scheduledDate: '2026-11-09' })
    await updateRecord(db, 'tasks', b!.id, { scheduledDate: '2026-11-12' })
    await updateRecord(db, 'tasks', c!.id, { scheduledDate: '2026-11-20' })
    expect((await tasksScheduledBetween(db, '2026-11-09', '2026-11-12')).map((t) => t.id).sort()).toEqual([a!.id, b!.id].sort())
  })

  it('settings default until saved, then persist', async () => {
    const db = newDb()
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS)
    const saved = await updateSettings(db, { theme: 'dark', nudgeEnabled: true })
    expect(await getSettings(db)).toMatchObject({ theme: 'dark', nudgeEnabled: true, reminderTime: '08:00', reviewCapPercent: 25 })
    expect(saved.deviceId).toBe(await getDeviceId(db))
    expect(DEFAULT_SETTINGS.minutesPerWeekday).toHaveLength(7)
  })

  it('keeps the same device id', async () => {
    const db = newDb()
    expect(await getDeviceId(db)).toBe(await getDeviceId(db))
  })

  it('updateRecord ignores missing and deleted rows and writes nothing', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const t = (await listTasks(db, planId))[0]!
    await softDelete(db, 'tasks', t.id)
    const before = await db.tasks.get(t.id)
    expect(await updateRecord(db, 'tasks', t.id, { status: 'done' })).toBeUndefined()
    expect(await updateRecord(db, 'tasks', 'nope', { status: 'done' })).toBeUndefined()
    expect(await db.tasks.get(t.id)).toEqual(before)
    expect(await db.tasks.get('nope')).toBeUndefined()
  })

  it('does not cache a failed device id lookup', async () => {
    const flaky = {
      transaction: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('device-1'),
    } as unknown as KilnDB
    await expect(getDeviceId(flaky)).rejects.toThrow('boom')
    expect(await getDeviceId(flaky)).toBe('device-1')
  })

  it('getPlanByKey picks the smallest id when plans share a key', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const plan = (await db.plans.get(planId))!
    for (const id of ['00000000-0000-7000-8000-000000000000', 'ffffffff-ffff-7fff-8fff-ffffffffffff']) {
      await db.plans.add({ ...plan, id })
    }
    expect((await getPlanByKey(db, sd.id))!.id).toBe('00000000-0000-7000-8000-000000000000')
  })

  it('getSettings ignores a deleted settings row, and saving revives it', async () => {
    const db = newDb()
    await updateSettings(db, { theme: 'dark' })
    await softDelete(db, 'settings', 'settings')
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS)
    expect(await updateSettings(db, { nudgeEnabled: true })).toMatchObject({ deleted: false, theme: 'system', nudgeEnabled: true })
  })

  it('softDeletePlan also tombstones review cards, review logs and practice log rows of the plan', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, opts)
    const { planId: otherId } = await importPlan(db, dsa[0]!, opts)
    const card = { stability: 1, difficulty: 1, scheduledDays: 1, learningSteps: 0, reps: 0, lapses: 0, state: 0, due: 1, topics: [], minutes: 10 }
    const mine = await insertRecord(db, 'reviewCards', { ...card, planId })
    const theirs = await insertRecord(db, 'reviewCards', { ...card, planId: otherId })
    const log = { rating: 3, state: 0, due: 1, stability: 1, difficulty: 1, scheduledDays: 1, learningSteps: 0, reviewedAt: 1 }
    const myLog = await insertRecord(db, 'reviewLogs', { ...log, cardId: mine.id })
    const theirLog = await insertRecord(db, 'reviewLogs', { ...log, cardId: theirs.id })
    const pl = { date: '2026-11-09', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy' as const, completedAt: 1 }
    const myPractice = await insertRecord(db, 'practiceLog', { ...pl, planId })
    const loosePractice = await insertRecord(db, 'practiceLog', pl)

    await softDeletePlan(db, planId)
    const gone = async (name: 'reviewCards' | 'reviewLogs' | 'practiceLog', id: string) => (await db.table(name).get(id)).deleted
    expect([await gone('reviewCards', mine.id), await gone('reviewLogs', myLog.id), await gone('practiceLog', myPractice.id)]).toEqual([true, true, true])
    expect([await gone('reviewCards', theirs.id), await gone('reviewLogs', theirLog.id), await gone('practiceLog', loosePractice.id)]).toEqual([false, false, false])
  })
})

describe('revertWrite remove', () => {
  it('removes a record only while it is as the write left it, when given its updatedAt', async () => {
    const db = newDb()
    const rec = await insertRecord(db, 'personalTodos', { title: 'Psychology', date: '2026-11-08', minutes: 30, done: true, completedAt: 1 })
    await updateRecord(db, 'personalTodos', rec.id, { minutes: 45 }) // edited in To Do after it was logged
    expect(await revertWrite(db, { remove: [['personalTodos', rec.id, rec.updatedAt]] })).toBe(false)
    expect((await db.personalTodos.get(rec.id))!.deleted).toBe(false)

    const fresh = await insertRecord(db, 'personalTodos', { title: 'Spanish', minutes: 20, done: true, completedAt: 1 })
    expect(await revertWrite(db, { remove: [['personalTodos', fresh.id, fresh.updatedAt]] })).toBe(true)
    expect((await db.personalTodos.get(fresh.id))!.deleted).toBe(true)
  })
})
