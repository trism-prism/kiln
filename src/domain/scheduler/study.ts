// Study time plans: a subject plus minutes per week, turned into one session a day on study days.
// Pure. Called once per schedule() run; the sessions are reserved before reviews, problems and tasks.
import { addDaysISO, weekdayIndex } from '../../lib/date'
import { weekStartOf } from '../calendar'
import type { GeneratedStudy, ScheduleInput } from './types'

/** Smallest session, minutes. */
export const STUDY_MIN = 15
/** Largest session (one sitting), minutes. */
export const STUDY_MAX = 120
/** Sessions are whole multiples of this. */
export const STUDY_STEP = 5
/** Same as the scheduler's horizon. */
const HORIZON_DAYS = 3 * 365
/** Sessions are reported (and stored) from today through today + this many days; To Do shows at most "In 4 Weeks". */
export const STUDY_WINDOW_DAYS = 34

/**
 * One ordinary week of sessions for these study plans, all running and no days off: how their weekly time splits
 * by day, and what each really gets when they don't all fit. Used for the sheet's line and "Planned: x of y".
 */
export function typicalStudyWeek(plans: { id: string; studyMinutesPerWeek: number }[], minutesPerWeekday: number[]): GeneratedStudy[] {
  const monday = '2000-01-03'
  const sunday = addDaysISO(monday, 6)
  return studySessions({
    plans: plans.map((p) => ({ id: p.id, weight: 3, startDate: monday, deadline: sunday, studyMinutesPerWeek: p.studyMinutesPerWeek })),
    tasks: [],
    minutesPerWeekday,
    blackoutDates: [],
    today: monday,
    mode: 'initial',
  })
}

export const round5 = (m: number) => Math.round(m / STUDY_STEP) * STUDY_STEP

/** The most study one week can hold: each weekday's minutes, capped at one sitting. */
export const weekCapacity = (minutesPerWeekday: number[]) => minutesPerWeekday.slice(0, 7).reduce((n, m) => n + Math.min(STUDY_MAX, m), 0)

/**
 * Splits `units` (of STUDY_STEP minutes) over days in proportion to `weight`, largest remainder first (ties to the
 * earlier day). A day never gets more than its `cap` units; units over a cap are left out, not moved.
 */
function split(units: number, days: { weight: number; cap: number }[]): number[] {
  const total = days.reduce((n, d) => n + d.weight, 0)
  const exact = days.map((d) => (units * d.weight) / total)
  const out = exact.map((e, i) => Math.min(Math.floor(e), days[i]!.cap))
  const left = units - exact.reduce((n, e) => n + Math.floor(e), 0)
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of order.slice(0, left)) if (out[i]! < days[i]!.cap) out[i]!++
  return out
}

/**
 * The sessions of every study plan from the week holding `today` to the plan's end (or the horizon). Per week:
 * - each plan asks for weekly minutes x (study weight of its days in the week / a full week's weight); when the
 *   asks add up to more than the week's minutes, all are scaled by the same factor; 5-minute steps;
 * - what is still to do (target minus this week's done sessions) is split over the open days from today in
 *   proportion to each day's minutes, at most a day's minutes (and 120) less what done sessions (any plan) and
 *   earlier plans (by id) took;
 * - a session under 15 minutes merges into the other days by dropping the day with the smallest share (the later one on a tie).
 * Missed days are not carried over: their minutes go to the rest of the same week.
 */
export function studySessions(input: ScheduleInput): GeneratedStudy[] {
  const plans = input.plans.filter((p) => (p.studyMinutesPerWeek ?? 0) > 0).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (plans.length === 0) return []
  const mpw = input.minutesPerWeekday
  const capacity = weekCapacity(mpw)
  if (capacity === 0) return []
  const blackout = new Set(input.blackoutDates)
  const weight = (d: string) => (blackout.has(d) ? 0 : Math.min(STUDY_MAX, mpw[weekdayIndex(d)] ?? 0))
  const { today } = input
  const horizon = addDaysISO(today, HORIZON_DAYS)
  const last = plans.some((p) => !p.deadline) ? horizon : plans.map((p) => p.deadline!).reduce((a, b) => (a > b ? a : b))
  const done = new Map<string, number>()
  for (const s of input.studyDone ?? []) done.set(`${s.planId}|${s.date}`, (done.get(`${s.planId}|${s.date}`) ?? 0) + s.minutes)

  const out: GeneratedStudy[] = []
  for (let ws = weekStartOf(today, input.weekStartsOn ?? 'monday'); ws <= last && ws <= horizon; ws = addDaysISO(ws, 7)) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysISO(ws, i))
    const daysOf = (p: (typeof plans)[number]) => week.filter((d) => d >= p.startDate && (!p.deadline || d <= p.deadline))
    const active = plans.filter((p) => daysOf(p).length > 0)
    // Each plan's share of this week, from the days it covers; then all scale down together only if the week's
    // real minutes can't hold them (a plan that starts on Saturday asks for Saturday's share, not a whole week).
    const raw = new Map(active.map((p) => [p.id, (p.studyMinutesPerWeek! * daysOf(p).reduce((n, d) => n + weight(d), 0)) / capacity]))
    const asked = [...raw.values()].reduce((n, m) => n + m, 0)
    const room = week.reduce((n, d) => n + weight(d), 0)
    const scale = asked > 0 ? Math.min(1, room / asked) : 1
    // Minutes already taken on each day: every plan's done sessions, then what earlier plans (by id) get.
    const used = new Map<string, number>()
    for (const s of input.studyDone ?? []) if (week.includes(s.date)) used.set(s.date, (used.get(s.date) ?? 0) + s.minutes)
    for (const p of active) {
      const pdays = daysOf(p)
      const target = round5(scale * raw.get(p.id)!)
      const doneMinutes = pdays.reduce((n, d) => n + (done.get(`${p.id}|${d}`) ?? 0), 0)
      const rest = Math.max(0, target - doneMinutes)
      if (rest < STUDY_MIN) continue
      let open = pdays
        .filter((d) => d >= today && !done.has(`${p.id}|${d}`) && weight(d) > 0)
        .map((d) => ({ d, weight: weight(d), cap: Math.floor((weight(d) - (used.get(d) ?? 0)) / STUDY_STEP) }))
        .filter((x) => x.cap > 0)
      const units = Math.floor(rest / STUDY_STEP)
      let parts = open.length ? split(units, open) : []
      while (open.length > 1 && parts.some((u) => u * STUDY_STEP < STUDY_MIN)) {
        // Drop the day with the smallest share; on a tie the later one.
        let drop = 0
        parts.forEach((u, i) => {
          if (u <= parts[drop]!) drop = i
        })
        open = open.filter((_, i) => i !== drop)
        parts = split(units, open)
      }
      open.forEach((x, i) => {
        const minutes = parts[i]! * STUDY_STEP
        if (minutes < STUDY_MIN) return
        out.push({ planId: p.id, date: x.d, minutes })
        used.set(x.d, (used.get(x.d) ?? 0) + minutes)
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.planId < b.planId ? -1 : 1))
}
