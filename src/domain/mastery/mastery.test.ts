import { describe, expect, it } from 'vitest'
import {
  brushUp,
  cardMinutes,
  localDate,
  masteryByPlan,
  masteryByTopic,
  newCard,
  rate,
  retrievability,
  reviewsDue,
  type CardState,
  type RatingName,
} from './index'

const DAY = 86_400_000
const T0 = new Date(2026, 10, 9, 9, 0).getTime() // 2026-11-09 09:00 local

describe('fsrs wrapper', () => {
  it('is deterministic for a fixed now', () => {
    expect(rate(newCard(T0), 'good', T0)).toEqual(rate(newCard(T0), 'good', T0))
  })

  it('does not change the input card', () => {
    const c = newCard(T0)
    const before = structuredClone(c)
    rate(c, 'easy', T0)
    expect(c).toEqual(before)
  })

  it('gives longer intervals for better ratings, and never due in the past', () => {
    const due = (r: RatingName) => rate(newCard(T0), r, T0).card.due
    expect(due('again')).toBeGreaterThanOrEqual(T0 + DAY)
    expect(due('again')).toBeLessThan(due('hard'))
    expect(due('hard')).toBeLessThan(due('good'))
    expect(due('good')).toBeLessThan(due('easy'))
  })

  it('keeps the order on a later review', () => {
    const first = rate(newCard(T0), 'good', T0).card
    const t1 = first.due
    const due = (r: RatingName) => rate(first, r, t1).card.due
    expect(due('again')).toBeLessThan(due('hard'))
    expect(due('hard')).toBeLessThan(due('good'))
    expect(due('good')).toBeLessThan(due('easy'))
  })

  it('counts a lapse on Again after the card reached Review', () => {
    const first = rate(newCard(T0), 'good', T0).card
    const lapsed = rate(first, 'again', first.due).card
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.reps).toBe(2)
  })

  it('writes a log with the rating and the pre-review state', () => {
    const { log } = rate(newCard(T0), 'hard', T0)
    expect(log).toMatchObject({ rating: 2, state: 0, reviewedAt: T0 })
  })

  it('round-trips through JSON', () => {
    const card = rate(rate(newCard(T0), 'good', T0).card, 'easy', T0 + 3 * DAY).card
    const back = JSON.parse(JSON.stringify(card)) as CardState
    expect(back).toEqual(card)
    expect(rate(back, 'good', T0 + 20 * DAY)).toEqual(rate(card, 'good', T0 + 20 * DAY))
  })

  it('fuzz is optional and still returns a valid future due date', () => {
    const c = rate(rate(newCard(T0), 'good', T0).card, 'good', T0 + 4 * DAY, { fuzz: true }).card
    expect(c.due).toBeGreaterThan(T0 + 4 * DAY)
  })

  it('retrievability starts at 1 and falls over time; 0 for a new card', () => {
    const card = rate(newCard(T0), 'good', T0).card
    expect(retrievability(newCard(T0), T0)).toBe(0)
    expect(retrievability(card, T0)).toBeCloseTo(1, 5)
    const later = retrievability(card, T0 + 10 * DAY)
    expect(later).toBeLessThan(1)
    expect(later).toBeGreaterThan(retrievability(card, T0 + 60 * DAY))
  })
})

describe('cardMinutes', () => {
  const lesson = (estimatedMinutes: number) => ({ type: 'lesson' as const, estimatedMinutes })
  it('lessons: a quarter of the time, between 5 and 20', () => {
    expect(cardMinutes(lesson(10))).toBe(5)
    expect(cardMinutes(lesson(60))).toBe(15)
    expect(cardMinutes(lesson(90))).toBe(20)
    expect(cardMinutes(lesson(180))).toBe(20)
  })
  it('leetcode problems: 15/25/35 by difficulty', () => {
    const lc = (difficulty: 'easy' | 'medium' | 'hard') => ({
      type: 'practice' as const,
      estimatedMinutes: 40,
      practice: { provider: 'leetcode' as const, slug: 'two-sum', difficulty },
    })
    expect([cardMinutes(lc('easy')), cardMinutes(lc('medium')), cardMinutes(lc('hard'))]).toEqual([15, 25, 35])
  })
  it('gives no card to reviews, projects, milestones or other-provider practice', () => {
    for (const type of ['review', 'project', 'milestone'] as const) expect(cardMinutes({ type, estimatedMinutes: 30 })).toBeUndefined()
    expect(cardMinutes({ type: 'practice', estimatedMinutes: 30, practice: { provider: 'other', difficulty: 'easy' } })).toBeUndefined()
  })
})

describe('mastery', () => {
  const card = (taskId: string, reviewedAt: number): CardState & { taskId: string } => ({
    ...rate(newCard(reviewedAt), 'good', reviewedAt).card,
    taskId,
  })
  const planned = [
    { id: 'a', planId: 'p1', topics: ['arrays', 'hashing'] },
    { id: 'b', planId: 'p1', topics: ['arrays'] },
    { id: 'c', planId: 'p2', topics: ['graphs'] },
  ]

  it('is the mean retrievability, counting never-studied tasks as 0', () => {
    const cards = [card('a', T0)]
    const r = retrievability(cards[0]!, T0 + 5 * DAY)
    const out = masteryByTopic(planned, cards, T0 + 5 * DAY)
    expect(out.arrays).toEqual({ mastery: r / 2, total: 2, studied: 1 })
    expect(out.hashing).toEqual({ mastery: r, total: 1, studied: 1 })
    expect(out.graphs).toEqual({ mastery: 0, total: 1, studied: 0 })
  })

  it('is per plan too', () => {
    const cards = [card('a', T0), card('b', T0)]
    const out = masteryByPlan(planned, cards, T0)
    expect(out.p1!.mastery).toBeCloseTo(1, 5)
    expect(out.p1).toMatchObject({ total: 2, studied: 2 })
    expect(out.p2).toEqual({ mastery: 0, total: 1, studied: 0 })
  })

  it('ignores cards for tasks that are not planned', () => {
    expect(masteryByTopic(planned, [card('zzz', T0)], T0).arrays).toMatchObject({ studied: 0 })
  })
})

describe('brushUp', () => {
  it('lists due or weak cards, lowest retrievability first', () => {
    const fresh = rate(newCard(T0), 'good', T0).card
    const old = rate(newCard(T0 - 40 * DAY), 'good', T0 - 40 * DAY).card
    const older = rate(newCard(T0 - 90 * DAY), 'good', T0 - 90 * DAY).card
    const out = brushUp([{ ...fresh, n: 'fresh' }, { ...old, n: 'old' }, { ...older, n: 'older' }], T0)
    expect(out.map((i) => i.card.n)).toEqual(['older', 'old'])
    expect(out[0]!.retrievability).toBeLessThan(out[1]!.retrievability)
    expect(out.every((i) => i.due)).toBe(true)
  })

  it('treats a card due later today as due, like the badge', () => {
    const c = { ...rate(newCard(T0), 'good', T0).card, due: new Date(2026, 10, 9, 23, 0).getTime() }
    expect(brushUp([c], T0)).toMatchObject([{ due: true }])
    expect(brushUp([{ ...c, due: new Date(2026, 10, 10, 0, 1).getTime() }], T0)).toEqual([])
  })

  it('includes a card under the threshold that is not yet due, and skips a strong one', () => {
    const c = rate(rate(newCard(T0), 'good', T0).card, 'easy', T0 + DAY).card
    const t = c.due - 3 * DAY
    expect(brushUp([c], t, 0.999)).toHaveLength(1)
    expect(brushUp([c], t, 0.5)).toHaveLength(0)
  })
})

describe('reviewsDue', () => {
  const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()
  const cards = [
    { due: at(8), minutes: 5 }, // overdue
    { due: at(9, 1), minutes: 10 },
    { due: at(9, 23), minutes: 15 },
    { due: at(11), minutes: 20 },
    { due: at(20), minutes: 25 }, // outside
  ]
  it('buckets by local day, folds overdue into the first day and drops days past the end', () => {
    expect(reviewsDue(cards, '2026-11-09', '2026-11-12')).toEqual({
      '2026-11-09': { count: 3, minutes: 30 },
      '2026-11-11': { count: 1, minutes: 20 },
    })
  })
  it('localDate uses the local calendar day', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
  })
})
