import { describe, expect, it } from 'vitest'
import { studySessions, type SchedPlan, type ScheduleInput } from './index'

// 2026-11-09 is a Monday. The worked example's budget: 60 min Monday to Friday, 120 Saturday, Sunday off.
const MON = '2026-11-09'
const EXAMPLE = [60, 60, 60, 60, 60, 120, 0]
const study = (id: string, minutes: number, o: Partial<SchedPlan> = {}): SchedPlan => ({ id, weight: 3, startDate: MON, studyMinutesPerWeek: minutes, ...o })
const input = (o: Partial<ScheduleInput> = {}): ScheduleInput => ({
  plans: [study('p', 180)],
  tasks: [],
  minutesPerWeekday: EXAMPLE,
  blackoutDates: [],
  today: MON,
  mode: 'initial',
  ...o,
})
/** Sessions from `from` to `to` inclusive, as date -> minutes (one plan) or "plan date" -> minutes. */
const between = (o: Partial<ScheduleInput>, from: string, to: string, byPlan = false) =>
  Object.fromEntries(
    studySessions(input(o))
      .filter((s) => s.date >= from && s.date <= to)
      .map((s) => [byPlan ? `${s.planId} ${s.date}` : s.date, s.minutes]),
  )
const total = (m: Record<string, number>) => Object.values(m).reduce((n, x) => n + x, 0)
const WEEK1 = ['2026-11-09', '2026-11-15'] as const

describe('studySessions', () => {
  it('splits 3 h a week by each day: Mon-Fri 25 min, Saturday 55 (the worked example)', () => {
    expect(between({}, ...WEEK1)).toEqual({ '2026-11-09': 25, '2026-11-10': 25, '2026-11-11': 25, '2026-11-12': 25, '2026-11-13': 25, '2026-11-14': 55 })
    // Every full week is the same.
    expect(total(between({}, '2026-11-16', '2026-11-22'))).toBe(180)
  })

  it('uses 5-minute units that add up to the week', () => {
    const out = between({ plans: [study('p', 100)], minutesPerWeekday: Array(7).fill(45) }, ...WEEK1)
    expect(total(out)).toBe(100)
    expect(Object.values(out).every((m) => m % 5 === 0 && m >= 15)).toBe(true)
  })

  it('gives a leftover unit to the earlier day on a tie', () => {
    expect(between({ plans: [study('p', 155)], minutesPerWeekday: Array(7).fill(60) }, ...WEEK1)).toEqual({
      '2026-11-09': 25,
      '2026-11-10': 25,
      '2026-11-11': 25,
      '2026-11-12': 20,
      '2026-11-13': 20,
      '2026-11-14': 20,
      '2026-11-15': 20,
    })
  })

  it('spreads a missed Monday over the rest of the week, and never lists a past day', () => {
    expect(between({ today: '2026-11-10' }, ...WEEK1)).toEqual({ '2026-11-10': 30, '2026-11-11': 30, '2026-11-12': 30, '2026-11-13': 30, '2026-11-14': 60 })
  })

  it("leaves a day with a done session out and counts its minutes", () => {
    const out = between({ studyDone: [{ planId: 'p', date: MON, minutes: 25 }] }, ...WEEK1)
    expect(out).toEqual({ '2026-11-10': 25, '2026-11-11': 25, '2026-11-12': 25, '2026-11-13': 25, '2026-11-14': 55 })
  })

  it('merges sessions under 15 minutes into fewer days', () => {
    // 50 min over 7 equal days would be 5-10 min each.
    expect(between({ plans: [study('p', 50)], minutesPerWeekday: Array(7).fill(60) }, ...WEEK1)).toEqual({ '2026-11-09': 20, '2026-11-10': 15, '2026-11-11': 15 })
  })

  it('plans nothing more in a week when less than 15 minutes are left', () => {
    const out = between({ studyDone: [{ planId: 'p', date: MON, minutes: 170 }] }, ...WEEK1)
    expect(out).toEqual({})
    expect(total(between({ studyDone: [{ planId: 'p', date: MON, minutes: 170 }] }, '2026-11-16', '2026-11-22'))).toBe(180)
  })

  it('keeps a session within 120 minutes and within the day', () => {
    expect(between({ minutesPerWeekday: [200, 0, 0, 0, 0, 0, 0] }, ...WEEK1)).toEqual({ '2026-11-09': 120 })
    // Catch-up on the last day of the week is capped at that day's minutes; the rest is left out.
    expect(between({ plans: [study('p', 210)], minutesPerWeekday: Array(7).fill(30), today: '2026-11-15' }, ...WEEK1)).toEqual({ '2026-11-15': 30 })
  })

  it('skips days off and shrinks the week by their share; a whole week off has no study', () => {
    expect(between({ blackoutDates: ['2026-11-11'] }, ...WEEK1)).toEqual({ '2026-11-09': 25, '2026-11-10': 25, '2026-11-12': 25, '2026-11-13': 25, '2026-11-14': 55 })
    const off = Array.from({ length: 7 }, (_, i) => `2026-11-${String(9 + i).padStart(2, '0')}`)
    expect(between({ blackoutDates: off }, ...WEEK1)).toEqual({})
  })

  it('prorates a first week that starts later and a last week that ends early', () => {
    expect(between({ plans: [study('p', 180, { startDate: '2026-11-12' })] }, ...WEEK1)).toEqual({ '2026-11-12': 25, '2026-11-13': 25, '2026-11-14': 55 })
    expect(between({ plans: [study('p', 180, { deadline: '2026-11-17' })] }, '2026-11-16', '2030-01-01')).toEqual({ '2026-11-16': 25, '2026-11-17': 25 })
  })

  it('plans nothing before a future start or after the end date', () => {
    expect(between({ plans: [study('p', 180, { startDate: '2026-12-01' })] }, MON, '2026-11-30')).toEqual({})
    expect(studySessions(input({ plans: [study('p', 180, { startDate: '2026-10-01', deadline: '2026-11-01' })] }))).toEqual([])
  })

  it('scales every plan down together when they ask for more than a week holds', () => {
    const out = between({ plans: [study('a', 420), study('b', 420)] }, ...WEEK1, true)
    for (const id of ['a', 'b']) expect(Object.entries(out).filter(([k]) => k.startsWith(id)).reduce((n, [, m]) => n + m, 0)).toBe(210)
    expect(out['a 2026-11-09']! + out['b 2026-11-09']!).toBe(60)
  })

  it('caps a later plan (by id) at what is left of the day', () => {
    const out = studySessions(input({ plans: [study('b', 280), study('a', 700)], minutesPerWeekday: Array(7).fill(120) })).filter((s) => s.date <= WEEK1[1])
    const perDay = new Map<string, number>()
    for (const s of out) perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.minutes)
    expect([...perDay.values()].every((m) => m <= 120)).toBe(true)
    expect(out.filter((s) => s.planId === 'a').reduce((n, s) => n + s.minutes, 0)).toBe(600)
    expect(out.filter((s) => s.planId === 'b').reduce((n, s) => n + s.minutes, 0)).toBeLessThan(240)
  })

  it('cuts weeks by the week start setting', () => {
    const done = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((date) => ({ planId: 'p', date, minutes: 30 }))
    const o = { plans: [study('p', 210, { startDate: '2026-11-01' })], minutesPerWeekday: Array(7).fill(60), today: '2026-11-14', studyDone: done }
    expect(between(o, '2026-11-14', '2026-11-15')).toEqual({ '2026-11-14': 30, '2026-11-15': 30 })
    // Sunday weeks: Saturday the 14th ends the week, so it takes the rest; Sunday the 15th starts a new one.
    expect(between({ ...o, weekStartsOn: 'sunday' }, '2026-11-14', '2026-11-15')).toEqual({ '2026-11-14': 60, '2026-11-15': 30 })
  })

  it('plans nothing without study minutes or without study plans', () => {
    expect(studySessions(input({ minutesPerWeekday: Array(7).fill(0) }))).toEqual([])
    expect(studySessions(input({ plans: [{ id: 'p', weight: 3, startDate: MON }] }))).toEqual([])
  })

  it('is deterministic and dated by day', () => {
    const a = studySessions(input({ plans: [study('b', 90), study('a', 200)] }))
    expect(studySessions(input({ plans: [study('a', 200), study('b', 90)] }))).toEqual(a)
    expect([...a].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.planId < y.planId ? -1 : 1))).toEqual(a)
  })
})
