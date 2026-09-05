// Wording and input checks for Settings > Sync. Pure, so the states can be tested without a screen.
import type { SyncErrorKind, SyncSummary } from '../../sync'
import { mnemonicToKey, qrPayloadToKey } from '../../sync'

/** What the person is told for each error kind (src/sync/README.md has the table). */
export function syncErrorText(kind: SyncErrorKind, message: string): string {
  switch (kind) {
    case 'wrong-key':
      return 'This key does not match the data on the server. Check the 24 words, or turn sync off and join again.'
    case 'quota':
      return 'Sync storage is full. Delete something, then sync again.'
    case 'network':
      return 'Offline. Kiln will try again when you are back online.'
    case 'server':
      return 'The server had a problem. Try again later.'
    case 'update-required':
      return 'Update Kiln to see all changes. Another device saved data in a newer format; nothing is lost.'
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

export type KeyCheck =
  | { state: 'empty' }
  | { state: 'partial'; words: number }
  | { state: 'invalid'; message: string }
  | { state: 'valid'; kind: 'words' | 'qr' }

/** Checks typed or pasted key text: 24 words, or the `kiln-sync:` text a QR code holds. Needs no server. */
export function checkKeyInput(text: string): KeyCheck {
  const t = text.trim()
  if (t === '') return { state: 'empty' }
  try {
    if (t.startsWith('kiln-sync:')) {
      qrPayloadToKey(t)
      return { state: 'valid', kind: 'qr' }
    }
    const words = t.split(/\s+/).length
    if (words < 24) return { state: 'partial', words }
    mnemonicToKey(t)
    return { state: 'valid', kind: 'words' }
  } catch (e) {
    return { state: 'invalid', message: e instanceof Error ? e.message : String(e) }
  }
}
