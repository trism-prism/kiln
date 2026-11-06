import { useBadgeCount, useToday } from './queries'

/**
 * Number on the To Do badge: open tasks and daily problems for today, overdue ones, and reviews due
 * (src/domain/badge). Live: it updates as soon as anything is completed, skipped or rescheduled.
 */
export function useTodoCount(): number {
  return useBadgeCount(useToday())
}
