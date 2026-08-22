import { describe, expect, it } from 'vitest'
import { badgeBreakdown, badgeCount } from './index'

const today = '2026-11-09'
const noon = (day: number) => new Date(2026, 10, day, 12).getTime()
const t = (status: string, scheduledDate?: string) => ({ status, scheduledDate })

describe('badgeCount', () => {
  it('is 0 with nothing', () => expect(badgeCount([], [], today)).toBe(0))

  it('counts open tasks scheduled today and overdue', () => {
    const tasks = [t('open', today), t('open', '2026-11-05'), t('open', '2026-11-10')]
    expect(badgeBreakdown(tasks, [], today)).toEqual({ today: 1, overdue: 1, reviews: 0, total: 2 })
  })

  it('ignores done, skipped and unscheduled tasks', () => {
    expect(badgeCount([t('done', today), t('skipped', today), t('open'), t('done', '2026-11-01')], [], today)).toBe(0)
  })

  it('counts reviews due today or earlier, not later ones', () => {
    const reviews = [{ due: noon(8) }, { due: noon(9) }, { due: new Date(2026, 10, 9, 23, 59).getTime() }, { due: noon(10) }]
    expect(badgeBreakdown([], reviews, today)).toMatchObject({ reviews: 3, total: 3 })
  })

  it('ignores deleted tasks', () => {
    expect(badgeCount([{ status: 'open', scheduledDate: today, deleted: true }], [], today)).toBe(0)
  })

  it('adds tasks and reviews', () => {
    expect(badgeCount([t('open', today), t('open', '2026-11-01')], [{ due: noon(9) }], today)).toBe(3)
  })
})
