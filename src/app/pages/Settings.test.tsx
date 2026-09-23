// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { db, getSettings, importPlan } from '../../data'
import { fixtureTexts, validateParts } from '../../data/fixtures'
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
    // No plan has reviews on, so the review cap line is hidden.
    expect(screen.queryByText('25%')).toBeNull()
  })

  it('shows the review cap once a plan has reviews on', async () => {
    const plan = validateParts([fixtureTexts.sd]).plans[0]!
    await importPlan(db, plan, { startDate: '2026-11-09', reviewsOn: true })
    renderPage()
    expect(await screen.findByText('25%')).toBeTruthy()
    await db.plans.clear()
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

  it('rejects minutes that are not whole numbers', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Monday' }))
    const monday = screen.getByRole('textbox', { name: 'Monday' })
    await user.clear(monday)
    await user.type(monday, '1.5{Enter}')
    expect((screen.getByRole('button', { name: 'Save study time' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('steps by 15 and stops at 0 and 1440', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Monday' }))
    const monday = screen.getByRole('textbox', { name: 'Monday' }) as HTMLInputElement
    await user.clear(monday)
    await user.type(monday, '10')
    await user.click(screen.getByRole('button', { name: 'Less time on Monday' }))
    expect(monday.value).toBe('0')
    await user.click(screen.getByRole('button', { name: 'Less time on Monday' }))
    expect(monday.value).toBe('0')
    await user.clear(monday)
    await user.type(monday, '1435')
    await user.click(screen.getByRole('button', { name: 'More time on Monday' }))
    expect(monday.value).toBe('1,440')
    await user.click(screen.getByRole('button', { name: 'More time on Monday' }))
    expect(monday.value).toBe('1,440')
  })

  it('adds and removes a day off', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Date'), '2099-01-01')
    await user.click(screen.getByRole('button', { name: 'Add day off' }))
    await waitFor(async () => expect((await getSettings(db)).blackoutDates).toEqual(['2099-01-01']))
    await user.click(await screen.findByRole('button', { name: 'Remove 2099-01-01' }))
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
    const { enableSyncKey, generateSyncKey } = await import('../../sync')
    await enableSyncKey(db, generateSyncKey())
    const user = userEvent.setup()
    await open(user)
    expect(await screen.findByRole('radio', { name: /Erase on this device only \(turns sync off\)/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Erase everywhere/ })).toBeTruthy()
    await db.meta.clear()
  })
})

describe('Days off', () => {
  it('reads yesterday typed with no year as yesterday and refuses it', async () => {
    const user = userEvent.setup()
    renderPage()
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const field = await screen.findByRole('textbox', { name: 'Date' })
    await user.type(field, d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    await user.tab()
    expect(screen.getByText('Pick today or later')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add day off' }).hasAttribute('disabled')).toBe(true)
  })

  it('does not add a day off while the date text cannot be read', async () => {
    const user = userEvent.setup()
    renderPage()
    const field = await screen.findByRole('textbox', { name: 'Date' })
    const add = screen.getByRole('button', { name: 'Add day off' })
    await user.type(field, '2099-01-02')
    await user.tab()
    expect(add.hasAttribute('disabled')).toBe(false)
    // The field goes back to Jan 2 underneath, but shows an error: adding must wait for a fix.
    await user.type(field, 'x')
    await user.click(add)
    expect(screen.getByText('Try a date like Nov 20')).toBeTruthy()
    expect(add.hasAttribute('disabled')).toBe(true)
    expect((await getSettings(db)).blackoutDates).toEqual([])
  })
})
