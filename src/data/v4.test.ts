// Schema 4: migration, plan settings, personal to-dos, events, plan versions, backup of the new tables.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { KilnDB } from './db'
import { fixtureTexts, validateParts } from './fixtures'
import { planWeight, practiceConfig, practiceLanguage } from './plan-settings'
import {
  eventsBetween,
  getPlan,
  importPlan,
  insertRecord,
  listModules,
  listPersonalTodos,
  listTasks,
  setPersonalTodoDone,
  setPlanShare,
  softDeletePlan,
  updateRecord,
} from './repo'
import { scheduleAll } from './schedule'
import { newDb } from './test-db'
import { uuidv7 } from './uuid'
import { listPlanVersions, MAX_VERSIONS, planFromRecords, readSnapshot, snapshotPlan } from './versions'

const TODAY = '2026-11-09' // a Monday
const sd = () => validateParts([fixtureTexts.sd]).plans[0]!

const dp0 = { source: 'plan' as const, perDay: 1, startDifficulty: 'easy' as const, topicFollowsLessons: true }

describe('migration to version 4', () => {
  it('keeps version 3 data and maps plan weight to share (1-2 less, 3 even, 4-5 more)', async () => {
    const name = `test-${uuidv7()}`
    const v3 = new Dexie(name)
    v3.version(3).stores({
      plans: 'id, key, updatedAt',
      modules: 'id, [planId+key], planId, updatedAt',
      tasks: 'id, [planId+key], planId, moduleId, scheduledDate, pinnedDate, status, *topics, updatedAt',
      reviewCards: 'id, taskId, planId, due, updatedAt',
      reviewLogs: 'id, cardId, reviewedAt, updatedAt',
      practiceLog: 'id, date, slug, updatedAt',
      practiceItems: 'id, [planId+date+slug], date, planId, updatedAt',
      settings: 'id, updatedAt',
      meta: 'key',
    })
    const plan = (id: string, weight: number) => ({ id, key: id, title: id, schedulingMode: 'auto', sources: [], weight, startDate: TODAY, partTotal: 1, partsIn: [1], updatedAt: 7, deleted: false, deviceId: 'd' })
    await v3.table('plans').bulkAdd([plan('w1', 1), plan('w2', 2), plan('w3', 3), plan('w4', 4), plan('w5', 5)])
    const task = { id: 't1', planId: 'w3', key: 'a', moduleId: 'm', title: 'A', status: 'done', updatedAt: 7, deleted: false, deviceId: 'd' }
    await v3.table('tasks').add(task)
    v3.close()

    const db = new KilnDB(name)
    await db.open()
    expect(db.verno).toBe(4)
    const plans = await db.plans.orderBy('key').toArray()
    expect(plans.map((p) => [p.key, p.share, p.weight])).toEqual([
      ['w1', 'less', 2],
      ['w2', 'less', 2],
      ['w3', 'even', 3],
      ['w4', 'more', 5],
      ['w5', 'more', 5],
    ])
    // No updatedAt bump: every device migrates the same way, so the upgrade must not win a sync.
    expect(plans.every((p) => p.updatedAt === 7)).toBe(true)
    expect(await db.tasks.get('t1')).toEqual(task)
    expect(await db.personalTodos.count()).toBe(0)
    await insertRecord(db, 'events', { title: 'Exam', date: TODAY, allDay: true })
    expect(await db.events.count()).toBe(1)
  })
})

describe('plan settings', () => {
  it('setPlanShare writes share and the matching weight', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd(), { startDate: TODAY })
    expect(await getPlan(db, planId)).toMatchObject({ share: 'even', weight: 3 })
    await setPlanShare(db, planId, 'more')
    expect(await getPlan(db, planId)).toMatchObject({ share: 'more', weight: 5 })
  })

  it('planWeight prefers the share; practiceConfig follows the toggle', () => {
    expect(planWeight({ weight: 1 })).toBe(1)
    expect(planWeight({ weight: 1, share: 'more' })).toBe(5)
    const dp = { source: 'plan' as const, perDay: 2, startDifficulty: 'medium' as const, topicFollowsLessons: false }
    expect(practiceConfig({ dailyPractice: dp })).toBe(dp)
    expect(practiceConfig({ dailyPractice: dp, dailyPracticeOn: false })).toBeUndefined()
    expect(practiceConfig({})).toBeUndefined()
    expect(practiceConfig({ dailyPracticeOn: true })).toMatchObject({ source: 'neetcode', perDay: 1 })
  })

  it('practiceLanguage names the language of the plan, Python when none', () => {
    expect(practiceLanguage({})).toBe('Python')
    expect(practiceLanguage({ dailyPractice: { ...dp0, language: 'javascript' } })).toBe('JavaScript')
    expect(practiceLanguage({ dailyPractice: { ...dp0, language: 'rust' } })).toBe('Rust')
  })
})

describe('personal to-dos and events', () => {
  it('lists to-dos by date (undated last) and toggles done', async () => {
    const db = newDb()
    const later = await insertRecord(db, 'personalTodos', { title: 'Later', date: '2026-11-12', done: false })
    const undated = await insertRecord(db, 'personalTodos', { title: 'Someday', done: false })
    const first = await insertRecord(db, 'personalTodos', { title: 'First', date: TODAY, minutes: 30, done: false })
    expect((await listPersonalTodos(db)).map((t) => t.id)).toEqual([first.id, later.id, undated.id])
    const done = await setPersonalTodoDone(db, first.id, true)
    expect(done).toMatchObject({ done: true, completedAt: expect.any(Number) })
    expect(done!.updatedAt).toBeGreaterThan(first.updatedAt)
    expect(await setPersonalTodoDone(db, first.id, false)).toMatchObject({ done: false, completedAt: undefined })
  })

  it('eventsBetween includes multi-day events that started earlier', async () => {
    const db = newDb()
    const week = await insertRecord(db, 'events', { title: 'Reading week', date: '2026-11-02', endDate: '2026-11-10', allDay: true })
    const lecture = await insertRecord(db, 'events', { title: 'Lecture', date: TODAY, allDay: false, start: new Date(2026, 10, 9, 10).getTime() })
    await insertRecord(db, 'events', { title: 'Old', date: '2026-11-01', allDay: true })
    await insertRecord(db, 'events', { title: 'Next', date: '2026-11-20', allDay: true })
    expect((await eventsBetween(db, TODAY, TODAY)).map((e) => e.id)).toEqual([week.id, lecture.id])
  })

  it('scheduleAll counts dated to-dos with minutes as fixed load; events and undated to-dos take no time', async () => {
    const db = newDb()
    await importPlan(db, sd(), { startDate: TODAY })
    await scheduleAll(db, TODAY)
    const dayLoad = (out: Awaited<ReturnType<typeof scheduleAll>>) => out.days.find((d) => d.date === TODAY)?.taskMinutes ?? 0

    const db2 = newDb()
    await importPlan(db2, sd(), { startDate: TODAY })
    await insertRecord(db2, 'personalTodos', { title: 'Dentist', date: TODAY, minutes: 90, done: false })
    await insertRecord(db2, 'personalTodos', { title: 'Undated', minutes: 60, done: false })
    await insertRecord(db2, 'events', { title: 'Class', date: TODAY, allDay: true })
    const withTodo = await scheduleAll(db2, TODAY)
    // Default Monday budget is 120: plan work today shrinks by the to-do's 90 minutes (first task may still overrun).
    expect(dayLoad(withTodo)).toBeGreaterThanOrEqual(90)
    const planToday = (await Promise.all((await db2.plans.toArray()).map((p) => listTasks(db2, p.id)))).flat().filter((t) => t.scheduledDate === TODAY)
    const planTodayBase = (await Promise.all((await db.plans.toArray()).map((p) => listTasks(db, p.id)))).flat().filter((t) => t.scheduledDate === TODAY)
    expect(planToday.length).toBeLessThan(planTodayBase.length)
  })

  it('softDeletePlan tombstones the plan events and versions (snapshot emptied)', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd(), { startDate: TODAY })
    const ev = await insertRecord(db, 'events', { title: 'Exam', date: TODAY, allDay: true, planId })
    const other = await insertRecord(db, 'events', { title: 'Other', date: TODAY, allDay: true })
    const v = await snapshotPlan(db, planId, { summary: 'Imported' })
    await softDeletePlan(db, planId)
    expect(await db.events.get(ev.id)).toMatchObject({ deleted: true })
    expect(await db.events.get(other.id)).toMatchObject({ deleted: false })
    expect(await db.planVersions.get(v.id)).toMatchObject({ deleted: true, snapshot: '' })
  })
})

describe('plan versions', () => {
  it('a snapshot reads back as the plan file content, and re-imports without changing anything', async () => {
    const db = newDb()
    const plan = sd()
    const { planId } = await importPlan(db, plan, { startDate: TODAY })
    const v = await snapshotPlan(db, planId, { summary: 'Imported', label: 'First' })
    expect(v).toMatchObject({ planId, summary: 'Imported', label: 'First', deleted: false })
    const back = await readSnapshot(v)
    expect(back.tasks.map((t) => [t.id, t.moduleId, t.title, t.estimatedMinutes])).toEqual(plan.tasks.map((t) => [t.id, t.moduleId, t.title, t.estimatedMinutes]))
    expect(back.modules.map((m) => m.id)).toEqual([...plan.modules].sort((a, b) => a.order - b.order).map((m) => m.id))
    const again = await importPlan(db, back, { startDate: TODAY })
    expect(again).toMatchObject({ created: false, tasksAdded: 0, tasksUpdated: 0, modulesAdded: 0 })
  })

  it('keeps the newest 20 per plan and empties the pruned ones', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd(), { startDate: TODAY })
    const ids: string[] = []
    for (let i = 1; i <= MAX_VERSIONS + 3; i++) {
      await updateRecord(db, 'plans', planId, { title: `Title ${i}` })
      ids.push((await snapshotPlan(db, planId, { summary: `Edit ${i}` })).id)
    }
    const list = await listPlanVersions(db, planId)
    expect(list).toHaveLength(MAX_VERSIONS)
    expect(list.map((v) => v.id)).toEqual(ids.slice(3).reverse())
    expect((await readSnapshot(list[0]!)).title).toBe(`Title ${MAX_VERSIONS + 3}`)
    for (const id of ids.slice(0, 3)) expect(await db.planVersions.get(id)).toMatchObject({ deleted: true, snapshot: '' })
    await expect(readSnapshot((await db.planVersions.get(ids[0]!))!)).rejects.toThrow('no longer available')
  })

  it('planFromRecords leaves out app state and tasks of missing modules', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd(), { startDate: TODAY })
    const p = (await getPlan(db, planId))!
    const [first, ...rest] = await listModules(db, planId)
    const tasks = await listTasks(db, planId)
    const file = planFromRecords(p, rest, tasks)
    expect(file.id).toBe(p.key)
    expect(file.tasks.some((t) => t.moduleId === first!.key)).toBe(false)
    expect(file.tasks.every((t) => !('status' in t) && !('planId' in t) && !('scheduledDate' in t))).toBe(true)
  })
})

describe('backup', () => {
  it('round-trips the new tables and plan fields', async () => {
    const a = newDb()
    const { planId } = await importPlan(a, sd(), { startDate: TODAY })
    await updateRecord(a, 'plans', planId, { favorite: true, dailyPracticeOn: false })
    await insertRecord(a, 'personalTodos', { title: 'Call', date: TODAY, minutes: 15, done: false, notes: 'n' })
    await insertRecord(a, 'events', { title: 'Lab', date: TODAY, allDay: false, start: 1, end: 2, course: 'BIO 101', url: 'https://lms.example/e/1', feedId: 'f', uid: 'u@x', planId })
    await insertRecord(a, 'feeds', { lms: 'canvas', url: 'https://canvas.example/feeds/calendars/user_abc.ics', planIds: [planId], lastFetchedAt: 5, lastResult: { ok: true, added: 3, changed: 1 } })
    await snapshotPlan(a, planId, { summary: 'Imported' })

    const b = newDb()
    const result = await importBackup(b, await exportBackup(a))
    for (const t of ['personalTodos', 'events', 'planVersions', 'feeds'] as const) {
      expect(result[t]).toMatchObject({ added: 1 })
      expect(await b.table(t).toArray()).toEqual(await a.table(t).toArray())
    }
    expect(await b.plans.get(planId)).toEqual(await a.plans.get(planId))
  })

  it('rejects a feed that is not https', async () => {
    const a = newDb()
    await insertRecord(a, 'feeds', { lms: 'other', url: 'http://example.com/cal.ics', planIds: [] })
    await expect(importBackup(newDb(), await exportBackup(a))).rejects.toThrow(/feeds/)
  })
})
