import { describe, expect, it, vi } from 'vitest'
import { applyBadge, notificationText } from './badge'

const c = (today: number, overdue: number, reviews = 0) => ({ today, overdue, reviews, total: today + overdue + reviews })

describe('notificationText', () => {
  it('says how many tasks and how many are overdue', () => {
    expect(notificationText('reminder', c(2, 1))).toBe('3 tasks today (1 overdue)')
    expect(notificationText('reminder', c(3, 0))).toBe('3 tasks today')
    expect(notificationText('reminder', c(0, 2))).toBe('2 tasks today (2 overdue)')
  })

  it('uses the singular and counts due reviews', () => {
    expect(notificationText('reminder', c(1, 0))).toBe('1 task today')
    expect(notificationText('reminder', c(0, 0, 1))).toBe('1 task today')
    expect(notificationText('reminder', c(1, 1, 2))).toBe('4 tasks today (1 overdue)')
  })

  it('always has something to show, even with nothing due', () => {
    expect(notificationText('nudge', c(0, 0))).toBe('All done for today')
    expect(notificationText('reminder', c(0, 0))).toBe('Nothing due today')
  })

  it('words a nudge as what is still open', () => {
    expect(notificationText('nudge', c(2, 1))).toBe('3 tasks still open today (1 overdue)')
    expect(notificationText('nudge', c(1, 0))).toBe('1 task still open today')
  })
})

describe('applyBadge', () => {
  it('sets the badge for a positive count and clears it at zero', async () => {
    const t = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) }
    await applyBadge(t, 3)
    expect(t.setAppBadge).toHaveBeenCalledWith(3)
    await applyBadge(t, 0)
    expect(t.clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('does nothing where the Badging API is missing, and swallows a refusal', async () => {
    await expect(applyBadge({}, 5)).resolves.toBeUndefined()
    await expect(applyBadge({ setAppBadge: () => Promise.reject(new Error('no permission')) }, 5)).resolves.toBeUndefined()
  })
})
