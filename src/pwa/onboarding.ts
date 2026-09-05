// First-run setup: when to show it, and the flag that keeps it from coming back.
import { listPlans, SETTINGS_ID, type KilnDB } from '../data'
import { getMeta, setMeta } from './meta'

const META_DONE = 'onboarded'
/** Set when the setup is first shown, so a person who saved study time and left comes back to it. */
const META_STARTED = 'onboardingStarted'
/** The start date chosen in onboarding; the import screen offers it as its default. */
export const META_START_DATE = 'startDate'

export interface OnboardingFacts {
  /** Finished or skipped before. */
  done: boolean
  /** The setup was shown before but not finished or skipped. */
  started: boolean
  /** Live plans. */
  plans: number
  /** The person has saved settings at least once. */
  settingsSaved: boolean
}

/** First run means: never finished or skipped, no plans, and no settings saved (or the setup is under way). */
export const shouldShowOnboarding = (f: OnboardingFacts): boolean => !f.done && f.plans === 0 && (f.started || !f.settingsSaved)

export async function readOnboardingFacts(db: KilnDB): Promise<OnboardingFacts> {
  const [done, started, plans, settings] = await Promise.all([getMeta(db, META_DONE), getMeta(db, META_STARTED), listPlans(db), db.settings.get(SETTINGS_ID)])
  return { done: done === '1', started: started === '1', plans: plans.length, settingsSaved: !!settings && !settings.deleted && settings.updatedAt > 0 }
}

export const markOnboardingStarted = (db: KilnDB): Promise<void> => setMeta(db, META_STARTED, '1')

/** Marks onboarding finished or skipped, for good on this device. */
export const finishOnboarding = (db: KilnDB): Promise<void> => setMeta(db, META_DONE, '1')
