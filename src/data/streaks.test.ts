import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStudyDays } from '../domain/streaks'
import { fixtureTexts, validateParts } from './fixtures'
import { completeTask, reviewCard } from './mastery'
import { completePractice } from './practice'
import { importPlan, listTasks, softDelete } from './repo'
import { scheduleAll } from './schedule'
import { studyEvents } from './streaks'
import { newDb } from './test-db'

const TODAY = '2026-11-09'
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()
const NO_FUZZ = { fuzz: false }

async function seeded() {
  const db = newDb()
  let planId = ''
  for (const p of validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans) planId = (await importPlan(db, p, { startDate: TODAY })).planId
  await scheduleAll(db, TODAY)
  return { db, planId }
}

// completeTask stamps the task with the real clock, so freeze Date at the moment under test.
const clock = (ms: number) => vi.useFakeTimers({ toFake: ['Date'], now: ms })
afterEach(() => vi.useRealTimers())

describe('studyEvents', () => {
  it('is empty with nothing done', async () => {
    const { db } = await seeded()
    expect(await studyEvents(db)).toEqual([])
  })

  it('counts a completed task once (its first rating is not a second event), a completed problem once, and later reviews', async () => {
    const { db, planId } = await seeded()
    const task = (await listTasks(db, planId)).find((t) => t.scheduledDate === TODAY && t.type === 'lesson')!
    clock(at(9))
    const done = await completeTask(db, task.id, 'good', at(9), NO_FUZZ)
    const problem = (await db.practiceItems.toArray()).find((p) => p.date === TODAY)!
    await completePractice(db, problem.id, 'good', at(9, 13), NO_FUZZ)
    const events = await studyEvents(db)
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.minutes).sort()).toEqual([task.estimatedMinutes, problem.minutes].sort())

    // A review of the task's card two days later is a third event, on its own day.
    await reviewCard(db, done.card!.id, 'good', at(11))
    const days = buildStudyDays(await studyEvents(db))
    expect([...days.keys()].sort()).toEqual(['2026-11-09', '2026-11-11'])
    expect(days.get('2026-11-09')!.count).toBe(2)
    expect(days.get('2026-11-11')!.count).toBe(1)
    expect(days.get('2026-11-11')!.minutes).toBe(done.card!.minutes)
  })

  it('drops a completion that was undone or deleted', async () => {
    const { db, planId } = await seeded()
    const task = (await listTasks(db, planId)).find((t) => t.scheduledDate === TODAY && t.type === 'lesson')!
    clock(at(9))
    const done = await completeTask(db, task.id, 'good', at(9), NO_FUZZ)
    expect(await studyEvents(db)).toHaveLength(1)
    expect(await done.undo()).toBe(true)
    expect(await studyEvents(db)).toEqual([])
    const again = await completeTask(db, task.id, 'good', at(9), NO_FUZZ)
    await softDelete(db, 'tasks', again.task.id)
    expect(await studyEvents(db)).toEqual([])
  })
})
