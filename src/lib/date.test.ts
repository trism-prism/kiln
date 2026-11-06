import { describe, expect, it } from 'vitest'
import { addDaysISO, isRealISODate, toLocalISODate, weekdayIndex } from './date'

describe('toLocalISODate', () => {
  it('uses local calendar fields and zero-pads', () => {
    expect(toLocalISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('isRealISODate', () => {
  it.each([
    ['2026-02-28', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['not a date', false],
  ])('%s -> %s', (input, expected) => {
    expect(isRealISODate(input)).toBe(expected)
  })
})

describe('addDaysISO', () => {
  it.each([
    ['2026-11-09', 0, '2026-11-09'],
    ['2026-11-09', 1, '2026-11-10'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-11-09', 111, '2027-02-28'],
    ['2026-11-09', -9, '2026-10-31'],
  ])('%s + %i days = %s', (start, days, expected) => {
    expect(addDaysISO(start, days)).toBe(expected)
  })
})

describe('weekdayIndex', () => {
  it.each([
    ['2026-11-02', 0],
    ['2026-11-05', 3],
    ['2026-11-08', 6],
    ['2028-02-29', 1],
  ])('%s -> %s (Monday is 0)', (input, expected) => {
    expect(weekdayIndex(input)).toBe(expected)
  })
})
