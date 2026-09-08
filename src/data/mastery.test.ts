import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { badgeCount } from '../domain/badge'
import { fixtureTexts, validateParts } from './fixtures'
import { KilnDB } from './db'
import { brushUp, completeTask, dueCards, masteryByPlan, masteryByTopic, reviewCard, reviewsDue, skipTask, unskipTask } from './mastery'
import { importPlan, insertRecord, listTasks, softDelete } from './repo'
import { newDb } from './test-db'
import { uuidv7 } from './uuid'

const DAY = 86_400_000
const T0 = new Date(2026, 10, 9, 9, 0).getTime()
const NO_FUZZ = { fuzz: false }
const dsa = validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans

async function seeded() {
  const db = newDb()
  let planId = ''
  for (const part of dsa) planId = (await importPlan(db, part, { startDate: '2026-11-09' })).planId
  const tasks = await listTasks(db, planId)
  const lesson = tasks.find((t) => t.type === 'lesson')!
  const lc = tasks.find((t) => t.practice?.provider === 'leetcode' && t.practice.slug)!
  const plain = tasks.find((t) => t.type === 'milestone' || t.type === 'review' || t.type === 'project')!
  return { db, planId, tasks, lesson, lc, plain }
}

describe('completeTask', () => {
  it('creates the card on first completion, then rates the same card', async () => {
    const { db, lesson } = await seeded()
    const first = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    expect(first.task.status).toBe('done')
    expect(first.card).toMatchObject({ taskId: lesson.id, planId: lesson.planId, topics: lesson.topics, reps: 1 })
    expect(first.card!.minutes).toBe(Math.min(20, Math.max(5, Math.round(0.25 * lesson.estimatedMinutes))))
    expect(first.log).toMatchObject({ cardId: first.card!.id, rating: 3, state: 0, reviewedAt: T0 })

    const second = await completeTask(db, lesson.id, 'easy', T0 + 5 * DAY, NO_FUZZ)
    expect(second.card!.id).toBe(first.card!.id)
    expect(second.card!.reps).toBe(2)
    expect(await db.reviewCards.count()).toBe(1)
    expect(await db.reviewLogs.count()).toBe(2)
  })

  it('makes a re-solve card for a LeetCode task, with the slug and difficulty minutes', async () => {
    const { db, lc } = await seeded()
    const r = await completeTask(db, lc.id, 'hard', T0, NO_FUZZ)
    expect(r.card).toMatchObject({ slug: lc.practice!.slug, minutes: { easy: 15, medium: 25, hard: 35 }[lc.practice!.difficulty] })
  })

  it('only marks tasks without a card done', async () => {
    const { db, plain } = await seeded()
    const r = await completeTask(db, plain.id, 'good', T0, NO_FUZZ)
    expect(r.task.status).toBe('done')
    expect(r.card).toBeUndefined()
    expect(await db.reviewCards.count()).toBe(0)
  })

  it('throws for a missing or deleted task', async () => {
    const { db, lesson } = await seeded()
    await softDelete(db, 'tasks', lesson.id)
    await expect(completeTask(db, lesson.id, 'good', T0)).rejects.toThrow(/not found/)
  })

  it('stamps writes with updatedAt and deviceId', async () => {
    const { db, lesson } = await seeded()
    const { card, log } = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    expect(card!.deviceId).toBeTruthy()
    expect(card!.updatedAt).toBeGreaterThan(0)
    expect(log!.deviceId).toBe(card!.deviceId)
  })
})

describe('reviewCard and queries', () => {
  it('reviews a due card, pushing its due date out and logging it', async () => {
    const { db, lesson } = await seeded()
    const { card } = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    const r = await reviewCard(db, card!.id, 'good', card!.due, NO_FUZZ)
    expect(r.card.due).toBeGreaterThan(card!.due)
    expect(r.log).toMatchObject({ cardId: card!.id, rating: 3 })
    await expect(reviewCard(db, 'nope', 'good', T0)).rejects.toThrow(/not found/)
  })

  it('dueCards: cards due on or before the date, earliest first', async () => {
    const { db, lesson, lc } = await seeded()
    const a = await completeTask(db, lesson.id, 'easy', T0, NO_FUZZ)
    const b = await completeTask(db, lc.id, 'again', T0, NO_FUZZ)
    const bDay = new Date(b.card!.due)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(await dueCards(db, '2026-11-09')).toEqual([])
    expect((await dueCards(db, iso(bDay))).map((c) => c.id)).toEqual([b.card!.id])
    expect((await dueCards(db, '2027-12-31')).map((c) => c.id)).toEqual([b.card!.id, a.card!.id])
  })

  it('reviewsDue produces the scheduler shape from stored cards', async () => {
    const { db, lesson } = await seeded()
    const { card } = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    const out = await reviewsDue(db, '2026-11-09', '2027-12-31')
    expect(Object.values(out)).toEqual([{ count: 1, minutes: card!.minutes }])
    expect(await reviewsDue(db, '2026-11-09', '2026-11-09')).toEqual({})
  })

  it('ignores tombstoned cards and cards of deleted tasks everywhere', async () => {
    const { db, lesson, lc } = await seeded()
    const a = await completeTask(db, lesson.id, 'again', T0, NO_FUZZ)
    const b = await completeTask(db, lc.id, 'again', T0, NO_FUZZ)
    const far = T0 + 400 * DAY
    expect(await brushUp(db, far)).toHaveLength(2)
    await softDelete(db, 'reviewCards', a.card!.id)
    await softDelete(db, 'tasks', lc.id)
    expect(await brushUp(db, far)).toEqual([])
    expect(await dueCards(db, '2030-01-01')).toEqual([])
    expect(await reviewsDue(db, '2026-11-09', '2030-01-01')).toEqual({})
    expect((await masteryByTopic(db, far))[b.card!.topics[0]!]?.studied ?? 0).toBe(0)
    await expect(reviewCard(db, a.card!.id, 'good', far)).rejects.toThrow(/not found/)
  })

  it('a card is recreated if the old one was tombstoned', async () => {
    const { db, lesson } = await seeded()
    const a = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    await softDelete(db, 'reviewCards', a.card!.id)
    const b = await completeTask(db, lesson.id, 'good', T0 + DAY, NO_FUZZ)
    expect(b.card!.id).not.toBe(a.card!.id)
    expect(b.card!.reps).toBe(1)
  })

  it('brushUp lists weakest first with the task title', async () => {
    const { db, lesson, lc } = await seeded()
    await completeTask(db, lesson.id, 'good', T0 - 60 * DAY, NO_FUZZ)
    await completeTask(db, lc.id, 'good', T0 - 20 * DAY, NO_FUZZ)
    const out = await brushUp(db, T0)
    expect(out.map((i) => i.title)).toEqual([lesson.title, lc.title])
    expect(out[0]!.retrievability).toBeLessThan(out[1]!.retrievability)
  })

  it('mastery: studied vs total, never-studied counts as 0', async () => {
    const { db, planId, tasks, lesson } = await seeded()
    const topic = lesson.topics[0]!
    const eligible = tasks.filter((t) => t.topics.includes(topic) && (t.type === 'lesson' || t.practice?.provider === 'leetcode'))
    const before = (await masteryByTopic(db, T0))[topic]!
    expect(before).toEqual({ mastery: 0, total: eligible.length, studied: 0 })
    await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    const after = (await masteryByTopic(db, T0))[topic]!
    expect(after.studied).toBe(1)
    expect(after.mastery).toBeCloseTo(1 / eligible.length, 5)
    const plan = (await masteryByPlan(db, T0))[planId]!
    expect(plan.studied).toBe(1)
    expect(plan.total).toBeGreaterThanOrEqual(after.total)
  })
})

describe('atomic writes and skipping', () => {
  it('two concurrent completions of a new task make exactly one card', async () => {
    const { db, lesson } = await seeded()
    await Promise.all([completeTask(db, lesson.id, 'good', T0, NO_FUZZ), completeTask(db, lesson.id, 'good', T0, NO_FUZZ)])
    expect(await db.reviewCards.where('taskId').equals(lesson.id).count()).toBe(1)
    expect(await db.reviewLogs.count()).toBe(2)
    expect((await db.reviewCards.toArray())[0]!.reps).toBe(2)
  })

  it('a failed completion writes nothing', async () => {
    const { db, lesson } = await seeded()
    await db.reviewLogs.hook('creating', () => {
      throw new Error('boom')
    })
    await expect(completeTask(db, lesson.id, 'good', T0, NO_FUZZ)).rejects.toThrow()
    expect((await db.tasks.get(lesson.id))!.status).toBe('open')
    expect(await db.reviewCards.count()).toBe(0)
  })

  it('skipping suspends the card everywhere; unskipping or completing resumes it', async () => {
    const { db, lesson } = await seeded()
    const { card } = await completeTask(db, lesson.id, 'again', T0, NO_FUZZ)
    const far = T0 + 400 * DAY
    const seen = async () => [(await dueCards(db, '2030-01-01')).length, (await brushUp(db, far)).length, Object.keys(await reviewsDue(db, '2026-11-09', '2030-01-01')).length]
    expect(await seen()).toEqual([1, 1, 1])

    expect((await skipTask(db, lesson.id)).status).toBe('skipped')
    expect((await db.reviewCards.get(card!.id))!.suspended).toBe(true)
    expect(await seen()).toEqual([0, 0, 0])

    await unskipTask(db, lesson.id)
    expect((await db.reviewCards.get(card!.id))!.suspended).toBe(false)
    expect(await seen()).toEqual([1, 1, 1])

    await skipTask(db, lesson.id)
    await completeTask(db, lesson.id, 'good', far, NO_FUZZ)
    expect((await db.reviewCards.get(card!.id))!.suspended).toBe(false)
    await expect(skipTask(db, 'nope')).rejects.toThrow(/not found/)
  })
})

describe('review fixes', () => {
  const count = async (db: KilnDB, date: string) => {
    const tasks = (await db.tasks.toArray()).map((t) => ({ status: t.status, scheduledDate: t.scheduledDate, deleted: t.deleted }))
    return badgeCount(tasks, [], date)
  }

  it('unskipping a completed task restores done and keeps completedAt; a never-done task reopens', async () => {
    const { db, lesson, lc } = await seeded()
    await db.tasks.update(lesson.id, { scheduledDate: '2026-11-09' })
    await db.tasks.update(lc.id, { scheduledDate: '2026-11-09' })
    expect(await count(db, '2026-11-09')).toBe(2)

    const done = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    expect(await count(db, '2026-11-09')).toBe(1)
    await skipTask(db, lesson.id)
    expect((await db.tasks.get(lesson.id))!.completedAt).toBe(done.task.completedAt)
    const back = await unskipTask(db, lesson.id)
    expect(back).toMatchObject({ status: 'done', completedAt: done.task.completedAt })
    expect(await count(db, '2026-11-09')).toBe(1) // not back on the to-do list

    await skipTask(db, lc.id)
    expect(await count(db, '2026-11-09')).toBe(0)
    expect((await unskipTask(db, lc.id)).status).toBe('open')
    expect(await count(db, '2026-11-09')).toBe(1)
  })

  it('two devices each made a card for one task: queries see only the smallest id', async () => {
    const { db, lesson } = await seeded()
    const a = await completeTask(db, lesson.id, 'again', T0, NO_FUZZ)
    const { id: _id, updatedAt: _u, deleted: _d, deviceId: _v, ...fields } = a.card!
    void [_id, _u, _d, _v]
    const dup = await insertRecord(db, 'reviewCards', fields)
    const smallest = [a.card!.id, dup.id].sort()[0]
    const far = T0 + 400 * DAY
    expect((await dueCards(db, '2030-01-01')).map((c) => c.id)).toEqual([smallest])
    expect((await brushUp(db, far)).map((i) => i.card.id)).toEqual([smallest])
    expect(Object.values(await reviewsDue(db, '2026-11-09', '2030-01-01')).map((e) => e.count)).toEqual([1])
    expect((await masteryByTopic(db, far))[lesson.topics[0]!]!.studied).toBe(1)
  })

  it('cards synced from a version 1 device (no minutes, no learningSteps) still work', async () => {
    const { db, lesson } = await seeded()
    const a = await completeTask(db, lesson.id, 'good', T0, NO_FUZZ)
    const old: Record<string, unknown> = { ...a.card! }
    delete old.minutes
    delete old.learningSteps
    await db.reviewCards.put(old as never)
    const [c] = await dueCards(db, '2030-01-01')
    expect(c).toMatchObject({ learningSteps: 0, minutes: Math.min(20, Math.max(5, Math.round(0.25 * lesson.estimatedMinutes))) })
    await expect(reviewCard(db, a.card!.id, 'good', a.card!.due, NO_FUZZ)).resolves.toBeTruthy()
  })
})

describe('migration to version 2', () => {
  it('upgrades a version 1 database with cards and logs (minutes from the task, 10 when it is missing)', async () => {
    const name = `test-${uuidv7()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({
      reviewCards: 'id, taskId, planId, due, updatedAt',
      reviewLogs: 'id, cardId, reviewedAt, updatedAt',
      tasks: 'id, planId',
      meta: 'key',
    })
    const card = { id: 'c1', updatedAt: 1, deleted: false, deviceId: 'd', planId: 'p', taskId: 't', topics: ['x'], due: 5, stability: 2, difficulty: 3, elapsedDays: 4, scheduledDays: 1, reps: 1, lapses: 0, state: 2 }
    const log = { id: 'l1', updatedAt: 1, deleted: false, deviceId: 'd', cardId: 'c1', rating: 3, state: 0, due: 1, stability: 1, difficulty: 1, elapsedDays: 0, scheduledDays: 1, reviewedAt: 1 }
    const card2 = { ...card, id: 'c2', taskId: 't60' }
    await v1.table('tasks').add({ id: 't60', planId: 'p', type: 'lesson', estimatedMinutes: 60 })
    await v1.table('reviewCards').bulkAdd([card, card2])
    await v1.table('reviewLogs').add(log)
    v1.close()

    const db = new KilnDB(name)
    await db.open()
    const { elapsedDays: _c, ...cardRest } = card
    const { elapsedDays: _l, ...logRest } = log
    void _c
    void _l
    expect(await db.reviewCards.get('c1')).toEqual({ ...cardRest, learningSteps: 0, minutes: 10 })
    expect(await db.reviewLogs.get('l1')).toEqual({ ...logRest, learningSteps: 0 })
    expect(await db.reviewCards.get('c2')).toMatchObject({ minutes: 15 }) // lesson, 60 min -> 15
    expect(db.verno).toBe(4)
  })
})
