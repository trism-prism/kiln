import { describe, expect, it } from 'vitest'
import { NEETCODE_SLUGS } from '../domain/practice'
import { validatePlan } from '../domain/plan-format'
import { fixtureTexts, validateParts } from './fixtures'
import { completeTask } from './mastery'
import { importPlan, listPlans, listTasks, setTaskStatus } from './repo'
import { scheduleAll } from './schedule'
import { localDate } from '../domain/mastery'
import { newDb } from './test-db'

const TODAY = '2026-11-09' // a Monday

async function loadFixtures() {
  const db = newDb()
  for (const p of validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans) await importPlan(db, p, { startDate: TODAY, reviewsOn: true })
  for (const p of validateParts([fixtureTexts.sd]).plans) await importPlan(db, p, { startDate: TODAY, reviewsOn: true })
  return db
}

describe('scheduleAll with the real fixtures and the default budget', () => {
  it('places every core task, keeps the dates stable, and moves only overdue tasks on reschedule', async () => {
    const db = await loadFixtures()
    const out = await scheduleAll(db, TODAY)

    const plans = await listPlans(db)
    const tasks = (await Promise.all(plans.map((p) => listTasks(db, p.id)))).flat()
    const core = tasks.filter((t) => t.priority === 'core')
    expect(core.length).toBeGreaterThan(90)
    expect(core.filter((t) => !t.scheduledDate)).toEqual([])
    expect(out.unplaceable).toEqual([])
    expect(out.violations).toEqual([])
    expect(tasks.every((t) => t.scheduledDate && !t.backlog)).toBe(true)

    // Dependencies land on a later day than what they depend on.
    const byKey = new Map(tasks.map((t) => [`${t.planId}|${t.key}`, t]))
    for (const t of tasks) for (const k of t.dependsOn) expect((byKey.get(`${t.planId}|${k}`) as typeof t).scheduledDate! < t.scheduledDate!).toBe(true)

    // The DSA plan asks for a daily NeetCode problem; it is generated, never a duplicate of a plan problem.
    expect(out.practice.length).toBeGreaterThan(30)
    const planSlugs = new Set(tasks.flatMap((t) => (t.practice?.slug ? [t.practice.slug] : [])))
    expect(out.practice.some((g) => planSlugs.has(g.slug))).toBe(false)
    expect(out.practice[0]?.difficulty).toBe('easy')

    const finish = Object.fromEntries(plans.map((p) => [p.key, out.projectedFinish[p.id]]))
    console.log('projected finish dates (start 2026-11-09, 120 min weekdays, 180 min weekends):', finish)
    console.log('daily problems generated:', out.practice.length, 'last day:', out.days.at(-1)?.date)

    // A second run changes nothing.
    const before = JSON.stringify(tasks.map((t) => [t.id, t.scheduledDate]))
    await scheduleAll(db, TODAY)
    const again = (await Promise.all(plans.map((p) => listTasks(db, p.id)))).flat()
    expect(JSON.stringify(again.map((t) => [t.id, t.scheduledDate]))).toBe(before)

    // Two weeks later nothing was done: reschedule moves overdue tasks only, and they land on or after the new today.
    const later = '2026-11-23'
    const was = new Map(again.map((t) => [t.id, t.scheduledDate!]))
    await scheduleAll(db, later, { mode: 'reschedule' })
    const after = (await Promise.all(plans.map((p) => listTasks(db, p.id)))).flat()
    for (const t of after) {
      if (was.get(t.id)! >= later) expect(t.scheduledDate).toBe(was.get(t.id))
      else expect(t.scheduledDate! >= later).toBe(true)
    }
    expect(after.some((t) => t.scheduledDate !== was.get(t.id))).toBe(true)
  })

  it('leaves done tasks alone and honours skipOptional', async () => {
    const db = await loadFixtures()
    await scheduleAll(db, TODAY)
    const plans = await listPlans(db)
    const tasks = (await Promise.all(plans.map((p) => listTasks(db, p.id)))).flat()
    const first = tasks.find((t) => t.scheduledDate === TODAY)!
    await setTaskStatus(db, first.id, 'done')
    await scheduleAll(db, '2026-11-12', { mode: 'reschedule', skipOptional: true })
    const after = (await Promise.all(plans.map((p) => listTasks(db, p.id)))).flat()
    expect(after.find((t) => t.id === first.id)?.scheduledDate).toBe(TODAY)
    const optional = after.filter((t) => t.priority === 'optional')
    expect(optional.length).toBeGreaterThan(0)
    expect(optional.every((t) => t.backlog === true && t.scheduledDate === undefined)).toBe(true)
  })
})

describe('known slugs', () => {
  it('lets validatePlan warn about a LeetCode slug that is not in the NeetCode list', () => {
    const text = fixtureTexts.dsa1
    const plan = validatePlan(text, { knownSlugs: new Set(['two-sum']) })
    expect(plan.issues.some((i) => i.severity === 'warning' && /not in Kiln's problem list/.test(i.message))).toBe(true)
    const real = validatePlan(text, { knownSlugs: NEETCODE_SLUGS })
    const unknown = real.issues.filter((i) => /not in Kiln's problem list/.test(i.message)).length
    console.log('fixture dsa-part1 slugs missing from the bundled list:', unknown)
  })
})

describe('scheduleAll with review cards', () => {
  it('reserves the minutes of stored reviews on the day they are due', async () => {
    const db = await loadFixtures()
    const lesson = (await listTasks(db, (await listPlans(db))[0]!.id)).find((t) => t.type === 'lesson')!
    const { card } = await completeTask(db, lesson.id, 'again', new Date(2026, 10, 9, 9).getTime(), { fuzz: false })
    const out = await scheduleAll(db, TODAY)
    const day = out.days.find((d) => d.date === localDate(card!.due))
    expect(day?.reviewMinutes).toBe(card!.minutes)
    // an explicit input still wins
    const none = await scheduleAll(db, TODAY, { mode: 'reschedule', reviewsDue: {} })
    expect(none.days.every((d) => d.reviewMinutes === 0)).toBe(true)
  })
})
