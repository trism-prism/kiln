// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from 'react-aria-components'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateField } from './date'
import { TextField } from './form'
import { Sheet } from './overlay'

beforeEach(() => {
  // Monday 9 Nov 2026; only Date is faked so user-event's timers still run.
  vi.useFakeTimers({ now: new Date(2026, 10, 9, 9), toFake: ['Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness({ initial = '', min, onBlur }: { initial?: string; min?: string; onBlur?: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  const [bad, setBad] = useState(false)
  return (
    <I18nProvider locale="en-US">
      <DateField label="Deadline" value={value} onChange={setValue} min={min} onInvalidChange={setBad} onBlur={() => onBlur?.(value)} />
      <output data-testid="value">{value}</output>
      <output data-testid="bad">{String(bad)}</output>
    </I18nProvider>
  )
}

const box = () => screen.getByRole('textbox', { name: 'Deadline' })
const value = () => screen.getByTestId('value').textContent

describe('DateField', () => {
  it('reads typed text, keeps focus while typing, and shows the date on leaving', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(box(), 'nov 2')
    expect(document.activeElement).toBe(box())
    expect(box()).toHaveProperty('value', 'nov 2')
    await user.type(box(), '0')
    expect(value()).toBe('2026-11-20')
    await user.tab()
    expect(box()).toHaveProperty('value', 'Fri, Nov 20, 2026')
  })

  it('keeps unreadable text, shows the error after leaving, and goes back to the earlier date', async () => {
    const user = userEvent.setup()
    render(<Harness initial="2026-11-20" />)
    expect(box()).toHaveProperty('value', 'Fri, Nov 20, 2026')
    await user.clear(box())
    await user.type(box(), '11/2') // reads as Nov 2 2027 on the way
    await user.type(box(), '5x')
    expect(screen.queryByText('Try a date like Nov 20')).toBeNull()
    await user.tab()
    expect(box()).toHaveProperty('value', '11/25x')
    expect(screen.getByText('Try a date like Nov 20')).toBeTruthy()
    expect(box().getAttribute('aria-invalid')).toBe('true')
    expect(value()).toBe('2026-11-20')
    expect(screen.getByTestId('bad').textContent).toBe('true')
    await user.click(box())
    await user.type(box(), '{Backspace}')
    expect(screen.queryByText('Try a date like Nov 20')).toBeNull()
    await user.tab()
    expect(value()).toBe('2026-11-25')
    expect(screen.getByTestId('bad').textContent).toBe('false')
  })

  it('clears the date when the box is emptied', async () => {
    const user = userEvent.setup()
    render(<Harness initial="2026-11-20" />)
    await user.clear(box())
    await user.tab()
    expect(value()).toBe('')
    expect(box().getAttribute('aria-invalid')).toBeNull()
  })

  it('refuses a day before min with its own message', async () => {
    const user = userEvent.setup()
    render(<Harness min="2026-11-09" />)
    await user.type(box(), '11/1/2026')
    await user.tab()
    expect(screen.getByText('Pick today or later')).toBeTruthy()
    expect(value()).toBe('')
  })

  it('calls onBlur after the new value has rendered', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    render(<Harness onBlur={(v) => seen.push(v)} />)
    await user.type(box(), 'tomorrow')
    await user.tab()
    expect(seen).toEqual(['2026-11-10'])
  })

  it('picks a day from the calendar', async () => {
    const user = userEvent.setup()
    render(<Harness initial="2026-11-20" />)
    await user.click(screen.getByRole('button', { name: 'Choose a date' }))
    expect(screen.getByRole('group', { name: 'Change month' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /November 24, 2026/ }))
    expect(value()).toBe('2026-11-24')
    expect(box()).toHaveProperty('value', 'Tue, Nov 24, 2026')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lets Escape close a sheet around it', async () => {
    const user = userEvent.setup()
    const closed: boolean[] = []
    render(
      <I18nProvider locale="en-US">
        <Sheet title="Add to-do" isOpen onOpenChange={(o) => closed.push(!o)}>
          <DateField label="Day (optional)" value="" onChange={() => {}} />
        </Sheet>
      </I18nProvider>,
    )
    await user.click(screen.getByRole('textbox', { name: 'Day (optional)' }))
    await user.keyboard('fri{Escape}')
    expect(closed).toEqual([true])
  })

  it('has no spin buttons, and TextField type="date" renders it', () => {
    render(
      <I18nProvider locale="en-US">
        <TextField label="Start date" type="date" value="2026-11-20" onChange={() => {}} />
      </I18nProvider>,
    )
    expect(screen.getByRole('textbox', { name: 'Start date' })).toHaveProperty('value', 'Fri, Nov 20, 2026')
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('TextField type="date" tells the form when its text cannot be read', async () => {
    const user = userEvent.setup()
    const told: boolean[] = []
    render(
      <I18nProvider locale="en-US">
        <TextField label="Start date" type="date" value="2026-11-20" onChange={() => {}} onInvalidChange={(b) => told.push(b)} />
      </I18nProvider>,
    )
    const field = screen.getByRole('textbox', { name: 'Start date' })
    await user.clear(field)
    await user.type(field, 'soon')
    await user.tab()
    expect(told).toEqual([true])
    await user.clear(field)
    await user.type(field, 'nov 21')
    await user.tab()
    expect(told).toEqual([true, false])
  })
})
