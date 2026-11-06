import { describe, expect, it } from 'vitest'
import { uses12Hours } from './time'

describe('uses12Hours', () => {
  it('is true for 12-hour locales and false for 24-hour ones', () => {
    expect(uses12Hours('en-US')).toBe(true)
    expect(uses12Hours('de-DE')).toBe(false)
    expect(uses12Hours('en-GB')).toBe(false)
  })
})
