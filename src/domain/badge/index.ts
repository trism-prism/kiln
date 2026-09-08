// The To Do badge: pure counting, no storage.
import { localDate } from '../mastery'

export interface BadgeBreakdown {
  /** Open tasks scheduled for today and open personal to-dos due today. */
  today: number
  /** Open tasks scheduled before today and open personal to-dos due before today. */
  overdue: number
  /** Review cards due today or earlier (counted as items due today). */
  reviews: number
  total: number
}

/**
 * Count = today's open tasks + overdue open tasks + reviews due today or earlier. The plan says
 * "today's open + overdue"; due reviews are shown in the to-do list as items for today, so they
 * count too. Tasks with no scheduled date, done, skipped and deleted tasks do not count. Pass live reviews only.
 * Personal to-dos count like tasks by their `date`; undated and done ones do not. Calendar events never count.
 */
export function badgeBreakdown(
  tasks: { status: string; scheduledDate?: string; deleted?: boolean }[],
  dueReviews: { due: number }[],
  today: string,
  todos: { done: boolean; date?: string; deleted?: boolean }[] = [],
): BadgeBreakdown {
  let todayN = 0
  let overdue = 0
  const dates = [
    ...tasks.filter((t) => !t.deleted && t.status === 'open').map((t) => t.scheduledDate),
    ...todos.filter((t) => !t.deleted && !t.done).map((t) => t.date),
  ]
  for (const d of dates) {
    if (!d) continue
    if (d === today) todayN++
    else if (d < today) overdue++
  }
  const reviews = dueReviews.filter((r) => localDate(r.due) <= today).length
  return { today: todayN, overdue, reviews, total: todayN + overdue + reviews }
}

export const badgeCount = (...args: Parameters<typeof badgeBreakdown>) => badgeBreakdown(...args).total
