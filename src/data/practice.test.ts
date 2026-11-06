import { describe, expect, it } from 'vitest'
import { addDaysISO } from '../lib/date'
import { fixtureTexts, validateParts } from './fixtures'
import { brushUp, completeTask, dueCards } from './mastery'
import { completePractice } from './practice'
import { importPlan, listTasks, softDeletePlan } from './repo'
import { scheduleAll } from './schedule'
import { newDb } from './test-db'

const TODAY = '2026-11-09' // a Monday
const NOON = new Date(2026, 10, 9, 12, 0).getTime()
const NO_FUZZ = { fuzz: false }

async function seeded() {
  const db = newDb()
  let planId = ''
  for (const p of validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans) planId = (await importPlan(db, p, { startDate: TODAY })).planId
  await scheduleAll(db, TODAY)
  return { db, planId }
}

const live = async (db: ReturnType<typeof newDb>) => (await db.practiceItems.toArray()).filter((r) => !r.deleted)

describe('daily practice persistence', () => {
  it('stores the generated problems from today on, keyed by plan, date and slug', async () => {
    const { db, planId } = await seeded()
    const items = await live(db)
    expect(items.length).toBeGreaterThan(30)
    expect(items.every((i) => i.planId === planId && i.date >= TODAY && i.status === 'open')).toBe(true)
    expect(new Set(items.map((i) => `${i.planId}|${i.date}|${i.slug}`)).size).toBe(items.length)
    expect(items.some((i) => i.date === TODAY)).toBe(true)
  })

  it('is stable: a second run changes nothing', async () => {
    const { db } = await seeded()
    const before = JSON.stringify((await live(db)).sort((a, b) => (a.id < b.id ? -1 : 1)))
    await scheduleAll(db, TODAY)
    expect(JSON.stringify((await live(db)).sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(before)
  })

  it('keeps done and past items, keeps today, and refreshes later days', async () => {
    const { db } = await seeded()
    const items = await live(db)
    const first = items.find((i) => i.date === TODAY)!
    await completePractice(db, first.id, 'good', NOON, NO_FUZZ)

    // The next day: yesterday's done item stays, today's open item is kept as it is.
    const tomorrow = addDaysISO(TODAY, 1)
    const todays = (await live(db)).find((i) => i.date === tomorrow)!
    await scheduleAll(db, tomorrow)
    const after = await live(db)
    expect(after.find((i) => i.id === first.id)).toMatchObject({ status: 'done', date: TODAY })
    expect(after.find((i) => i.id === todays.id)).toBeTruthy()
    // Nothing was invented for a past day
    expect(after.filter((i) => i.date < TODAY)).toEqual([])
  })

  it('drops open past items only on reschedule', async () => {
    const { db } = await seeded()
    const day3 = addDaysISO(TODAY, 3)
    await scheduleAll(db, day3)
    expect((await live(db)).some((i) => i.date < day3 && i.status === 'open')).toBe(true)
    await scheduleAll(db, day3, { mode: 'reschedule' })
    expect((await live(db)).some((i) => i.date < day3)).toBe(false)
    expect((await live(db)).some((i) => i.date >= day3)).toBe(true)
  })

  it('does not hand out a second problem for a day that already has one, even once it is done', async () => {
    const { db } = await seeded()
    const first = (await live(db)).find((i) => i.date === TODAY)!
    await completePractice(db, first.id, 'good', NOON, NO_FUZZ)
    await scheduleAll(db, TODAY)
    expect((await live(db)).filter((i) => i.date === TODAY)).toHaveLength(1)
  })

  it('tombstones a deleted plan\'s items', async () => {
    const { db, planId } = await seeded()
    await softDeletePlan(db, planId)
    expect(await live(db)).toEqual([])
  })
})

describe('completePractice', () => {
  it('marks done, writes the practice log and creates a re-solve card; undo puts it all back', async () => {
    const { db } = await seeded()
    const item = (await live(db)).find((i) => i.date === TODAY)!
    const r = await completePractice(db, item.id, 'good', NOON, NO_FUZZ)
    expect(r.item).toMatchObject({ status: 'done', rating: 3, completedAt: NOON })
    expect(r.card).toMatchObject({ slug: item.slug, planId: item.planId, topics: [item.topic], minutes: { easy: 15, medium: 25, hard: 35 }[item.difficulty] })
    expect(r.card.taskId).toBeUndefined()
    const logRows = (await db.practiceLog.toArray()).filter((l) => !l.deleted)
    expect(logRows).toMatchObject([{ slug: item.slug, date: TODAY, rating: 3, difficulty: item.difficulty }])
    // The brush-up list shows it with the problem's title.
    const due = await dueCards(db, addDaysISO(TODAY, 30))
    expect(due.map((c) => c.slug)).toContain(item.slug)
    expect((await brushUp(db, r.card.due + 1)).map((e) => e.title)).toContain(item.title)

    await r.undo()
    expect((await db.practiceItems.get(item.id))!).toMatchObject({ status: 'open' })
    expect((await db.practiceLog.toArray()).filter((l) => !l.deleted)).toEqual([])
    expect((await db.reviewCards.toArray()).filter((c) => !c.deleted)).toEqual([])
    expect((await db.reviewLogs.toArray()).filter((c) => !c.deleted)).toEqual([])
  })

  it('rates the same card again without a second practice log row', async () => {
    const { db } = await seeded()
    const item = (await live(db)).find((i) => i.date === TODAY)!
    const a = await completePractice(db, item.id, 'good', NOON, NO_FUZZ)
    const b = await completePractice(db, item.id, 'easy', NOON + 1000, NO_FUZZ)
    expect(b.card.id).toBe(a.card.id)
    expect(b.card.reps).toBe(2)
    expect((await db.practiceLog.toArray()).filter((l) => !l.deleted)).toHaveLength(1)
    await b.undo()
    expect((await db.reviewCards.get(a.card.id))!.reps).toBe(1)
    expect((await db.practiceItems.get(item.id))!.status).toBe('done')
  })

  it('throws for a missing item', async () => {
    const { db } = await seeded()
    await expect(completePractice(db, 'nope', 'good', NOON)).rejects.toThrow(/not found/)
  })

  it('the finished problem feeds the next run\'s ramp and is not offered again', async () => {
    const { db } = await seeded()
    const item = (await live(db)).find((i) => i.date === TODAY)!
    await completePractice(db, item.id, 'good', NOON, NO_FUZZ)
    await scheduleAll(db, addDaysISO(TODAY, 1))
    expect((await live(db)).filter((i) => i.slug === item.slug)).toHaveLength(1)
  })
})

describe('completeTask undo', () => {
  it('restores a first completion (task open, card removed) and a repeat completion (card as it was)', async () => {
    const { db, planId } = await seeded()
    const lesson = (await listTasks(db, planId)).find((t) => t.type === 'lesson')!
    const first = await completeTask(db, lesson.id, 'good', NOON, NO_FUZZ)
    const card1 = first.card!
    await first.undo()
    expect(await db.tasks.get(lesson.id)).toMatchObject({ status: 'open' })
    expect((await db.reviewCards.toArray()).filter((c) => !c.deleted)).toEqual([])

    const a = await completeTask(db, lesson.id, 'good', NOON, NO_FUZZ)
    const b = await completeTask(db, lesson.id, 'easy', NOON + 60_000, NO_FUZZ)
    await b.undo()
    expect(await db.reviewCards.get(a.card!.id)).toMatchObject({ reps: 1, due: a.card!.due, deleted: false })
    expect(card1.id).not.toBe(a.card!.id)
  })
})
