import { describe, expect, it } from 'vitest'
import { buildStudyDays, heatLevel, heatmapColumns, streakStats, type DayStudy } from './index'

const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour).getTime()
const ev = (month: number, day: number, minutes = 20, hour = 12) => ({ at: at(month, day, hour), minutes })
const days = (...list: [string, number?][]) => new Map<string, DayStudy>(list.map(([d, minutes = 30]) => [d, { count: 1, minutes }]))
const TODAY = '2026-11-11'

describe('buildStudyDays', () => {
  it('groups completions by local day, late evening included', () => {
    const m = buildStudyDays([ev(11, 9, 20), ev(11, 9, 30), ev(11, 10, 10, 23)])
    expect(m.get('2026-11-09')).toEqual({ count: 2, minutes: 50 })
    expect(m.get('2026-11-10')).toEqual({ count: 1, minutes: 10 }) // 23:00 stays on the 10th
    expect(m.size).toBe(2)
  })
})

describe('streakStats', () => {
  it('is zero with nothing done', () => {
    expect(streakStats(new Map(), TODAY)).toEqual({ current: 0, longest: 0, studyDays: 0, completions: 0, minutes: 0 })
  })

  it('counts today when it is done', () => {
    const s = streakStats(days(['2026-11-09'], ['2026-11-10'], ['2026-11-11']), TODAY)
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
  })

  it('keeps the streak through today while today is not done yet', () => {
    const s = streakStats(days(['2026-11-09'], ['2026-11-10']), TODAY)
    expect(s.current).toBe(2)
  })

  it('is broken by a missed day, and the longest run is remembered', () => {
    const d = days(['2026-11-01'], ['2026-11-02'], ['2026-11-03'], ['2026-11-04'], ['2026-11-07'], ['2026-11-08'])
    const s = streakStats(d, TODAY)
    expect(s.current).toBe(0) // 9th and 10th missed
    expect(s.longest).toBe(4)
    expect(s.studyDays).toBe(6)
    expect(streakStats(days(['2026-11-01'], ['2026-11-02'], ['2026-11-03'], ['2026-11-05']), '2026-11-06').current).toBe(1) // 4th missed
  })

  it('is kept through missed days only when they are rest days', () => {
    expect(streakStats(days(['2026-11-08']), TODAY).current).toBe(0) // 9th and 10th are working days
    const rest = new Set(['2026-11-09', '2026-11-10'])
    expect(streakStats(days(['2026-11-08']), TODAY, (d) => rest.has(d)).current).toBe(1)
  })

  it('bridges blackout and zero-budget days without counting them', () => {
    const rest = new Set(['2026-11-05', '2026-11-06']) // a blackout and a zero-minute weekday
    const s = streakStats(days(['2026-11-04'], ['2026-11-07'], ['2026-11-08']), '2026-11-08', (d) => rest.has(d))
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
  })

  it('counts study done on a rest day', () => {
    const s = streakStats(days(['2026-11-06'], ['2026-11-07'], ['2026-11-08']), '2026-11-08', (d) => d === '2026-11-07')
    expect(s.current).toBe(3)
  })

  it('sums completions and minutes', () => {
    const s = streakStats(buildStudyDays([ev(11, 9, 20), ev(11, 9, 30), ev(11, 11, 15)]), TODAY)
    expect([s.completions, s.minutes, s.studyDays]).toEqual([3, 65, 2])
  })
})

describe('heatLevel', () => {
  it('has four levels by minutes and 0 for nothing done', () => {
    const lv = (minutes: number, count = 1) => heatLevel({ count, minutes })
    expect(heatLevel(undefined)).toBe(0)
    expect(lv(0, 0)).toBe(0)
    expect(lv(0)).toBe(1) // done, but no minutes on record: still shows
    expect([lv(1), lv(30), lv(31), lv(60), lv(61), lv(120), lv(121), lv(600)]).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('heatmapColumns', () => {
  it('has 52 Monday-first columns ending in the current week, with the rest of that week in the future', () => {
    const cols = heatmapColumns(days(['2026-11-09', 45], ['2026-11-11', 130]), TODAY) // Wednesday
    expect(cols).toHaveLength(52)
    expect(cols.every((c) => c.length === 7)).toBe(true)
    const last = cols.at(-1)!
    expect(last.map((c) => c.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(last.map((c) => c.future)).toEqual([false, false, false, true, true, true, true])
    expect(last.map((c) => c.level)).toEqual([2, 0, 4, 0, 0, 0, 0])
    expect(cols[0]![0]!.date).toBe('2025-11-17') // 51 weeks before that Monday
    expect(new Set(cols.flat().map((c) => c.date)).size).toBe(364)
  })

  it('carries the count and minutes of a day for its label', () => {
    const cell = heatmapColumns(new Map([['2026-11-10', { count: 3, minutes: 95 }]]), TODAY).at(-1)![1]!
    expect(cell).toMatchObject({ date: '2026-11-10', count: 3, minutes: 95, level: 3 })
  })
})
