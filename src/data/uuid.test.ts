import { describe, expect, it } from 'vitest'
import { uuidv7 } from './uuid'

const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('has the version 7 format and encodes the timestamp', () => {
    const now = 1_760_000_000_123
    const id = uuidv7(now)
    expect(id).toMatch(FORMAT)
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(now)
  })

  it('is unique and sorts in creation order within one millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7(1_800_000_000_000))
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
  })

  it('sorts in creation order across milliseconds and a clock step back', () => {
    const ids = [uuidv7(1_900_000_000_000), uuidv7(1_900_000_000_001), uuidv7(1_900_000_000_000), uuidv7(1_900_000_000_050)]
    expect([...ids].sort()).toEqual(ids)
    ids.forEach((id) => expect(id).toMatch(FORMAT))
  })
})
