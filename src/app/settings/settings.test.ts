import { describe, expect, it } from 'vitest'
import { formatHours, parseMinutes, weekTotal } from './budget'

describe('budget helpers', () => {
  it('parses whole minutes from 0 to 1440 only', () => {
    expect(parseMinutes('0')).toBe(0)
    expect(parseMinutes(' 90 ')).toBe(90)
    expect(parseMinutes('1440')).toBe(1440)
    for (const bad of ['', '1.5', '-5', 'abc', '1441', '12345']) expect(parseMinutes(bad)).toBeUndefined()
  })
  it('totals the week, counting bad days as 0', () => {
    expect(weekTotal(['120', '120', '120', '120', '120', '180', '180'])).toBe(960)
    expect(weekTotal(['60', 'x', '', '0', '0', '0', '0'])).toBe(60)
    expect(formatHours(960)).toBe('16 h')
    expect(formatHours(90)).toBe('1.5 h')
  })
})
