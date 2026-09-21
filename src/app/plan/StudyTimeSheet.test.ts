import { describe, expect, it } from 'vitest'
import { studyLine, weeklyTimeError } from './StudyTimeSheet'

const DEFAULT = [120, 120, 120, 120, 120, 180, 180]
const text = (...args: Parameters<typeof studyLine>) => studyLine(...args)?.text

describe('studyLine', () => {
  it('describes the week from the sessions Kiln would really plan', () => {
    expect(text(180, DEFAULT, [])).toBe('About 25 min a day on your 7 study days.')
    // 15 minutes a week is one session, not "about 5 min a day".
    expect(text(15, DEFAULT, [])).toBe('One 15 min session a week.')
    expect(text(50, Array(7).fill(60), [])).toBe('About 15 min on 3 of your 7 study days.')
  })

  it('warns when the time does not fit, alone or with the other study plans', () => {
    expect(studyLine(undefined, Array(7).fill(0), [])).toMatchObject({ warning: true, settings: true })
    expect(text(1200, DEFAULT, [])).toBe("That's more than the 14 h a week you have, so Kiln plans 14 h.")
    expect(text(300, DEFAULT, [{ id: 'a', studyMinutesPerWeek: 600 }])).toBe('Your study time plans add up to 15 h a week, more than the 14 h you have. Kiln shares the 14 h between them.')
  })

  it('takes 15 minutes to 40 hours', () => {
    expect(['3h', '10', '41h', 'soon'].map(weeklyTimeError)).toEqual(['', 'At least 15 min, like 3h or 90m', 'Up to 40 h a week', 'Enter the time, like 3h or 90m'])
  })
})
