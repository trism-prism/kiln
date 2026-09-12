// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from 'react-aria-components'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import type { TodoItem } from '../../domain/todo'
import { DayPanel } from './DayPanel'

afterEach(cleanup)

const item: TodoItem = {
  key: 'task:a',
  kind: 'task',
  id: 'a',
  title: 'Task a',
  planId: 'p',
  planTitle: 'DSA',
  date: '2026-11-12',
  typeLabel: 'Lesson',
  minutes: 60,
  done: false,
  overdue: false,
  href: '/task/a',
  rates: true,
}

it('"Move to" flags the day field on Move, like the to-do form, and moves once it is fixed', async () => {
  const user = userEvent.setup()
  const onMove = vi.fn()
  render(
    <MemoryRouter>
      <I18nProvider locale="en-US">
        <DayPanel date="2026-11-12" items={[item]} today="2026-11-09" budget={120} blackout={false} onClose={() => {}} onMove={onMove} />
      </I18nProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: 'Move to… Task a' }))
  const field = screen.getByRole('textbox', { name: 'Move Task a to' })
  const move = screen.getByRole('button', { name: 'Move' })

  // Still on its own day: Move says why instead of doing nothing.
  await user.click(move)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByText('Pick a different day')).toBeTruthy()

  // Text it can't read: the field's own error, and nothing moves.
  await user.clear(field)
  await user.type(field, 'soon')
  await user.click(move)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByText('Try a date like Nov 20')).toBeTruthy()
  expect(onMove).not.toHaveBeenCalled()

  // Cleared: says a day is needed.
  await user.clear(field)
  await user.tab()
  await user.click(move)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByText('Pick a day')).toBeTruthy()
  expect(onMove).not.toHaveBeenCalled()

  await user.clear(field)
  await user.type(field, '2026-11-13')
  expect(field.getAttribute('aria-invalid')).toBeNull()
  await user.click(move)
  expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', from: '2026-11-12' }), '2026-11-13')
})
