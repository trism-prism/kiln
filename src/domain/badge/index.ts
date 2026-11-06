// The To Do badge: pure counting, no storage.
import { localDate } from '../mastery'

export interface BadgeBreakdown {
  /** Open tasks scheduled for today. */
  today: number
  /** Open tasks scheduled before today. */
  overdue: number
  /** Review cards due today or earlier (counted as items due today). */
  reviews: number
  total: number
}

/**
 * Count = today's open tasks + overdue open tasks + reviews due today or earlier. The plan says
 * "today's open + overdue"; due reviews are shown in the to-do list as items for today, so they
 * count too. Tasks with no scheduled date, done, skipped and deleted tasks do not count. Pass live reviews only.
 */
export function badgeBreakdown(
  tasks: { status: string; scheduledDate?: string; deleted?: boolean }[],
  dueReviews: { due: number }[],
  today: string,
): BadgeBreakdown {
  let todayN = 0
  let overdue = 0
  for (const t of tasks) {
    if (t.deleted || t.status !== 'open' || !t.scheduledDate) continue
    if (t.scheduledDate === today) todayN++
    else if (t.scheduledDate < today) overdue++
  }
  const reviews = dueReviews.filter((r) => localDate(r.due) <= today).length
  return { today: todayN, overdue, reviews, total: todayN + overdue + reviews }
}

export const badgeCount = (...args: Parameters<typeof badgeBreakdown>) => badgeBreakdown(...args).total
