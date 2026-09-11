import { planWeight, type PlanRecord, type SettingsRecord } from '../../data'
import { weekdayIndex } from '../../lib/date'

/** "about 40 of your 90 min a day": the plan's part of today's study minutes (or the first study day's) at its share, at least 5. */
export function shareExample(plan: PlanRecord, plans: PlanRecord[], settings: Pick<SettingsRecord, 'minutesPerWeekday'>, today: string): string | undefined {
  const days = settings.minutesPerWeekday
  const budget = days[weekdayIndex(today)] || days.find((m) => m > 0)
  const total = plans.reduce((sum, p) => sum + planWeight(p), 0)
  if (!budget || !total) return undefined
  return `about ${Math.max(5, Math.round((budget * planWeight(plan)) / total / 5) * 5)} of your ${budget} min a day`
}
