import { describe, expect, it } from 'vitest'
import { describeMoves } from './moveSummary'

describe('describeMoves', () => {
  const before = new Map<string, string | undefined>([['a', '2026-11-01'], ['b', '2026-11-01'], ['c', '2026-11-02'], ['d', '2026-11-02'], ['e', '2026-11-02']])

  it('counts tasks per new day, in date order', () => {
    const out = describeMoves('Moved', 'overdue task', 'Nothing was overdue', before, { a: '2026-11-14', b: '2026-11-13', c: '2026-11-13', d: '2026-11-13', e: '2026-11-14' })
    expect(out).toBe('Moved 5 overdue tasks: 3 to Fri, Nov 13, 2 to Sat, Nov 14')
  })

  it('says nothing was overdue when there was nothing to move', () => {
    expect(describeMoves('Moved', 'overdue task', 'Nothing was overdue', new Map(), {})).toBe('Nothing was overdue')
  })

  it('uses the singular and mentions the backlog', () => {
    expect(describeMoves('Placed', 'backlog task', 'Nothing was in the backlog', new Map([['a', undefined]]), { a: '2026-11-13' })).toBe('Placed 1 backlog task: 1 to Fri, Nov 13')
    expect(describeMoves('Moved', 'overdue task', 'Nothing was overdue', before, { a: 'backlog', b: 'backlog' })).toBe('Moved 2 overdue tasks: 2 to the backlog')
  })

  it('folds days beyond the first four into "later days"', () => {
    const many = new Map(Array.from({ length: 6 }, (_, i) => [`t${i}`, '2026-11-01'] as const))
    const out = describeMoves('Moved', 'overdue task', 'Nothing was overdue', many, Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`t${i}`, `2026-11-0${i + 2}`])))
    expect(out).toBe('Moved 6 overdue tasks: 1 to Mon, Nov 2, 1 to Tue, Nov 3, 1 to Wed, Nov 4, 1 to Thu, Nov 5, 2 to later days')
  })
})
