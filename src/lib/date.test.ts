import { describe, expect, it } from 'vitest'
import { toLocalISODate } from './date'

describe('toLocalISODate', () => {
  it('uses local calendar fields and zero-pads', () => {
    expect(toLocalISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
