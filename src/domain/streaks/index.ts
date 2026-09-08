// Study streaks and the heatmap. A study day is a local day with at least one completion: a task
// marked done, a daily problem marked done, or a review logged. Pure; the data layer lists the events.
import { addDaysISO } from '../../lib/date'
import { weekdayNames, weekStartOf, type WeekStart } from '../calendar'
import { localDate } from '../mastery'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** One completion: when it happened (ms epoch) and the minutes it took. */
export interface StudyEvent {
  at: number
  minutes: number
}

export interface DayStudy {
  count: number
  minutes: number
}

/** Completions grouped by local day. */
export function buildStudyDays(events: readonly StudyEvent[]): Map<string, DayStudy> {
  const days = new Map<string, DayStudy>()
  for (const e of events) {
    const date = localDate(e.at)
    const d = days.get(date) ?? { count: 0, minutes: 0 }
    d.count++
    d.minutes += e.minutes
    days.set(date, d)
  }
  return days
}

export interface StreakStats {
  /** Study days in the run that ends today, or yesterday while today is not done yet. */
  current: number
  longest: number
  /** Days with at least one completion. */
  studyDays: number
  completions: number
  minutes: number
}

/**
 * Streak numbers. A streak is a run of consecutive days, each with a completion or a rest day
 * (`isRest`: a blackout date or a weekday with no time budget). Rest days do not break a streak and
 * are not counted unless something was done on them. A day with no completion that is not a rest day
 * breaks it, except today while it is still open.
 */
export function streakStats(days: ReadonlyMap<string, DayStudy>, today: string, isRest: (date: string) => boolean = () => false): StreakStats {
  let completions = 0
  let minutes = 0
  let first = ''
  for (const [date, d] of days) {
    completions += d.count
    minutes += d.minutes
    if (!first || date < first) first = date
  }
  const stats: StreakStats = { current: 0, longest: 0, studyDays: days.size, completions, minutes }
  if (!first) return stats

  // Walk forward from the first study day to today, keeping the run and its best.
  let run = 0
  for (let d = first; d <= today; d = addDaysISO(d, 1)) {
    if (days.has(d)) run++
    else if (!isRest(d) && d !== today) run = 0
    if (run > stats.longest) stats.longest = run
  }
  stats.current = run
  return stats
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/**
 * 0 for a day with nothing done, then 1 to 4. With a time budget for the day, by the share of it done:
 * under 25 %, under 50 %, under 100 %, 100 % or more. Without one (blackout, a weekday set to 0 minutes),
 * by minutes: up to 30, 60, 120, more.
 */
export function heatLevel(d: DayStudy | undefined, budget = 0): HeatLevel {
  if (!d || d.count === 0) return 0
  if (budget > 0) {
    const share = d.minutes / budget
    return share < 0.25 ? 1 : share < 0.5 ? 2 : share < 1 ? 3 : 4
  }
  if (d.minutes <= 30) return 1
  if (d.minutes <= 60) return 2
  if (d.minutes <= 120) return 3
  return 4
}

export interface HeatCell {
  date: string
  count: number
  minutes: number
  level: HeatLevel
  /** After today (the rest of the current week). */
  future: boolean
}

export interface HeatmapOptions {
  weeks?: number
  weekStartsOn?: WeekStart
  /** Minutes budgeted for a day (0 for blackout dates and days off). */
  budget?: (date: string) => number
}

/**
 * The heatmap: `weeks` (53) columns of seven days, the first row being the week-start day, the last
 * column being the week that holds `today`.
 */
export function heatmapColumns(days: ReadonlyMap<string, DayStudy>, today: string, { weeks = 53, weekStartsOn = 'monday', budget }: HeatmapOptions = {}): HeatCell[][] {
  const start = addDaysISO(weekStartOf(today, weekStartsOn), -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, r): HeatCell => {
      const date = addDaysISO(start, w * 7 + r)
      const d = days.get(date)
      return { date, count: d?.count ?? 0, minutes: d?.minutes ?? 0, level: heatLevel(d, budget?.(date)), future: date > today }
    }),
  )
}

/** Per column: the month name when the column holds the 1st of a month, else ''. */
export function monthLabels(cols: readonly (readonly HeatCell[])[]): string[] {
  return cols.map((c) => {
    const first = c.find((x) => x.date.endsWith('-01'))
    return first ? MONTHS[Number(first.date.slice(5, 7)) - 1]! : ''
  })
}

/** Row labels as GitHub shows them: Mon, Wed and Fri only, '' elsewhere. */
export const rowLabels = (weekStartsOn: WeekStart): string[] => weekdayNames(weekStartsOn).map((n) => (n === 'Mon' || n === 'Wed' || n === 'Fri' ? n : ''))
