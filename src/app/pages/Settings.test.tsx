// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { db, getSettings } from '../../data'
import SettingsPage from './Settings'

afterEach(async () => {
  cleanup()
  await db.settings.clear()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )

describe('Settings', () => {
  it('shows the default budget and a weekly total', async () => {
    renderPage()
    expect(((await screen.findByRole('textbox', { name: 'Monday' })) as HTMLInputElement).value).toBe('120')
    expect(screen.getByTestId('week-total').textContent).toContain('960 min')
    expect(screen.getByText('25%')).toBeTruthy()
  })

  it('saves a changed budget, allows 0, and offers to reschedule', async () => {
    const user = userEvent.setup()
    renderPage()
    const monday = await screen.findByRole('textbox', { name: 'Monday' })
    await user.clear(monday)
    await user.type(monday, '0')
    const sunday = screen.getByRole('textbox', { name: 'Sunday' })
    await user.clear(sunday)
    await user.type(sunday, '240')
    expect(screen.getByTestId('week-total').textContent).toContain('900 min')
    await user.click(screen.getByRole('button', { name: 'Save study time' }))
    await waitFor(async () => expect((await getSettings(db)).minutesPerWeekday).toEqual([0, 120, 120, 120, 120, 180, 240]))
    expect(await screen.findByRole('button', { name: 'Reschedule now' })).toBeTruthy()
  })

  it('refuses to save a day that is not a number of minutes', async () => {
    const user = userEvent.setup()
    renderPage()
    const monday = await screen.findByRole('textbox', { name: 'Monday' })
    await user.clear(monday)
    await user.type(monday, '1.5')
    expect((screen.getByRole('button', { name: 'Save study time' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds and removes a day off', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Date'), '2027-01-01')
    await user.click(screen.getByRole('button', { name: 'Add day off' }))
    await waitFor(async () => expect((await getSettings(db)).blackoutDates).toEqual(['2027-01-01']))
    await user.click(await screen.findByRole('button', { name: 'Remove 2027-01-01' }))
    await waitFor(async () => expect((await getSettings(db)).blackoutDates).toEqual([]))
  })

  it('saves the reminder times', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('switch', { name: 'Evening nudge if tasks remain' }))
    await user.click(screen.getByRole('button', { name: 'Save reminders' }))
    await waitFor(async () => expect((await getSettings(db)).nudgeEnabled).toBe(true))
  })
})
