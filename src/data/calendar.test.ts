import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCalendar, readCalendar, rowStates, type CalendarImport } from './calendar'
import { getPlanByKey, listPlans, softDelete } from './repo'
import { scheduleAll } from './schedule'
import { newDb } from './test-db'
import type { KilnDB } from './db'

const CANVAS = readFileSync(new URL('../../fixtures/calendars/canvas.ics', import.meta.url), 'utf8')
const START = '2030-01-07'
const ALL = ['MATH-221-001', 'HIST-110', 'CS-150']

function input(text: string, over: Partial<CalendarImport> = {}): CalendarImport {
  const { items, rows } = readCalendar(text)
  return { items, rows, courses: ALL, startDate: START, ...over }
}

const tasksOf = async (db: KilnDB, key: string) => {
  const plan = await getPlanByKey(db, key)
  return (await db.tasks.where('planId').equals(plan!.id).toArray()).filter((t) => !t.deleted).sort((a, b) => a.order - b.order)
}

describe('importCalendar', () => {
  it('makes one plan per ticked course, assignments as tasks with deadlines, class times and exams as events', async () => {
    const db = newDb()
    const res = await importCalendar(db, input(CANVAS))
    expect(res).toMatchObject({ tasksAdded: 9, datesChanged: 0, eventsAdded: 3, eventsUpdated: 0 })
    const plans = await listPlans(db)
    expect(plans.map((p) => [p.key, p.title, p.schedulingMode]).sort()).toEqual([
      ['course-cs-150', 'CS-150', 'fixed'],
      ['course-hist-110', 'HIST-110', 'fixed'],
      ['course-math-221-001', 'MATH-221-001', 'fixed'],
    ])
    const math = await tasksOf(db, 'course-math-221-001')
    expect(math.map((t) => t.title)).toEqual(['Problem Set 3', 'Quiz 2', 'Prepare for Midterm Exam'])
    expect(math.every((t) => t.deadline !== undefined)).toBe(true)
    expect((await tasksOf(db, 'course-cs-150')).map((t) => t.estimatedMinutes)).toEqual([80, 80, 80])

    const events = (await db.events.toArray()).sort((a, b) => a.date.localeCompare(b.date))
    expect(events.map((e) => [e.title, e.course, e.allDay])).toEqual([
      ['Lecture: Limits', 'MATH-221-001', false],
      ['Midterm Exam', 'MATH-221-001', false],
      ['Field trip', 'HIST-110', true],
    ])
    expect(events[2]).toMatchObject({ date: '2030-03-10', endDate: '2030-03-12' })
    expect(events[0]?.planId).toBe((await getPlanByKey(db, 'course-math-221-001'))?.id)
    expect(events[0]?.uid).toBe('event-calendar-event-2001')

    // The scheduler places every task on or before its due date.
    await scheduleAll(db, START)
    for (const t of await db.tasks.toArray()) {
      expect(t.scheduledDate, t.title).toBeDefined()
      expect(t.scheduledDate! <= t.deadline!, `${t.title} ${t.scheduledDate} ${t.deadline}`).toBe(true)
    }
  })

  it('imports only ticked courses and rows', async () => {
    const db = newDb()
    const all = input(CANVAS)
    await importCalendar(db, { ...all, courses: ['HIST-110'], rows: all.rows.filter((r) => r.title !== 'Reading: Chapter 6') })
    expect((await listPlans(db)).map((p) => p.key)).toEqual(['course-hist-110'])
    expect((await tasksOf(db, 'course-hist-110')).map((t) => t.title)).toEqual([
      expect.stringMatching(/^Essay 1: .* \(session 1 of 2\)$/),
      expect.stringMatching(/^Essay 1: .* \(session 2 of 2\)$/),
    ])
    expect((await db.events.toArray()).map((e) => e.title)).toEqual(['Field trip'])
  })

  it('re-import matches by UID: keeps progress and edits, moves due dates, adds new items, does not duplicate events', async () => {
    const db = newDb()
    const first = input(CANVAS)
    // The person shortens the problem set in the grid before importing.
    first.rows = first.rows.map((r) => (r.title === 'Problem Set 3' ? { ...r, minutes: 45 } : r))
    await importCalendar(db, first)
    const [ps] = await tasksOf(db, 'course-math-221-001')
    await db.tasks.update(ps!.id, { status: 'done', completedAt: 1 })
    const plan = await getPlanByKey(db, 'course-math-221-001')
    await db.plans.update(plan!.id, { title: 'Calculus I', goal: 'Pass' })

    const moved = CANVAS.replace(/20300212T045900Z/g, '20300214T045900Z')
      .replace('Lecture: Limits', 'Lecture: Limits and continuity')
      .replace(
        'END:VCALENDAR',
        'BEGIN:VEVENT\nDTSTART:20300301T235900Z\nDTEND:20300301T235900Z\nSUMMARY:Homework 5 [MATH-221-001]\nUID:event-assignment-1010\nEND:VEVENT\nEND:VCALENDAR',
      )
    const again = input(moved)
    const states = await rowStates(db, again.rows)
    const status = (title: string) => states.get(again.rows.find((r) => r.title === title)!.key)
    expect(status('Problem Set 3')).toMatchObject({ status: 'changed', oldDue: first.rows.find((r) => r.title === 'Problem Set 3')!.due })
    expect(status('Homework 5')).toEqual({ status: 'new' })
    expect(status('Quiz 2')).toEqual({ status: 'same' })

    const res = await importCalendar(db, again)
    expect(res).toMatchObject({ tasksAdded: 1, datesChanged: 1, eventsAdded: 0, eventsUpdated: 1 })
    const math = await tasksOf(db, 'course-math-221-001')
    const ps2 = math.find((t) => t.id === ps!.id)!
    expect(ps2).toMatchObject({ status: 'done', estimatedMinutes: 45, deadline: again.rows.find((r) => r.title === 'Problem Set 3')!.due })
    expect(math.map((t) => t.title)).toEqual(['Problem Set 3', 'Quiz 2', 'Homework 5', 'Prepare for Midterm Exam'])
    expect(await getPlanByKey(db, 'course-math-221-001')).toMatchObject({ title: 'Calculus I', goal: 'Pass' })
    expect((await db.events.toArray()).filter((e) => !e.deleted).map((e) => e.title).sort()).toEqual(['Field trip', 'Lecture: Limits and continuity', 'Midterm Exam'])
  })

  it('leaves tasks the person deleted deleted', async () => {
    const db = newDb()
    await importCalendar(db, input(CANVAS))
    const [quiz] = (await tasksOf(db, 'course-math-221-001')).filter((t) => t.title === 'Quiz 2')
    await softDelete(db, 'tasks', quiz!.id)
    const again = input(CANVAS)
    expect((await rowStates(db, again.rows)).get(again.rows.find((r) => r.title === 'Quiz 2')!.key)).toEqual({ status: 'deleted' })
    await importCalendar(db, again)
    expect((await tasksOf(db, 'course-math-221-001')).map((t) => t.title)).not.toContain('Quiz 2')
  })

  it('stores the feed with its plans for keep in sync and reuses it for the same link', async () => {
    const db = newDb()
    const feed = { lms: 'canvas' as const, url: 'https://canvas.example.edu/feeds/calendars/user_abc.ics' }
    const res = await importCalendar(db, input(CANVAS, { courses: ['HIST-110'], feed }))
    const [rec] = await db.feeds.toArray()
    expect(rec).toMatchObject({ ...feed, planIds: res.planIds, lastResult: { ok: true, added: 3, changed: 0 } })
    expect((await db.events.toArray())[0]?.feedId).toBe(rec!.id)
    await importCalendar(db, input(CANVAS, { courses: ['CS-150'], feed }))
    const feeds = await db.feeds.toArray()
    expect(feeds).toHaveLength(1)
    expect(feeds[0]?.planIds).toHaveLength(2)
  })

  it('refuses rows due before the start date with a clear error', async () => {
    const db = newDb()
    await expect(importCalendar(db, input(CANVAS, { startDate: '2031-01-01' }))).rejects.toThrow(/^MATH-221-001: /)
  })
})
