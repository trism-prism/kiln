import { describe, expect, it } from 'vitest'
import { toLocalISODate } from '../../lib/date'
import { monthGrid, moveWarnings, navigateDate, periodLabel, shiftMonth, weekDates, weekStartOf, weekdayNames, type MovableTask } from './index'

describe('week and month grids', () => {
  it('starts weeks on Monday or Sunday', () => {
    expect(weekStartOf('2026-11-11')).toBe('2026-11-09') // Wednesday -> Monday
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09') // Sunday belongs to the week before
    expect(weekStartOf('2026-11-15', 'sunday')).toBe('2026-11-15')
    expect(weekDates('2026-11-11', 'sunday')[0]).toBe('2026-11-08')
    expect(weekdayNames('sunday')[0]).toBe('Sun')
    expect(weekdayNames('monday')[6]).toBe('Sun')
  })

  it('builds a month of whole Monday weeks with the neighbours days at the edges', () => {
    const g = monthGrid('2026-11-11')
    expect(g).toHaveLength(6) // 30 Nov is a Monday
    expect(g[0]![0]).toBe('2026-10-26')
    expect(g[0]![6]).toBe('2026-11-01') // 1 Nov 2026 is a Sunday
    expect(g.at(-1)![6]).toBe('2026-12-06')
    expect(g.flat()).toHaveLength(42)
    expect(new Set(g.flat()).size).toBe(42)
  })

  it('fits February 2027 (28 days, starts on Monday) in exactly four rows, and a long month in six', () => {
    expect(monthGrid('2027-02-10')).toHaveLength(4)
    expect(monthGrid('2027-02-10')[0]![0]).toBe('2027-02-01')
    const aug = monthGrid('2026-08-15') // starts on a Saturday, 31 days
    expect(aug).toHaveLength(6)
    expect(aug[0]![0]).toBe('2026-07-27')
    expect(aug[5]![6]).toBe('2026-09-06')
  })

  it('crosses year ends', () => {
    const g = monthGrid('2026-12-05')
    expect(g[0]![0]).toBe('2026-11-30')
    expect(g.at(-1)![6]).toBe('2027-01-03')
  })

  it('has seven consecutive days in the weeks where the clocks change (US 8 Mar 2026, EU 29 Mar 2026, fall back 1 Nov 2026)', () => {
    for (const day of ['2026-03-08', '2026-03-29', '2026-11-01', '2026-10-25']) {
      for (const ws of ['monday', 'sunday'] as const) {
        const w = weekDates(day, ws)
        expect(w).toHaveLength(7)
        expect(w).toContain(day)
        // Independent check against the machine's local calendar (which has the DST change in it).
        const [y, m, d] = w[0]!.split('-').map(Number) as [number, number, number]
        expect(w).toEqual(Array.from({ length: 7 }, (_, i) => toLocalISODate(new Date(y, m - 1, d + i))))
      }
    }
    // The March month in the US: the grid has no repeated or missing day.
    const flat = monthGrid('2026-03-15').flat()
    expect(new Set(flat).size).toBe(flat.length)
    expect(flat).toContain('2026-03-08')
    expect(flat).toContain('2026-03-09')
  })
})

describe('shiftMonth', () => {
  it('keeps the day number and holds it to the last day of shorter months', () => {
    expect(shiftMonth('2026-11-11', 1)).toBe('2026-12-11')
    expect(shiftMonth('2026-12-11', 1)).toBe('2027-01-11')
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28')
    expect(shiftMonth('2028-03-31', -1)).toBe('2028-02-29')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('navigateDate', () => {
  it('moves by day, week, week edge and month', () => {
    expect(navigateDate('ArrowRight', '2026-11-30', 'month')).toBe('2026-12-01')
    expect(navigateDate('ArrowLeft', '2026-11-01', 'month')).toBe('2026-10-31')
    expect(navigateDate('ArrowDown', '2026-11-11', 'month')).toBe('2026-11-18')
    expect(navigateDate('ArrowUp', '2026-11-03', 'month')).toBe('2026-10-27')
    expect(navigateDate('Home', '2026-11-11', 'month')).toBe('2026-11-09')
    expect(navigateDate('End', '2026-11-11', 'month')).toBe('2026-11-15')
    expect(navigateDate('End', '2026-11-11', 'month', 'sunday')).toBe('2026-11-14')
    expect(navigateDate('PageDown', '2026-01-31', 'month')).toBe('2026-02-28')
    expect(navigateDate('PageUp', '2026-11-11', 'month')).toBe('2026-10-11')
    expect(navigateDate('PageDown', '2026-11-11', 'week')).toBe('2026-11-18')
    expect(navigateDate('a', '2026-11-11', 'month')).toBeUndefined()
  })
})

describe('periodLabel', () => {
  it('names the month or the week', () => {
    expect(periodLabel('2026-11-11', 'month')).toBe('November 2026')
    expect(periodLabel('2026-11-11', 'week')).toBe('Nov 9 to Nov 15, 2026')
    expect(periodLabel('2026-11-11', 'week', 'sunday')).toBe('Nov 8 to Nov 14, 2026')
  })
})

describe('moveWarnings', () => {
  const t = (id: string, over: Partial<MovableTask> = {}): MovableTask => ({ id, key: id, planId: 'p', title: `Task ${id}`, status: 'open', scheduledDate: '2026-11-10', dependsOn: [], ...over })
  const a = t('a', { scheduledDate: '2026-11-10' })
  const b = t('b', { scheduledDate: '2026-11-12', dependsOn: ['a'] })
  const all = [a, b, t('x', { planId: 'other', dependsOn: ['a'], scheduledDate: '2026-11-09' })]

  it('is quiet when the order holds', () => {
    expect(moveWarnings(b, '2026-11-14', all)).toEqual([])
    expect(moveWarnings(a, '2026-11-11', all)).toEqual([])
  })

  it('names a dependency the task would land on or before', () => {
    expect(moveWarnings(b, '2026-11-10', all)).toEqual(['Needs "Task a", which is due Tue, Nov 10.'])
    expect(moveWarnings(b, '2026-11-09', all)).toHaveLength(1)
  })

  it('names a task that needs the moved one and is due on or before the new day', () => {
    expect(moveWarnings(a, '2026-11-12', all)).toEqual(['"Task b" needs this and is due Thu, Nov 12.'])
    expect(moveWarnings(a, '2026-11-20', all)).toHaveLength(1)
  })

  it('ignores done dependencies, other plans, and a dependency with no day is named', () => {
    expect(moveWarnings(b, '2026-11-09', [{ ...a, status: 'done' }, b])).toEqual([])
    expect(moveWarnings(b, '2026-11-14', [{ ...a, scheduledDate: undefined }, b])).toEqual(['Needs "Task a", which has no day yet.'])
  })
})
