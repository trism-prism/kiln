// Sample data for local testing and e2e: the real plan fixtures (DSA parts 1-3 and system design),
// starting today, scheduled (reviews off unless `reviewsOn`). Not reachable from production builds (see src/app/devSeed.ts).
import { toLocalISODate } from '../lib/date'
import type { KilnDB } from './db'
import { fixtureTexts, validateParts } from './fixtures'
import { importPlan, listPlans } from './repo'
import { scheduleAll } from './schedule'

/** Imports the fixture plans (day 1 = `today`) and schedules them. Does nothing when a plan already exists. */
export async function seedFixtures(db: KilnDB, today: string = toLocalISODate(new Date()), reviewsOn = false): Promise<boolean> {
  if ((await listPlans(db)).length > 0) return false
  for (const text of [[fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3], [fixtureTexts.sd]]) {
    const { plans, errors } = validateParts(text)
    if (errors.length) throw new Error(`Fixture plan is invalid: ${errors[0]}`)
    for (const plan of plans) await importPlan(db, plan, { startDate: today, reviewsOn })
  }
  await scheduleAll(db, today)
  return true
}
