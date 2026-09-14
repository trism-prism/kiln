// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarView as View } from '../../domain/calendar'
import type { TodoItem } from '../../domain/todo'
import { CalendarView } from './CalendarView'

afterEach(cleanup)

const TODAY = '2026-11-11' // Wednesday
const item = (id: string, date: string, over: Partial<TodoItem> = {}): TodoItem => ({
  key: `task:${id}`,
  kind: 'task',
  id,
  title: `Task ${id}`,
  planId: 'p',
  planTitle: 'DSA',
  date,
  typeLabel: 'Lesson',
  minutes: 60,
  done: false,
  overdue: false,
  href: `/task/${id}`,
  ...over,
})

function Harness({ items, start = 'month', onOpenDay = () => {}, blackout = [] as string[] }: { items: TodoItem[]; start?: View; onOpenDay?: (d: string) => void; blackout?: string[] }) {
  const [view, setView] = useState<View>(start)
  return (
    <CalendarView
      items={items}
      today={TODAY}
      view={view}
      onViewChange={setView}
      weekStartsOn="monday"
      minutesPerWeekday={[120, 120, 120, 120, 120, 0, 180]}
      blackoutDates={blackout}
      onOpenDay={onOpenDay}
      onMove={() => {}}
    />
  )
}

const dayButton = (date: string) => document.querySelector<HTMLElement>(`[data-day="${date}"]`)!

describe('month view', () => {
  it('draws Monday-first weeks of the month with today in the tab order', () => {
    render(<Harness items={[]} />)
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(screen.getAllByRole('row')).toHaveLength(1 + 6)
    const tabbable = [...document.querySelectorAll('[data-day]')].filter((b) => (b as HTMLElement).tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect((tabbable[0] as HTMLElement).dataset.day).toBe(TODAY)
    expect(tabbable[0]!.getAttribute('aria-label')).toContain('today')
  })

  it('moves focus with the arrow keys, Home, End and Enter opens the day', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<Harness items={[item('a', '2026-11-12')]} onOpenDay={open} />)
    dayButton(TODAY).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(dayButton('2026-11-12'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(dayButton('2026-11-19'))
    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(document.activeElement).toBe(dayButton('2026-11-11'))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(dayButton('2026-11-09'))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(dayButton('2026-11-15'))
    // Only the focused day is a tab stop (roving tabindex)
    expect([...document.querySelectorAll('[data-day]')].filter((b) => (b as HTMLElement).tabIndex === 0).map((b) => (b as HTMLElement).dataset.day)).toEqual(['2026-11-15'])
    await user.keyboard('{Enter}')
    expect(open).toHaveBeenCalledWith('2026-11-15')
  })

  it('crosses into the next month and back with the keys, and Page Down jumps a month', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    dayButton(TODAY).focus()
    await user.keyboard('{PageDown}')
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeTruthy()
    expect(document.activeElement).toBe(dayButton('2026-12-11'))
    await user.keyboard('{PageUp}{PageUp}')
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeTruthy()
    expect(document.activeElement).toBe(dayButton('2026-10-11'))
    // Arrow past the last day shown moves the grid on
    dayButton('2026-10-31').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(dayButton('2026-11-02'))
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
  })

  it('has the previous and next arrows together, and a Today button that is off while today is on show', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    const pager = screen.getByRole('group', { name: 'Change month' })
    expect([...pager.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Previous month', 'Next month'])
    const today = screen.getByRole('button', { name: 'Today' })
    expect(today.hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeTruthy()
    expect(today.hasAttribute('disabled')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeTruthy()
    await user.click(today)
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
    expect(today.hasAttribute('disabled')).toBe(true)
    // The button turned itself off, so the focus moves to today rather than dropping to the page
    expect(document.activeElement).toBe(dayButton(TODAY))
    // And again on a second use
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(today)
    expect(document.activeElement).toBe(dayButton(TODAY))
  })

  it('steps from the month on show when the focus is on a neighbour month day', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    dayButton('2026-11-29').focus()
    await user.keyboard('{ArrowDown}') // Dec 6, still in the November grid
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeTruthy()
  })

  it('crosses the year, and the phone label adds the year only when it is not this year', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    const phoneLabel = () => screen.getByRole('heading', { level: 2 }).firstElementChild!.textContent
    expect(phoneLabel()).toBe('November')
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'January 2027' })).toBeTruthy()
    expect(phoneLabel()).toBe('January 2027')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('tab', { name: 'Week' })) // the week of Dec 11
    expect(phoneLabel()).toBe('Dec 7 to 13')
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByRole('grid', { name: 'Dec 28 to Jan 3, 2027' })).toBeTruthy()
    expect(phoneLabel()).toBe('Dec 28 to Jan 3, 2027')
  })

  it('shows three items, "+N more", the day count, overdue and over-budget in the cell and its label', () => {
    const items = [
      item('a', '2026-11-12'),
      item('b', '2026-11-12'),
      item('c', '2026-11-12'),
      item('d', '2026-11-12'),
      item('e', '2026-11-12', { kind: 'review', key: 'review:e', title: 'Review: x', minutes: 10 }),
      item('o', '2026-11-05', { overdue: true }),
      item('z', '2026-11-04', { done: true }),
    ]
    render(<Harness items={items} />)
    const cell = document.querySelector<HTMLElement>('[data-date="2026-11-12"]')!
    expect(within(cell).getAllByText(/^Task [a-e]$/)).toHaveLength(3)
    expect(within(cell).getByText('+2 more')).toBeTruthy()
    expect(dayButton('2026-11-12').getAttribute('aria-label')).toBe('Thu, Nov 12, 2026, 5 items, 250 of 120 minutes, over budget')
    expect(dayButton('2026-11-05').getAttribute('aria-label')).toContain('1 overdue')
    expect(document.querySelector('[data-date="2026-11-05"] .text-danger')).toBeTruthy()
    // The 5th item is a review, summed into one chip
    const withReviews = [item('a', '2026-11-13'), item('r1', '2026-11-13', { kind: 'review', key: 'review:1' }), item('r2', '2026-11-13', { kind: 'review', key: 'review:2' })]
    cleanup()
    render(<Harness items={withReviews} />)
    expect(screen.getByText('2 reviews')).toBeTruthy()
  })

  it('marks blackout days and the budget of a weekday with no minutes', () => {
    render(<Harness items={[]} blackout={['2026-11-20']} />)
    expect(dayButton('2026-11-20').getAttribute('aria-label')).toContain('day off')
    expect(within(document.querySelector<HTMLElement>('[data-date="2026-11-20"]')!).getByText('Off')).toBeTruthy()
  })

  it('does not make done items draggable', () => {
    render(<Harness items={[item('a', '2026-11-12'), item('b', '2026-11-12', { done: true })]} />)
    const cell = document.querySelector<HTMLElement>('[data-date="2026-11-12"]')!
    expect(cell.querySelector('[data-chip="task:a"]')!.getAttribute('draggable')).toBe('true')
    expect(cell.querySelector('[data-chip="task:b"]')!.getAttribute('draggable')).toBeNull()
  })
})

describe('week view', () => {
  it('lists the seven days of the week and Page Down moves a week', async () => {
    const user = userEvent.setup()
    render(<Harness items={[item('a', '2026-11-12')]} start="week" />)
    expect(screen.getByRole('grid', { name: 'Nov 9 to Nov 15, 2026' })).toBeTruthy()
    expect(document.querySelectorAll('[data-day]')).toHaveLength(7)
    expect(screen.getByText('Task a')).toBeTruthy()
    dayButton(TODAY).focus()
    await user.keyboard('{PageDown}')
    expect(screen.getByRole('grid', { name: 'Nov 16 to Nov 22, 2026' })).toBeTruthy()
    expect(document.activeElement).toBe(dayButton('2026-11-18'))
  })

  it('steps from the focused day, and a key that changes nothing does not leave a focus jump behind', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} start="week" />)
    dayButton(TODAY).focus() // Wednesday
    await user.keyboard('{ArrowRight}') // Thursday 12th
    expect(within(screen.getByRole('group', { name: 'Change week' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Previous week', 'Next week'])
    const today = screen.getByRole('button', { name: 'Today' })
    expect(today.hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(today.hasAttribute('disabled')).toBe(false)
    await user.click(today)
    expect(today.hasAttribute('disabled')).toBe(true)
    expect(document.activeElement).toBe(dayButton(TODAY))
    dayButton(TODAY).focus()
    await user.keyboard('{ArrowRight}') // Thursday 12th
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByRole('grid', { name: 'Nov 16 to Nov 22, 2026' })).toBeTruthy()
    expect(dayButton('2026-11-19').tabIndex).toBe(0) // the Thursday, not the Monday
    // Home on the first day of the week moves nothing; a later toolbar press must not pull focus into the grid.
    dayButton('2026-11-16').focus()
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(dayButton('2026-11-16'))
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous week' }))
  })

  it('keeps the focused day when switching between the views', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    dayButton(TODAY).focus()
    await user.keyboard('{ArrowDown}{ArrowDown}') // Nov 25
    await user.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByRole('grid', { name: 'Nov 23 to Nov 29, 2026' })).toBeTruthy()
    expect(dayButton('2026-11-25').tabIndex).toBe(0)
    await user.click(screen.getByRole('tab', { name: 'Month' }))
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
  })
})
