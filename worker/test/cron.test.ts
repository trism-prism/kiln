import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { dueKinds, localNow, MAX_SENDS, runCron, seedSentDate, type SubRow } from '../src/cron'
import worker from '../src/index'
import { decryptPush, ENDPOINT, makeSubscription, makeVapid } from './helpers'

const sub = (over: Partial<SubRow> = {}): SubRow => ({
  id: 1,
  endpoint: ENDPOINT,
  p256dh: '',
  auth: '',
  reminder_time: '08:00',
  nudge_time: null,
  timezone: 'UTC',
  last_reminder_date: null,
  last_nudge_date: null,
  ...over,
})
const at = (iso: string) => new Date(iso)
const kinds = (s: SubRow, now: Date) => dueKinds(s, now).map((d) => d.kind)

describe('localNow', () => {
  it('reads date and time in the zone', () => {
    expect(localNow(at('2026-11-05T20:00:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-11-06', time: '01:30' })
    expect(localNow(at('2026-11-05T00:00:00Z'), 'UTC')).toEqual({ date: '2026-11-05', time: '00:00' })
  })
})

describe('dueKinds', () => {
  it('Asia/Kolkata half-hour offset: 08:00 local is 02:30Z', () => {
    const s = sub({ timezone: 'Asia/Kolkata' })
    expect(kinds(s, at('2026-11-05T02:15:00Z'))).toEqual([])
    expect(kinds(s, at('2026-11-05T02:30:00Z'))).toEqual(['reminder'])
  })

  it('same instant is due in one zone and not another', () => {
    const now = at('2026-11-05T13:00:00Z') // 08:00 EST, 18:30 IST
    expect(kinds(sub({ timezone: 'America/New_York' }), now)).toEqual(['reminder'])
    expect(kinds(sub({ timezone: 'Asia/Kolkata', reminder_time: '19:00' }), now)).toEqual([])
  })

  it('US spring forward (2027-03-14): a nonexistent 02:30 fires once the clock reaches 03:00', () => {
    const s = sub({ timezone: 'America/New_York', reminder_time: '02:30' })
    expect(kinds(s, at('2027-03-14T06:45:00Z'))).toEqual([]) // 01:45 EST
    expect(kinds(s, at('2027-03-14T07:00:00Z'))).toEqual(['reminder']) // 03:00 EDT
  })

  it('US fall back (2026-11-01): 08:00 EST arrives at 13:00Z, not 12:00Z', () => {
    const s = sub({ timezone: 'America/New_York' })
    expect(kinds(s, at('2026-11-01T12:00:00Z'))).toEqual([]) // 07:00 EST
    expect(kinds(s, at('2026-11-01T13:00:00Z'))).toEqual(['reminder'])
  })

  it('nudge only when nudge_time is set, and independently of the reminder', () => {
    const now = at('2026-11-05T20:05:00Z')
    expect(kinds(sub({ reminder_time: '08:00', last_reminder_date: '2026-11-05' }), now)).toEqual([])
    expect(
      kinds(sub({ reminder_time: '08:00', last_reminder_date: '2026-11-05', nudge_time: '20:00' }), now),
    ).toEqual(['nudge'])
  })

  it('skips kinds already sent on this local date, and ones more than the window late', () => {
    expect(kinds(sub({ last_reminder_date: '2026-11-05' }), at('2026-11-05T08:15:00Z'))).toEqual([])
    expect(kinds(sub({ last_reminder_date: '2026-11-04' }), at('2026-11-05T08:15:00Z'))).toEqual(['reminder'])
    expect(kinds(sub(), at('2026-11-05T10:00:00Z'))).toEqual([])
  })

  it('midnight wrap: 23:50 is not due at 23:45, is due at 00:00 for the previous local date', () => {
    const s = sub({ reminder_time: '23:50' })
    expect(dueKinds(s, at('2026-11-05T23:45:00Z'))).toEqual([])
    expect(dueKinds(s, at('2026-11-06T00:00:00Z'))).toEqual([{ kind: 'reminder', date: '2026-11-05' }])
    expect(dueKinds(sub({ ...s, last_reminder_date: '2026-11-05' }), at('2026-11-06T00:00:00Z'))).toEqual([])
  })

  it('seedSentDate marks a time already passed today', () => {
    expect(seedSentDate('23:50', at('2026-11-06T00:10:00Z'), 'UTC')).toBe('2026-11-05')
    expect(seedSentDate('08:00', at('2026-11-05T09:00:00Z'), 'UTC')).toBe('2026-11-05')
    expect(seedSentDate('08:00', at('2026-11-05T07:00:00Z'), 'UTC')).toBeNull()
    expect(seedSentDate(null, at('2026-11-05T09:00:00Z'), 'UTC')).toBeNull()
  })
})

async function insert(over: Partial<SubRow> & { endpoint?: string } = {}) {
  const k = await makeSubscription()
  const s = sub({ p256dh: k.p256dh, auth: k.auth, ...over })
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, reminder_time, nudge_time, timezone, last_reminder_date, last_nudge_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'x', 'x')`,
  )
    .bind(s.endpoint, s.p256dh, s.auth, s.reminder_time, s.nudge_time, s.timezone, s.last_reminder_date, s.last_nudge_date)
    .run()
  return k
}
const row = () => env.DB.prepare('SELECT * FROM push_subscriptions').first<SubRow>()
const fetchWith = (status: number) => vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('runCron', () => {
  it('sends the reminder payload, marks the date after 2xx and does not double send', async () => {
    const vapid = await makeVapid()
    const k = await insert({ reminder_time: '08:00', nudge_time: '20:00' })
    const f = fetchWith(201)
    const now = at('2026-11-05T08:00:00Z')

    expect(await runCron(env.DB, vapid, now, f)).toEqual({ sent: 1, removed: 0, failed: 0 })
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(await decryptPush(init.body as Uint8Array, k))).toEqual({ kind: 'reminder' })
    expect((await row())!.last_reminder_date).toBe('2026-11-05')
    expect((await row())!.last_nudge_date).toBeNull()

    await runCron(env.DB, vapid, at('2026-11-05T08:15:00Z'), f)
    expect(f).toHaveBeenCalledTimes(1)

    // nudge fires later the same day, as its own push
    expect(await runCron(env.DB, vapid, at('2026-11-05T20:00:00Z'), f)).toMatchObject({ sent: 1 })
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(await decryptPush(init2.body as Uint8Array, k))).toEqual({ kind: 'nudge' })
    await runCron(env.DB, vapid, at('2026-11-05T20:15:00Z'), f)
    expect(f).toHaveBeenCalledTimes(2)

    // next day sends again
    await runCron(env.DB, vapid, at('2026-11-06T08:00:00Z'), f)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('midnight wrap: reminder 23:50 with ticks at 23:45 and 00:00 fires exactly once, on the right date', async () => {
    const f = fetchWith(201)
    const vapid = await makeVapid()
    await insert({ reminder_time: '23:50' })
    await runCron(env.DB, vapid, at('2026-11-05T23:45:00Z'), f)
    expect(f).not.toHaveBeenCalled()
    await runCron(env.DB, vapid, at('2026-11-06T00:00:00Z'), f)
    await runCron(env.DB, vapid, at('2026-11-06T00:15:00Z'), f)
    expect(f).toHaveBeenCalledTimes(1)
    expect((await row())!.last_reminder_date).toBe('2026-11-05')
  })

  it('midnight wrap: a send at 23:55 is not repeated at 00:05', async () => {
    const f = fetchWith(201)
    const vapid = await makeVapid()
    await insert({ reminder_time: '23:50' })
    await runCron(env.DB, vapid, at('2026-11-05T23:55:00Z'), f)
    await runCron(env.DB, vapid, at('2026-11-06T00:05:00Z'), f)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('overlapping runs send once (the claim is atomic)', async () => {
    const f = fetchWith(201)
    const vapid = await makeVapid()
    await insert()
    await Promise.all([
      runCron(env.DB, vapid, at('2026-11-05T08:00:00Z'), f),
      runCron(env.DB, vapid, at('2026-11-05T08:00:00Z'), f),
    ])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('one failing subscription does not abort the tick, and its claim is released', async () => {
    const f = fetchWith(201)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await insert({ endpoint: 'https://fcm.googleapis.com/fcm/send/bad', p256dh: 'AAAA' })
    await insert({ endpoint: 'https://fcm.googleapis.com/fcm/send/good' })
    expect(await runCron(env.DB, await makeVapid(), at('2026-11-05T08:00:00Z'), f)).toEqual({ sent: 1, removed: 0, failed: 1 })
    const bad = await env.DB.prepare("SELECT * FROM push_subscriptions WHERE endpoint LIKE '%/bad'").first<SubRow>()
    expect(bad!.last_reminder_date).toBeNull()
    err.mockRestore()
  })

  it('failures rotate to the back of the queue', async () => {
    const urls: string[] = []
    const f = vi.fn(async (u: string) => (urls.push(u), new Response(null, { status: 503 }))) as unknown as typeof fetch
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const vapid = await makeVapid()
    for (let i = 1; i <= MAX_SENDS + 1; i++) await insert({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}` })
    await runCron(env.DB, vapid, at('2026-11-05T08:00:00Z'), f)
    expect(urls).toHaveLength(MAX_SENDS)
    expect(urls).not.toContain(`https://fcm.googleapis.com/fcm/send/${MAX_SENDS + 1}`)
    urls.length = 0
    await runCron(env.DB, vapid, at('2026-11-05T08:15:00Z'), f)
    expect(urls[0]).toBe(`https://fcm.googleapis.com/fcm/send/${MAX_SENDS + 1}`)
    err.mockRestore()
  })

  it('does not send a nudge when nudge_time is null', async () => {
    const f = fetchWith(201)
    await insert({ last_reminder_date: '2026-11-05' })
    await runCron(env.DB, await makeVapid(), at('2026-11-05T20:00:00Z'), f)
    expect(f).not.toHaveBeenCalled()
  })

  it('fall back day: the repeated 01:30 does not send twice', async () => {
    const f = fetchWith(201)
    const vapid = await makeVapid()
    await insert({ timezone: 'America/New_York', reminder_time: '01:30' })
    await runCron(env.DB, vapid, at('2026-11-01T05:30:00Z'), f) // 01:30 EDT
    await runCron(env.DB, vapid, at('2026-11-01T06:30:00Z'), f) // 01:30 EST
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('deletes the subscription on 404 and 410', async () => {
    for (const status of [404, 410]) {
      await insert()
      const r = await runCron(env.DB, await makeVapid(), at('2026-11-05T08:00:00Z'), fetchWith(status))
      expect(r).toEqual({ sent: 0, removed: 1, failed: 0 })
      expect(await row()).toBeNull()
    }
  })

  it('keeps the subscription and does not mark sent on 5xx, then retries on the next run', async () => {
    const vapid = await makeVapid()
    await insert()
    expect(await runCron(env.DB, vapid, at('2026-11-05T08:00:00Z'), fetchWith(503))).toEqual({ sent: 0, removed: 0, failed: 1 })
    expect((await row())!.last_reminder_date).toBeNull()
    expect(await runCron(env.DB, vapid, at('2026-11-05T08:15:00Z'), fetchWith(201))).toMatchObject({ sent: 1 })
  })

  it('counts a thrown fetch as failed and carries on', async () => {
    await insert()
    const f = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runCron(env.DB, await makeVapid(), at('2026-11-05T08:00:00Z'), f)).toMatchObject({ failed: 1 })
    err.mockRestore()
  })

  it(`sends at most ${MAX_SENDS} per run`, async () => {
    const f = fetchWith(201)
    for (let i = 0; i < MAX_SENDS + 3; i++) await insert({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}` })
    await runCron(env.DB, await makeVapid(), at('2026-11-05T08:00:00Z'), f)
    expect(f).toHaveBeenCalledTimes(MAX_SENDS)
  })
})

describe('scheduled handler', () => {
  it('runs without throwing on an empty table', async () => {
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughException() {} } as unknown as ExecutionContext
    await worker.scheduled({} as ScheduledController, env, ctx)
    await Promise.all(waits)
  })
})
