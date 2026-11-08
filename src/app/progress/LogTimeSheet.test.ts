import { describe, expect, it } from 'vitest'
import { loggableMinutes } from './LogTimeSheet'

// parseStudyMinutes, which this builds on, is tested in import/quick-add.test.ts.
describe('loggableMinutes', () => {
  it('takes 1 to 600 minutes', () => {
    expect(['0', '1', '600', '601', '10h', '10h 1m'].map(loggableMinutes)).toEqual([undefined, 1, 600, undefined, 600, undefined])
  })
})
