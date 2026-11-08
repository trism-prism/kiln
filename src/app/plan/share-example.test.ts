import { describe, expect, it } from 'vitest'
import type { PlanRecord } from '../../data'
import { shareExample } from './share-example'

const plan = (weight: number) => ({ weight }) as PlanRecord

describe('shareExample', () => {
  const settings = { minutesPerWeekday: [60, 60, 60, 60, 60, 60, 60] }
  it('rounds to 5 minutes', () => {
    expect(shareExample(plan(3), [plan(3), plan(3)], settings, '2026-11-09')).toBe('about 30 of your 60 min a day')
  })
  it('never says about 0 min', () => {
    const small = plan(2)
    expect(shareExample(small, [small, plan(5), plan(5), plan(5), plan(5), plan(5), plan(5), plan(5), plan(5), plan(5), plan(5)], { minutesPerWeekday: [20, 20, 20, 20, 20, 20, 20] }, '2026-11-09')).toBe('about 5 of your 20 min a day')
  })
  it('leaves study time plans out: they have their own weekly time, not a share', () => {
    const study = { weight: 3, studyMinutesPerWeek: 180 } as PlanRecord
    expect(shareExample(plan(3), [plan(3), plan(3), study], settings, '2026-11-09')).toBe('about 30 of your 60 min a day')
  })
  it('has no example without study minutes', () => {
    expect(shareExample(plan(3), [plan(3)], { minutesPerWeekday: [0, 0, 0, 0, 0, 0, 0] }, '2026-11-09')).toBeUndefined()
  })
})
