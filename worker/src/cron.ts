import { sendPush, type VapidKeys } from './push'

export type Kind = 'reminder' | 'nudge'

/** A reminder is skipped if it is more than this late (cron outage, or a subscription made long after the time). */
export const WINDOW_MIN = 120
/** Free-plan Workers allow 50 outbound fetches per invocation; leftovers go out on the next run. */
export const MAX_SENDS = 40

export interface SubRow {
  id: number
  endpoint: string
  p256dh: string
  auth: string
  reminder_time: string
  nudge_time: string | null
  timezone: string
  last_reminder_date: string | null
  last_nudge_date: string | null
}

/** Local calendar date and HH:MM in an IANA zone. */
export function localNow(now: Date, timeZone: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Minutes since `time` last occurred and the local date that occurrence belongs to.
 * An occurrence more than 12 hours ahead is really yesterday's (so 23:50 is 10 minutes late at 00:00).
 */
function sinceOccurrence(now: Date, timeZone: string, time: string): { late: number; date: string } {
  const l = localNow(now, timeZone)
  const late = minutes(l.time) - minutes(time)
  return late < -720 ? { late: late + 1440, date: previousDay(l.date) } : { late, date: l.date }
}

/** Date to record as "already sent" when the time has already passed (so subscribing late does not fire at once). */
export function seedSentDate(time: string | null, now: Date, timeZone: string): string | null {
  if (!time) return null
  const o = sinceOccurrence(now, timeZone, time)
  return o.late >= 0 ? o.date : null
}

export interface Due {
  kind: Kind
  date: string
}

/** Kinds due now: the time was reached (within the window) and not yet sent for that occurrence's local date. */
export function dueKinds(s: SubRow, now: Date): Due[] {
  const out: Due[] = []
  const check = (time: string | null, last: string | null, kind: Kind) => {
    if (!time) return
    const o = sinceOccurrence(now, s.timezone, time)
    if (o.late >= 0 && o.late < WINDOW_MIN && last !== o.date) out.push({ kind, date: o.date })
  }
  check(s.reminder_time, s.last_reminder_date, 'reminder')
  check(s.nudge_time, s.last_nudge_date, 'nudge')
  return out
}

export async function runCron(
  db: D1Database,
  vapid: VapidKeys,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; removed: number; failed: number }> {
  // ponytail: loads every row; fine for thousands of devices, shard by timezone beyond that.
  const { results } = await db
    .prepare('SELECT * FROM push_subscriptions ORDER BY last_attempt_at ASC, id ASC')
    .all<SubRow>()
  const stats = { sent: 0, removed: 0, failed: 0 }
  const iso = now.toISOString()
  let budget = MAX_SENDS
  for (const s of results) {
    for (const { kind, date } of dueKinds(s, now)) {
      if (budget-- <= 0) return stats
      const col = kind === 'reminder' ? 'last_reminder_date' : 'last_nudge_date'
      const previous = kind === 'reminder' ? s.last_reminder_date : s.last_nudge_date
      let claimed = false
      try {
        // Claim first so an overlapping run cannot send the same reminder twice.
        const claim = await db
          .prepare(`UPDATE push_subscriptions SET ${col} = ?, last_attempt_at = ? WHERE id = ? AND (${col} IS NULL OR ${col} != ?)`)
          .bind(date, iso, s.id, date)
          .run()
        if (claim.meta.changes !== 1) continue
        claimed = true
        const status = await sendPush(vapid, s, { kind }, Math.floor(now.getTime() / 1000), fetchImpl)
        if (status >= 200 && status < 300) {
          stats.sent++
        } else if (status === 404 || status === 410) {
          await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run()
          stats.removed++
          break
        } else {
          console.error('push rejected', s.id, status)
          stats.failed++
          await release(db, col, s.id, date, previous)
        }
      } catch (e) {
        console.error('push failed', s.id, e instanceof Error ? e.message : e)
        stats.failed++
        if (claimed) await release(db, col, s.id, date, previous).catch(() => {})
      }
    }
  }
  return stats
}

/** Undo a claim after a failed send so the next tick retries. */
async function release(db: D1Database, col: string, id: number, date: string, previous: string | null): Promise<void> {
  await db.prepare(`UPDATE push_subscriptions SET ${col} = ? WHERE id = ? AND ${col} = ?`).bind(previous, id, date).run()
}
