import { describe, expect, it } from 'vitest'
import type { Plan } from '../domain/plan-format'
import { addDaysISO } from '../lib/date'
import { fixtureTexts, validateParts } from './fixtures'
import { importPlan, softDeletePlan, updateRecord, updateSettings } from './repo'
import { scheduleAll, topUpStudy } from './schedule'
import { studyEvents } from './streaks'
import { completeStudy, studyItemId, STUDY_WINDOW_DAYS } from './study'
import { newDb } from './test-db'

// Monday. The worked example's budget: 60 min Monday to Friday, 120 Saturday, Sunday off; 3 h a week is
// Mon-Fri 25 min and Saturday 55.
const TODAY = '2026-11-09'
const psych: Plan = { schemaVersion: 1, id: 'study-psychology', title: 'Psychology', subject: 'Psychology', schedulingMode: 'auto', studyMinutesPerWeek: 180, sources: [], modules: [], tasks: [] }

async function seeded() {
  const db = newDb()
  await updateSettings(db, { minutesPerWeekday: [60, 60, 60, 60, 60, 120, 0] })
  const { planId } = await importPlan(db, psych, { startDate: TODAY })
  await scheduleAll(db, TODAY)
  return { db, planId }
}
const live = async (db: Awaited<ReturnType<typeof seeded>>['db']) => (await db.studyItems.orderBy('date').toArray()).filter((r) => !r.deleted)

describe('persistStudy (through scheduleAll)', () => {
  it('stores sessions from today through the window, with ids of plan and day', async () => {
    const { db, planId } = await seeded()
    const rows = await live(db)
    expect(rows[0]).toMatchObject({ id: studyItemId(planId, TODAY), planId, date: TODAY, minutes: 25, status: 'open' })
    expect(rows.find((r) => r.date === '2026-11-14')?.minutes).toBe(55)
    expect(rows.every((r) => r.id === `${planId}:${r.date}`)).toBe(true)
    expect(rows.at(-1)!.date <= addDaysISO(TODAY, STUDY_WINDOW_DAYS)).toBe(true)
    expect(rows.at(-1)!.date >= addDaysISO(TODAY, STUDY_WINDOW_DAYS - 2)).toBe(true)
    // Running again writes nothing new.
    const before = (await db.studyItems.toArray()).map((r) => r.updatedAt)
    await scheduleAll(db, TODAY)
    expect((await db.studyItems.toArray()).map((r) => r.updatedAt)).toEqual(before)
  })

  it('tombstones a missed session the next day and moves its minutes to the rest of the week', async () => {
    const { db, planId } = await seeded()
    await scheduleAll(db, '2026-11-10')
    expect((await db.studyItems.get(studyItemId(planId, TODAY)))?.deleted).toBe(true)
    expect((await live(db)).filter((r) => r.date <= '2026-11-15').map((r) => r.minutes)).toEqual([30, 30, 30, 30, 60])
  })

  it('never touches a done session; the rest of the week stays as it was', async () => {
    const { db, planId } = await seeded()
    const id = studyItemId(planId, TODAY)
    await completeStudy(db, id, Date.now())
    const done = await db.studyItems.get(id)
    await scheduleAll(db, '2026-11-10')
    expect(await db.studyItems.get(id)).toEqual(done)
    expect((await live(db)).filter((r) => r.date <= '2026-11-15').map((r) => r.minutes)).toEqual([25, 25, 25, 25, 25, 55])
  })

  it('updates minutes in place, revives a tombstoned session, and clears a plan that is no longer a study plan', async () => {
    const { db, planId } = await seeded()
    const id = studyItemId(planId, '2026-11-10')
    await updateRecord(db, 'plans', planId, { studyMinutesPerWeek: 360 })
    await scheduleAll(db, TODAY)
    expect((await db.studyItems.get(id))?.minutes).toBe(50)
    // 45 min a week fits on fewer days: Tuesday's session goes, and comes back with its id when the time goes up.
    await updateRecord(db, 'plans', planId, { studyMinutesPerWeek: 45 })
    await scheduleAll(db, TODAY)
    expect((await db.studyItems.get(id))?.deleted).toBe(true)
    await updateRecord(db, 'plans', planId, { studyMinutesPerWeek: 180 })
    await scheduleAll(db, TODAY)
    expect(await db.studyItems.get(id)).toMatchObject({ deleted: false, status: 'open', minutes: 25 })
    await updateRecord(db, 'plans', planId, { studyMinutesPerWeek: undefined })
    await scheduleAll(db, TODAY)
    expect(await live(db)).toEqual([])
  })

  it('tombstones the sessions with their plan, so they leave the history', async () => {
    const { db, planId } = await seeded()
    await completeStudy(db, studyItemId(planId, TODAY), Date.now())
    expect(await studyEvents(db)).toHaveLength(1)
    await softDeletePlan(db, planId)
    expect(await live(db)).toEqual([])
    expect(await studyEvents(db)).toEqual([])
  })
})

describe('completeStudy', () => {
  it('marks the session done (it counts toward the streak with its minutes), and undo reopens it', async () => {
    const { db, planId } = await seeded()
    const id = studyItemId(planId, TODAY)
    const before = (await live(db)).map((r) => [r.id, r.minutes])
    const r = await completeStudy(db, id, 1234)
    expect(r.item).toMatchObject({ status: 'done', completedAt: 1234 })
    expect(await studyEvents(db)).toEqual([{ at: 1234, minutes: 25 }])
    // Nothing else moves.
    expect((await live(db)).map((x) => [x.id, x.minutes])).toEqual(before)
    expect(await r.undo()).toBe(true)
    expect(await db.studyItems.get(id)).toMatchObject({ status: 'open' })
    expect((await db.studyItems.get(id))?.completedAt).toBeUndefined()
    expect(await studyEvents(db)).toEqual([])
    await expect(completeStudy(db, studyItemId(planId, '2020-01-01'), 1)).rejects.toThrow()
  })
})

describe('topUpStudy', () => {
  it('runs the scheduler once a day when a study plan exists', async () => {
    const { db } = await seeded()
    expect(await topUpStudy(db, '2026-11-10')).toBe(true)
    expect((await live(db))[0]!.date).toBe('2026-11-10')
    expect(await topUpStudy(db, '2026-11-10')).toBe(false)
    expect(await topUpStudy(db, '2026-11-11')).toBe(true)
  })

  it('does nothing without a study plan', async () => {
    const db = newDb()
    await importPlan(db, validateParts([fixtureTexts.sd]).plans[0]!, { startDate: TODAY })
    expect(await topUpStudy(db, TODAY)).toBe(false)
    expect(await db.studyItems.count()).toBe(0)
  })
})
