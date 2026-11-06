// "Keep in sync" for calendar links: the Worker fetches the feed (POST /feed/fetch, worker/README.md
// "Calendar feeds"); this device compares it with the plans and tells the person what is new.
import { feedChanges, listFeeds } from '../data/calendar'
import { updateRecord, type FeedRecord, type KilnDB } from '../data'

export const FEED_CHECK_MS = 6 * 60 * 60 * 1000

/** Turns a calendar link into the https URL the Worker accepts (webcal:// is the same feed). */
export function feedUrl(link: string): string | undefined {
  const t = link.trim().replace(/^webcals?:\/\//i, 'https://')
  try {
    const u = new URL(t)
    return u.protocol === 'https:' && t.length <= 2048 ? u.href : undefined
  } catch {
    return undefined
  }
}

/** The feed's text, through the Worker. Throws an Error with the Worker's reason. */
export async function fetchFeedText(fetchImpl: typeof fetch, apiUrl: string, url: string): Promise<string> {
  if (apiUrl === '') throw new Error('Calendar links need the Kiln server, which is not set up here. Download the .ics file and upload it instead.')
  let res: Response
  try {
    res = await fetchImpl(`${apiUrl}/feed/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  } catch {
    throw new Error('Kiln could not reach its server. Check your connection and try again.')
  }
  if (res.ok) return res.text()
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  throw new Error(typeof body.error === 'string' ? `Could not read the calendar: ${body.error}.` : `Could not read the calendar (error ${res.status}).`)
}

/** "3 new assignments, 1 due date changed". */
export function feedNotice(added: number, changed: number): string {
  const parts: string[] = []
  if (added > 0) parts.push(`${added} new assignment${added === 1 ? '' : 's'}`)
  if (changed > 0) parts.push(`${changed} due date${changed === 1 ? '' : 's'} changed`)
  return parts.join(', ')
}

export interface FeedCheck {
  feed: FeedRecord
  added: number
  changed: number
}

let inFlight: Promise<FeedCheck[]> | undefined

/**
 * Re-reads every feed last checked 6 hours ago or more, records the result on the feed, and returns
 * the feeds with something new. Nothing is imported: the person reviews first. Failures are stored
 * on the feed (lastResult) and do not stop the others.
 */
export function checkFeedsIfDue(db: KilnDB, fetchImpl: typeof fetch, apiUrl: string, now: number, today: string): Promise<FeedCheck[]> {
  if (apiUrl === '') return Promise.resolve([])
  inFlight ??= (async () => {
    const out: FeedCheck[] = []
    try {
      for (const feed of await listFeeds(db)) {
        if (now - (feed.lastFetchedAt ?? 0) < FEED_CHECK_MS) continue
        try {
          const text = await fetchFeedText(fetchImpl, apiUrl, feed.url)
          const { added, changed } = await feedChanges(db, feed, text, today)
          await updateRecord(db, 'feeds', feed.id, { lastFetchedAt: now, lastResult: { ok: true, added, changed } })
          if (added + changed > 0) out.push({ feed, added, changed })
        } catch (e) {
          const error = (e instanceof Error ? e.message : 'failed').slice(0, 500)
          await updateRecord(db, 'feeds', feed.id, { lastFetchedAt: now, lastResult: { ok: false, error } })
        }
      }
    } finally {
      inFlight = undefined
    }
    return out
  })()
  return inFlight
}
