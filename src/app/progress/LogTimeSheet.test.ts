import { describe, expect, it } from 'vitest'
import { parseStudyMinutes } from './LogTimeSheet'

describe('parseStudyMinutes', () => {
  it('reads minutes the way people type them', () => {
    expect(['30', ' 45m ', '1h', '1h 30m', '1 h 30 min', '1.5 hours', '90 minutes', '1h30', '2H05', '1 h 30'].map(parseStudyMinutes)).toEqual([30, 45, 60, 90, 90, 90, 90, 90, 125, 90])
  })
  it('refuses anything that is not only a duration', () => {
    expect(['', 'abc', '30 psych', 'fri', '-5', '1,5h'].map(parseStudyMinutes)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })
})
