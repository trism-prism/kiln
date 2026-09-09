import { describe, expect, it } from 'vitest'
import { uses12Hours, withPeriod } from './time'

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
