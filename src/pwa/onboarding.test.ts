import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { importPlan, updateSettings } from '../data'
import { newDb } from '../data/test-db'
import { fixtureTexts, validateParts } from '../data/fixtures'
import { finishOnboarding, readOnboardingFacts, shouldShowOnboarding } from './onboarding'

describe('onboarding gating', () => {
  it('shows only on a first run', () => {
    expect(shouldShowOnboarding({ done: false, plans: 0, settingsSaved: false })).toBe(true)
    expect(shouldShowOnboarding({ done: true, plans: 0, settingsSaved: false })).toBe(false)
    expect(shouldShowOnboarding({ done: false, plans: 1, settingsSaved: false })).toBe(false)
    expect(shouldShowOnboarding({ done: false, plans: 0, settingsSaved: true })).toBe(false)
  })

  it('reads the facts from the database', async () => {
    const db = newDb()
    expect(await readOnboardingFacts(db)).toEqual({ done: false, plans: 0, settingsSaved: false })

    await updateSettings(db, { reminderTime: '07:30' })
    expect(await readOnboardingFacts(db)).toMatchObject({ settingsSaved: true })

    const fresh = newDb()
    await importPlan(fresh, validateParts([fixtureTexts.sd]).plans[0]!, { startDate: '2026-11-09' })
    expect(await readOnboardingFacts(fresh)).toMatchObject({ plans: 1, settingsSaved: false })
  })

  it('never shows again once finished or skipped', async () => {
    const db = newDb()
    await finishOnboarding(db)
    expect(shouldShowOnboarding(await readOnboardingFacts(db))).toBe(false)
  })
})
