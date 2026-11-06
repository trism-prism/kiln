/**
 * Number of To Do items to show on the badge: today's open tasks plus overdue ones.
 * Returns 0 (no badge) until stage 7 replaces the body with a useLiveQuery over src/data that feeds
 * src/domain/badge. Callers stay the same.
 */
export function useTodoCount(): number {
  return 0
}
