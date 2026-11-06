// Development and end-to-end builds only (see Onboarding.tsx): imports the system design fixture plan.
import { db, importPlan, scheduleAll } from '../../data'
import { fixtureTexts, validateParts } from '../../data/fixtures'
import { toLocalISODate } from '../../lib/date'

export async function loadSamplePlan(startDate: string): Promise<void> {
  const { plans, errors } = validateParts([fixtureTexts.sd])
  const plan = plans[0]
  if (!plan) throw new Error(`The sample plan is invalid: ${errors[0] ?? 'unknown'}`)
  await importPlan(db, plan, { startDate })
  await scheduleAll(db, toLocalISODate(new Date()))
}
