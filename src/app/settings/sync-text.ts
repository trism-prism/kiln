// Wording and input checks for Settings > Sync. Pure, so the states can be tested without a screen.
import type { SyncErrorKind, SyncSummary } from '../../sync'

/** What the person is told for each error kind (src/sync/README.md has the table). */
export function syncErrorText(kind: SyncErrorKind, message: string): string {
  switch (kind) {
    case 'wrong-key':
      return "The server does not accept this device's sync link. Disconnect, then pair again."
    case 'quota':
      return 'Sync storage is full. Delete something, then sync again.'
    case 'network':
      return 'Offline. Kiln will try again when you are back online.'
    case 'server':
      return 'The server had a problem. Try again later.'
    case 'update-required':
      return 'Update Kiln to see all changes. Another device saved data in a newer format; nothing is lost.'
    case 'disconnected':
      return 'Sync was turned off from another device. Everything on this device stays here.'
    case 'not-enabled':
      return 'Sync is off on this device.'
    case 'local':
      return `Could not read or write the data on this device: ${message}`
  }
}

/** Lines describing a finished run. Empty counts are left out; an error comes first. */
export function summaryLines(s: SyncSummary): string[] {
  const lines: string[] = []
  if (s.error) lines.push(syncErrorText(s.error.kind, s.error.message))
  lines.push(`Received ${s.pulled}, saved ${s.applied} new or newer, sent ${s.pushed}.`)
  if (s.invalid > 0) lines.push(`${s.invalid} ${s.invalid === 1 ? 'item' : 'items'} could not be read (damaged, or made with a different key).`)
  if (s.retrying > 0) lines.push(`${s.retrying} ${s.retrying === 1 ? 'item is' : 'items are'} waiting for a newer version of Kiln.`)
  if (s.tooLarge.length > 0) {
    lines.push(`${s.tooLarge.length} ${s.tooLarge.length === 1 ? 'item is' : 'items are'} too large to upload: ${s.tooLarge.map((t) => `${t.table} ${t.id}`).join(', ')}. Shorten or delete them.`)
  }
  return lines
}

/** What a person is told when a pairing could not start or finish (host and join panels). */
export function pairErrorText(reason: 'full' | 'slow' | 'network' | 'server'): string {
  switch (reason) {
    case 'full':
      return 'Too many devices are pairing right now. Try again in a few minutes.'
    case 'slow':
      return 'Too many tries. Wait a minute and try again.'
    case 'network':
      return 'Could not reach the server. Check your connection and try again.'
    case 'server':
      return 'The server had a problem. Try again later.'
  }
}

/** "2:41" for a number of seconds (never negative). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const triesLeft = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'} left`
