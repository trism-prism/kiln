// What the service worker does with a push. Kept out of sw.ts so it can be tested.
import { applyBadge, notificationText, type BadgeTarget, type PushKind } from './badge'
import { readBreakdown } from './read-counts'

export interface PushDeps {
  indexedDB: IDBFactory
  now: () => Date
  /** Shows the notification (registration.showNotification). */
  show: (title: string, options: NotificationOptions) => Promise<void>
  badge: BadgeTarget
}

/** The `kind` of a decrypted push body; anything unreadable counts as a reminder. */
export function pushKind(data: { json(): unknown } | null | undefined): PushKind {
  try {
    const body = data?.json() as { kind?: unknown } | null
    return body?.kind === 'nudge' ? 'nudge' : 'reminder'
  } catch {
    return 'reminder'
  }
}

/** Counts today's tasks, shows a notification and sets the badge. Always shows one, even when reading fails. */
export async function handlePush(data: { json(): unknown } | null | undefined, deps: PushDeps): Promise<void> {
  const kind = pushKind(data)
  let body = "Open Kiln to see today's tasks"
  let total = 0
  let counted = false
  try {
    const counts = await readBreakdown(deps.indexedDB, deps.now())
    body = notificationText(kind, counts)
    total = counts.total
    counted = true
  } catch {
    // Keep the generic line.
  }
  await deps.show('Kiln', { body, tag: 'kiln-daily', icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', data: { url: '/todo' } })
  if (counted) await applyBadge(deps.badge, total)
}
