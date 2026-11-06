// Per-plan settings added in schema 4 that the scheduler reads: share of study time and the daily problem toggle. Pure.
import type { DailyPractice } from '../domain/plan-format'
import type { PlanRecord, Share } from './types'

export const SHARES: Share[] = ['less', 'even', 'more']

/** Scheduler weight per share: Less 2, Even 3, More 5. */
export const SHARE_WEIGHT: Record<Share, number> = { less: 2, even: 3, more: 5 }

/** The share for an old 1-5 weight: 1-2 less, 3 even, 4-5 more. */
export const shareFromWeight = (weight: number): Share => (weight <= 2 ? 'less' : weight >= 4 ? 'more' : 'even')

/** The weight the scheduler uses: the share's when set, else the stored weight (rows from devices before schema 4). */
export const planWeight = (p: Pick<PlanRecord, 'share' | 'weight'>): number => (p.share ? SHARE_WEIGHT[p.share] : p.weight)

/** Used when daily practice is switched on for a plan whose file has no `dailyPractice`. */
export const DEFAULT_DAILY_PRACTICE: DailyPractice = { source: 'neetcode', perDay: 1, startDifficulty: 'easy', topicFollowsLessons: true }

/** The plan's daily practice config, or undefined when daily practice is off for it. */
export function practiceConfig(p: Pick<PlanRecord, 'dailyPractice' | 'dailyPracticeOn'>): DailyPractice | undefined {
  if (p.dailyPracticeOn === false) return undefined
  return p.dailyPractice ?? (p.dailyPracticeOn ? DEFAULT_DAILY_PRACTICE : undefined)
}

/** Whether daily practice is on for the plan (the toggle's state). */
export const practiceOn = (p: Pick<PlanRecord, 'dailyPractice' | 'dailyPracticeOn'>): boolean => practiceConfig(p) !== undefined
