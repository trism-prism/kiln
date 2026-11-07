import { describe, expect, it } from 'vitest'
import { monthFirst, parseDateText } from './date-parse'

// Monday 9 Nov 2026, the seeded e2e day.
const TODAY = '2026-11-09'

describe('parseDateText', () => {
  it.each([
    ['today', '2026-11-09'],
    ['Today', '2026-11-09'],
    ['tomorrow', '2026-11-10'],
    ['fri', '2026-11-13'],
    ['friday', '2026-11-13'],
    ['Friday.', '2026-11-13'],
    ['mon', '2026-11-16'], // the next one after today, not today
    ['sat', '2026-11-14'],
    ['sun', '2026-11-15'],
    ['nov 20', '2026-11-20'],
    ['Nov 20', '2026-11-20'],
    ['20 nov', '2026-11-20'],
    ['November 20', '2026-11-20'],
    ['nov 20th', '2026-11-20'],
    ['Nov. 20', '2026-11-20'],
    ['nov 20 2027', '2027-11-20'],
    ['Fri, Nov 20, 2026', '2026-11-20'], // the field's own display text reads back
    ['nov 9', '2026-11-09'], // today counts
    ['nov 8', '2027-11-08'], // passed this year, so next year
    ['jan 2', '2027-01-02'],
    ['11/20', '2026-11-20'],
    ['11/20/26', '2026-11-20'],
    ['11/20/2026', '2026-11-20'],
    ['11-20-2026', '2026-11-20'],
    ['2026-11-20', '2026-11-20'],
    ['2026/11/20', '2026-11-20'],
    ['  nov   20  ', '2026-11-20'],
    ['Nov 20,', '2026-11-20'], // a trailing comma reads the same as none
    ['Nov 20, ', '2026-11-20'],
    ['Fri, Nov 20, 2026,', '2026-11-20'],
    ['fri,', '2026-11-13'],
    ['feb 29', '2028-02-29'], // the next leap year
    ['2/29/28', '2028-02-29'],
  ])('%s -> %s', (text, expected) => {
    expect(parseDateText(text, TODAY, 'en-US')).toBe(expected)
  })

  it.each(['', 'nov', 'nov 31', '13/45', '2/29/27', '2026-02-30', 'fr', 'next week', '11/20/202', 'hello'])('rejects %j', (text) => {
    expect(parseDateText(text, TODAY, 'en-US')).toBeUndefined()
  })

  it('recent: a date with no year up to 30 days back stays this year; anything older rolls forward', () => {
    const recent = (t: string, today = TODAY) => parseDateText(t, today, 'en-US', { recent: true })
    expect(recent('nov 7')).toBe('2026-11-07') // two days ago, not next year
    expect(recent('11/7')).toBe('2026-11-07')
    expect(recent('oct 20')).toBe('2026-10-20') // 20 days back: still a past day, so a min refuses it
    expect(recent('oct 10')).toBe('2026-10-10') // 30 days back
    expect(recent('oct 9')).toBe('2027-10-09') // 31 days back
    expect(recent('jun 1')).toBe('2027-06-01') // long past: next year, though last June is closer
    expect(recent('nov 20')).toBe('2026-11-20')
    expect(recent('jan 2')).toBe('2027-01-02')
    expect(recent('nov 7 2027')).toBe('2027-11-07') // a typed year is kept
    expect(recent('nov 9')).toBe('2026-11-09')
    // Across the new year, both ways.
    expect(recent('dec 28', '2027-01-05')).toBe('2026-12-28')
    expect(recent('jan 2', '2026-12-28')).toBe('2027-01-02')
  })

  it('reads numeric dates in the locale order', () => {
    expect(parseDateText('20/11', TODAY, 'en-GB')).toBe('2026-11-20')
    expect(parseDateText('20.11.2026', TODAY, 'de-DE')).toBe('2026-11-20')
    expect(parseDateText('11/20', TODAY, 'en-GB')).toBeUndefined()
    expect(parseDateText('20/11', TODAY, 'en-US')).toBeUndefined()
  })

  it('rolls the year over at the end of December', () => {
    expect(parseDateText('jan 2', '2026-12-30', 'en-US')).toBe('2027-01-02')
    expect(parseDateText('dec 30', '2026-12-30', 'en-US')).toBe('2026-12-30')
    expect(parseDateText('tomorrow', '2026-12-31', 'en-US')).toBe('2027-01-01')
    expect(parseDateText('fri', '2026-12-31', 'en-US')).toBe('2027-01-01')
  })
})

describe('monthFirst', () => {
  it('follows the locale', () => {
    expect(monthFirst('en-US')).toBe(true)
    expect(monthFirst('en-GB')).toBe(false)
    expect(monthFirst('de-DE')).toBe(false)
  })
})
