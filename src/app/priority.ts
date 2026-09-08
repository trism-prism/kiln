import type { Priority } from '../domain/plan-format'

/** What the user sees for each priority. The stored values (core, recommended, optional) never change. */
export const PRIORITY_LABEL: Record<Priority, string> = { core: 'Essential', recommended: 'Recommended', optional: 'Optional' }

export const PRIORITY_HINT: Record<Priority, string> = {
  core: 'Must be done to finish the plan',
  recommended: 'Helpful, but you can skip it if you run short on time',
  optional: 'Extra practice; the first to go when time is tight',
}
