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
    expect((await screen.findByRole('row', { name: /Monday/ })).textContent).toContain('120 min')
    expect(screen.getByTestId('week-total').textContent).toContain('960 min')
    expect(screen.getByText('25%')).toBeTruthy()
  })

  it('saves a changed budget, allows 0, and offers to reschedule', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Monday' }))
    const monday = screen.getByRole('textbox', { name: 'Monday' })
    await user.clear(monday)
    await user.type(monday, '0{Enter}')
    await user.click(screen.getByRole('button', { name: 'Sunday' }))
    const sunday = screen.getByRole('textbox', { name: 'Sunday' })
    await user.clear(sunday)
    await user.type(sunday, '240{Enter}')
    expect(screen.getByTestId('week-total').textContent).toContain('900 min')
    await user.click(screen.getByRole('button', { name: 'Save study time' }))
    await waitFor(async () => expect((await getSettings(db)).minutesPerWeekday).toEqual([0, 120, 120, 120, 120, 180, 240]))
    expect(await screen.findByRole('button', { name: 'Reschedule now' })).toBeTruthy()
  })

  it('refuses to save a day with no minutes', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Monday' }))
    await user.clear(screen.getByRole('textbox', { name: 'Monday' }))
    await user.keyboard('{Enter}')
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

describe('Settings reset dialog', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Reset local data' }))
  }

  it('without sync there is no choice, and the theme is mentioned as kept', async () => {
    const user = userEvent.setup()
    await open(user)
    expect(await screen.findByText(/no sync/)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(/Your theme choice is kept/)).toBeTruthy()
  })

  it('with sync on, offers this-device-only and everywhere', async () => {
    const { enableSync } = await import('../../sync')
    await enableSync(db)
    const user = userEvent.setup()
    await open(user)
    expect(await screen.findByRole('radio', { name: /Erase on this device only \(turns sync off\)/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Erase everywhere/ })).toBeTruthy()
    await db.meta.clear()
  })
})
