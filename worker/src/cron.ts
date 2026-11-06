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

/** Local date to record as "already sent" when the time has already passed today (so subscribing late does not fire at once). */
export function seedSentDate(time: string | null, now: Date, timeZone: string): string | null {
  if (!time) return null
  const l = localNow(now, timeZone)
  return minutes(l.time) >= minutes(time) ? l.date : null
}

/** Kinds due now: local time reached the set time (within the window) and not yet sent on this local date. */
export function dueKinds(s: SubRow, now: Date): Kind[] {
  const l = localNow(now, s.timezone)
  const out: Kind[] = []
  const check = (time: string | null, last: string | null, kind: Kind) => {
    if (!time || last === l.date) return
    const late = minutes(l.time) - minutes(time)
    if (late >= 0 && late < WINDOW_MIN) out.push(kind)
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
  const { results } = await db.prepare('SELECT * FROM push_subscriptions').all<SubRow>()
  const stats = { sent: 0, removed: 0, failed: 0 }
  let budget = MAX_SENDS
  for (const s of results) {
    for (const kind of dueKinds(s, now)) {
      if (budget-- <= 0) return stats
      let status: number
      try {
        status = await sendPush(vapid, s, { kind }, Math.floor(now.getTime() / 1000), fetchImpl)
      } catch (e) {
        console.error('push failed', s.id, e instanceof Error ? e.message : e)
        stats.failed++
        continue
      }
      if (status >= 200 && status < 300) {
        const col = kind === 'reminder' ? 'last_reminder_date' : 'last_nudge_date'
        await db
          .prepare(`UPDATE push_subscriptions SET ${col} = ? WHERE id = ?`)
          .bind(localNow(now, s.timezone).date, s.id)
          .run()
        stats.sent++
      } else if (status === 404 || status === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run()
        stats.removed++
        break
      } else {
        console.error('push rejected', s.id, status)
        stats.failed++
      }
    }
  }
  return stats
}
