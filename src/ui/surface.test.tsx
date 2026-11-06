// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CountBadge, badgeLabel, formatCount } from './surface'

afterEach(cleanup)

describe('count badge', () => {
  it('caps the visible count at 99+', () => {
    expect(formatCount(7)).toBe('7')
    expect(formatCount(99)).toBe('99')
    expect(formatCount(100)).toBe('99+')
    const { container } = render(<CountBadge count={140} />)
    expect(container.textContent).toBe('99+')
  })

  it('renders nothing for zero and hides the bubble from screen readers', () => {
    expect(render(<CountBadge count={0} />).container.innerHTML).toBe('')
    const { container } = render(<CountBadge count={3} />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('labels with the real count and correct plural', () => {
    expect(badgeLabel('To Do', 3)).toBe('To Do, 3 items due')
    expect(badgeLabel('To Do', 1)).toBe('To Do, 1 item due')
    expect(badgeLabel('To Do', 140)).toBe('To Do, 140 items due')
    expect(badgeLabel('To Do', 0)).toBe('To Do')
  })
})
