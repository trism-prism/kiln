// Badge and notification wording. Pure, and shared by the app and the service worker.
import type { BadgeBreakdown } from '../domain/badge'

export type PushKind = 'reminder' | 'nudge'

const tasks = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

/**
 * The notification text for a push. Always returns something to show: Safari and iOS revoke a
 * subscription whose pushes show nothing, so an empty day gets a gentle line instead of silence.
 */
export function notificationText(kind: PushKind, c: BadgeBreakdown): string {
  if (c.total === 0) return kind === 'nudge' ? 'All done for today' : 'Nothing due today'
  const overdue = c.overdue > 0 ? ` (${c.overdue} overdue)` : ''
  return kind === 'nudge' ? `${tasks(c.total)} still open today${overdue}` : `${tasks(c.total)} today${overdue}`
}

/** Anything with the Badging API methods: `navigator` in a page, `self.navigator` in a worker. */
export interface BadgeTarget {
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** Sets the app icon badge to `n` (cleared at 0). Does nothing where the Badging API is missing. */
export async function applyBadge(target: BadgeTarget, n: number): Promise<void> {
  try {
    if (n > 0) await target.setAppBadge?.(n)
    else await target.clearAppBadge?.()
  } catch {
    // The badge is a nicety; a refusal (no permission, not installed) is not an error.
  }
}
