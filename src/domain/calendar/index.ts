// Calendar math: month and week grids, keyboard movement between days, and dependency warnings for
// a move. Pure. Dates are local "yyyy-mm-dd" and all arithmetic is calendar arithmetic (no time
// zone, so DST weeks have seven days like any other).
import { addDaysISO, formatDay, weekdayIndex } from '../../lib/date'

export type WeekStart = 'monday' | 'sunday'
export type CalendarView = 'month' | 'week'

const parts = (s: string) => s.split('-').map(Number) as [number, number, number]
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** First day of the week that holds `date`. */
export function weekStartOf(date: string, weekStartsOn: WeekStart = 'monday'): string {
  const i = weekdayIndex(date) // Monday = 0
  return addDaysISO(date, -(weekStartsOn === 'monday' ? i : (i + 1) % 7))
}

/** The seven days of the week that holds `date`. */
export function weekDates(date: string, weekStartsOn: WeekStart = 'monday'): string[] {
  const start = weekStartOf(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
}

/** Whole weeks (4 to 6 rows of 7 days) that cover the month holding `date`, including the neighbours' days at the edges. */
export function monthGrid(date: string, weekStartsOn: WeekStart = 'monday'): string[][] {
  const [y, m] = parts(date)
  const first = iso(y, m, 1)
  const last = addDaysISO(iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1)
  const weeks: string[][] = []
  for (let d = weekStartOf(first, weekStartsOn); d <= last; d = addDaysISO(d, 7)) weeks.push(weekDates(d, weekStartsOn))
  return weeks
}

/** The same day number in another month, held to that month's last day ("Jan 31" + 1 = "Feb 28"). */
export function shiftMonth(date: string, months: number): string {
  const [y, m, d] = parts(date)
  const first = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return iso(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, lastDay))
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)

const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Short weekday names in column order. */
export const weekdayNames = (weekStartsOn: WeekStart) => (weekStartsOn === 'monday' ? NAMES : ['Sun', ...NAMES.slice(0, 6)])

/**
 * Where an arrow-key press takes the focused day: left/right one day, up/down one week, Home/End
 * the first/last day of the week, Page up/down one month (one week in the week view). undefined for any other key.
 */
export function navigateDate(key: string, date: string, view: CalendarView, weekStartsOn: WeekStart = 'monday'): string | undefined {
  switch (key) {
    case 'ArrowLeft':
      return addDaysISO(date, -1)
    case 'ArrowRight':
      return addDaysISO(date, 1)
    case 'ArrowUp':
      return addDaysISO(date, -7)
    case 'ArrowDown':
      return addDaysISO(date, 7)
    case 'Home':
      return weekStartOf(date, weekStartsOn)
    case 'End':
      return addDaysISO(weekStartOf(date, weekStartsOn), 6)
    case 'PageUp':
      return view === 'month' ? shiftMonth(date, -1) : addDaysISO(date, -7)
    case 'PageDown':
      return view === 'month' ? shiftMonth(date, 1) : addDaysISO(date, 7)
    default:
      return undefined
  }
}

/** "November 2026" or "Nov 9 to Nov 15, 2026" (what the toolbar shows). */
export function periodLabel(anchor: string, view: CalendarView, weekStartsOn: WeekStart = 'monday'): string {
  if (view === 'month') {
    const [y, m] = parts(anchor)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const days = weekDates(anchor, weekStartsOn)
  const noWeekday = (s: string) => s.replace(/^[A-Za-z]+, /, '')
  return `${noWeekday(formatDay(days[0]!))} to ${noWeekday(formatDay(days[6]!, true))}`
}

export interface MovableTask {
  id: string
  key: string
  planId: string
  title: string
  status: 'open' | 'done' | 'skipped'
  scheduledDate?: string
  dependsOn: string[]
}

/**
 * Messages for the dependencies a move to `toDate` would break, using the scheduler's rule: an open
 * dependency must be on an earlier day. Covers what the task needs (placed on or after the day, or
 * with no day) and the open tasks that need it (placed on or before the day). Empty when fine.
 */
export function moveWarnings(task: MovableTask, toDate: string, all: readonly MovableTask[]): string[] {
  const out: string[] = []
  const mine = all.filter((t) => t.planId === task.planId)
  for (const k of task.dependsOn) {
    const dep = mine.find((t) => t.key === k)
    if (!dep || dep.status !== 'open') continue
    if (!dep.scheduledDate) out.push(`Needs "${dep.title}", which has no day yet.`)
    else if (dep.scheduledDate >= toDate) out.push(`Needs "${dep.title}", which is due ${formatDay(dep.scheduledDate)}.`)
  }
  for (const t of mine) {
    if (t.id === task.id || t.status !== 'open' || !t.dependsOn.includes(task.key)) continue
    if (t.scheduledDate && t.scheduledDate <= toDate) out.push(`"${t.title}" needs this and is due ${formatDay(t.scheduledDate)}.`)
  }
  return out
}
