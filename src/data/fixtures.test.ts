import { describe, expect, it } from 'vitest'
import { fixtureTexts, validateParts } from './fixtures'

describe('real plan fixtures', () => {
  it('DSA parts 1-3 validate with no errors (later parts see earlier ones)', () => {
    const { plans, errors } = validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3])
    expect(errors).toEqual([])
    expect(plans.map((p) => p.part)).toEqual([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
      { index: 3, total: 3 },
    ])
  })

  it('system design validates with no errors', () => {
    const { plans, errors } = validateParts([fixtureTexts.sd])
    expect(errors).toEqual([])
    expect(plans).toHaveLength(1)
  })
})
