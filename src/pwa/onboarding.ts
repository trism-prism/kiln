// First-run setup: when to show it, and the flag that keeps it from coming back.
import { listPlans, SETTINGS_ID, type KilnDB } from '../data'
import { getMeta, setMeta } from './meta'

const META_DONE = 'onboarded'
/** The start date chosen in onboarding; the import screen offers it as its default. */
export const META_START_DATE = 'startDate'

export interface OnboardingFacts {
  /** Finished or skipped before. */
  done: boolean
  /** Live plans. */
  plans: number
  /** The person has saved settings at least once. */
  settingsSaved: boolean
}

/** First run means: never finished or skipped, no plans, and no settings saved. */
export const shouldShowOnboarding = (f: OnboardingFacts): boolean => !f.done && f.plans === 0 && !f.settingsSaved

export async function readOnboardingFacts(db: KilnDB): Promise<OnboardingFacts> {
  const [done, plans, settings] = await Promise.all([getMeta(db, META_DONE), listPlans(db), db.settings.get(SETTINGS_ID)])
  return { done: done === '1', plans: plans.length, settingsSaved: !!settings && !settings.deleted && settings.updatedAt > 0 }
}

/** Marks onboarding finished or skipped, for good on this device. */
export const finishOnboarding = (db: KilnDB): Promise<void> => setMeta(db, META_DONE, '1')
