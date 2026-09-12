// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from 'react-aria-components'
import { afterEach, describe, expect, it } from 'vitest'
import { formatTime, parseTimeText, TimeInput, uses12Hours, withPeriod } from './time'

afterEach(cleanup)

describe('uses12Hours', () => {
  it('is true for 12-hour locales and false for 24-hour ones', () => {
    expect(uses12Hours('en-US')).toBe(true)
    expect(uses12Hours('de-DE')).toBe(false)
    expect(uses12Hours('en-GB')).toBe(false)
  })
})

describe('withPeriod (24-hour value <-> 12-hour AM/PM)', () => {
  it.each([
    ['00:05', true, '12:05'],
    ['00:05', false, '00:05'],
    ['12:30', false, '00:30'],
    ['12:30', true, '12:30'],
    ['07:15', true, '19:15'],
    ['19:15', false, '07:15'],
    ['23:59', false, '11:59'],
    ['23:59', true, '23:59'],
    ['', true, ''],
  ])('%s with pm=%s is %s', (value, pm, expected) => {
    expect(withPeriod(value, pm)).toBe(expected)
  })
})

describe('parseTimeText', () => {
  it.each([
    ['7', false, '07:00'],
    ['7', true, '19:00'],
    ['7:30', false, '07:30'],
    ['730', false, '07:30'],
    ['0730', true, '07:30'], // a leading 0 is the 24-hour way, so the select doesn't apply
    ['07:30', true, '07:30'],
    ['7.30', false, '07:30'],
    ['7 30', false, '07:30'],
    ['7p', false, '19:00'],
    ['7pm', false, '19:00'],
    ['7 PM', false, '19:00'],
    ['7:30 pm', false, '19:30'],
    ['7:30 a.m.', true, '07:30'],
    ['12am', true, '00:00'],
    ['12pm', false, '12:00'],
    ['12', false, '00:00'],
    ['19:30', false, '19:30'],
    ['1930', false, '19:30'],
    ['0', true, '00:00'],
    ['  7:30  ', false, '07:30'],
  ])('%j with pm=%s is %s', (text, pm, expected) => {
    expect(parseTimeText(text, pm)).toBe(expected)
  })

  it('reads hours as they are on a 24-hour clock', () => {
    expect(parseTimeText('7')).toBe('07:00')
    expect(parseTimeText('12')).toBe('12:00')
    expect(parseTimeText('19:30')).toBe('19:30')
  })

  it.each(['', 'pm', '24', '7:60', '13pm', '0am', '7:3', '12345', 'seven', '7::30'])('rejects %j', (text) => {
    expect(parseTimeText(text, false)).toBeUndefined()
  })
})

describe('formatTime', () => {
  it('shows hours as the clock does', () => {
    expect(formatTime('19:30', true)).toBe('7:30')
    expect(formatTime('00:05', true)).toBe('12:05')
    expect(formatTime('07:30', false)).toBe('07:30')
    expect(formatTime('', true)).toBe('')
  })
})

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <I18nProvider locale="en-US">
      <TimeInput label="Daily reminder" value={value} onChange={setValue} isInvalid={!/^[0-9]{2}:[0-9]{2}$/.test(value)} />
      <output data-testid="value">{value}</output>
    </I18nProvider>
  )
}

describe('TimeInput', () => {
  it('keeps focus and the typed text in one box while typing, and tidies it on leaving', async () => {
    const user = userEvent.setup()
    render(<Harness initial="08:00" />)
    const box = screen.getByRole('textbox', { name: 'Daily reminder' })
    expect(box).toHaveProperty('value', '8:00')
    await user.clear(box)
    await user.type(box, '7')
    expect(document.activeElement).toBe(box)
    expect(box).toHaveProperty('value', '7')
    expect(screen.getByTestId('value').textContent).toBe('07:00')
    await user.type(box, '3')
    expect(document.activeElement).toBe(box)
    await user.type(box, '0pm')
    expect(screen.getByTestId('value').textContent).toBe('19:30')
    await user.tab()
    expect(box).toHaveProperty('value', '7:30')
    expect(screen.getByRole('button', { name: /AM or PM/ }).textContent).toContain('PM')
  })

  it('keeps unreadable text as typed and shows the error after leaving', async () => {
    const user = userEvent.setup()
    render(<Harness initial="08:00" />)
    const box = screen.getByRole('textbox', { name: 'Daily reminder' })
    await user.clear(box)
    await user.type(box, '7:6')
    expect(screen.queryByText('Enter a time')).toBeNull()
    await user.tab()
    expect(box).toHaveProperty('value', '7:6')
    expect(screen.getByTestId('value').textContent).toBe('')
    expect(screen.getByText('Enter a time')).toBeTruthy()
    expect(box.getAttribute('aria-invalid')).toBe('true')
  })
})
