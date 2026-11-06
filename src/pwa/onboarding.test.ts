import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { importPlan, updateSettings } from '../data'
import { newDb } from '../data/test-db'
import { fixtureTexts, validateParts } from '../data/fixtures'
import { finishOnboarding, markOnboardingStarted, readOnboardingFacts, shouldShowOnboarding } from './onboarding'

describe('onboarding gating', () => {
  it('shows only on a first run', () => {
    const first = { done: false, started: false, plans: 0, settingsSaved: false }
    expect(shouldShowOnboarding(first)).toBe(true)
    expect(shouldShowOnboarding({ ...first, done: true })).toBe(false)
    expect(shouldShowOnboarding({ ...first, plans: 1 })).toBe(false)
    expect(shouldShowOnboarding({ ...first, settingsSaved: true })).toBe(false)
    // Saved study time in step 1, then left: the setup comes back until finished or skipped.
    expect(shouldShowOnboarding({ ...first, settingsSaved: true, started: true })).toBe(true)
    expect(shouldShowOnboarding({ ...first, settingsSaved: true, started: true, done: true })).toBe(false)
  })

  it('reads the facts from the database', async () => {
    const db = newDb()
    expect(await readOnboardingFacts(db)).toEqual({ done: false, started: false, plans: 0, settingsSaved: false })

    await updateSettings(db, { reminderTime: '07:30' })
    expect(await readOnboardingFacts(db)).toMatchObject({ settingsSaved: true })

    const fresh = newDb()
    await importPlan(fresh, validateParts([fixtureTexts.sd]).plans[0]!, { startDate: '2026-11-09' })
    expect(await readOnboardingFacts(fresh)).toMatchObject({ plans: 1, settingsSaved: false })
  })

  it('keeps showing after the first step saved settings, until finished', async () => {
    const db = newDb()
    await markOnboardingStarted(db)
    await updateSettings(db, { minutesPerWeekday: [60, 60, 60, 60, 60, 90, 90] })
    expect(shouldShowOnboarding(await readOnboardingFacts(db))).toBe(true)
    await finishOnboarding(db)
    expect(shouldShowOnboarding(await readOnboardingFacts(db))).toBe(false)
  })

  it('never shows again once finished or skipped', async () => {
    const db = newDb()
    await finishOnboarding(db)
    expect(shouldShowOnboarding(await readOnboardingFacts(db))).toBe(false)
  })
})
