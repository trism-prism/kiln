import { runCron, seedSentDate } from './cron'
import { isPushEndpoint, isSecretString, parsePing, parseSubscription } from './validate'

export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS: string
  VAPID_PUBLIC_KEY: string
  VAPID_SUBJECT: string
  VAPID_PRIVATE_KEY: string
  /** Optional override of the subscription row cap. */
  MAX_SUBSCRIPTIONS?: string
}

const DEFAULT_MAX_SUBSCRIPTIONS = 50_000

const MAX_BODY = 4096

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(data: unknown, status: number, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers })
}

/** Reads the body with a byte counter, so a lying or missing Content-Length cannot get past the limit. */
async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'content-type must be application/json')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = req.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BODY) {
      await reader.cancel()
      throw new HttpError(413, 'body too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    bytes.set(c, o)
    o += c.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare (both are hex digests of equal length when they match). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url
  const m = req.method

  if (pathname === '/health' && m === 'GET') return json({ ok: true }, 200)

  if (pathname === '/push/subscription' && m === 'POST') {
    const s = parseSubscription(await readJson(req))
    if (typeof s === 'string') throw new HttpError(400, s)
    const tokenHash = await sha256Hex(s.token)
    const existing = await env.DB.prepare('SELECT token_hash FROM push_subscriptions WHERE endpoint = ?')
      .bind(s.endpoint)
      .first<{ token_hash: string }>()
    if (existing) {
      if (!safeEqual(existing.token_hash, tokenHash)) throw new HttpError(403, 'wrong token for this endpoint')
    } else {
      const cap = Number(env.MAX_SUBSCRIPTIONS ?? DEFAULT_MAX_SUBSCRIPTIONS)
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{ n: number }>()
      if ((n?.n ?? 0) >= cap) throw new HttpError(503, 'subscription capacity reached')
    }
    const now = new Date()
    const iso = now.toISOString()
    // Re-POST keeps last_*_date unless that kind's time (or the timezone) changed.
    const res = await env.DB.prepare(
      `INSERT INTO push_subscriptions
         (endpoint, p256dh, auth, reminder_time, nudge_time, timezone, last_reminder_date, last_nudge_date, token_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh, auth = excluded.auth,
         last_reminder_date = CASE WHEN push_subscriptions.reminder_time = excluded.reminder_time AND push_subscriptions.timezone = excluded.timezone
           THEN push_subscriptions.last_reminder_date ELSE excluded.last_reminder_date END,
         last_nudge_date = CASE WHEN push_subscriptions.nudge_time IS excluded.nudge_time AND push_subscriptions.timezone = excluded.timezone
           THEN push_subscriptions.last_nudge_date ELSE excluded.last_nudge_date END,
         reminder_time = excluded.reminder_time, nudge_time = excluded.nudge_time, timezone = excluded.timezone,
         updated_at = excluded.updated_at
       WHERE push_subscriptions.token_hash = excluded.token_hash`,
    )
      .bind(
        s.endpoint,
        s.p256dh,
        s.auth,
        s.reminderTime,
        s.nudgeTime,
        s.timezone,
        seedSentDate(s.reminderTime, now, s.timezone),
        seedSentDate(s.nudgeTime, now, s.timezone),
        tokenHash,
        iso,
        iso,
      )
      .run()
    if (res.meta.changes !== 1) throw new HttpError(403, 'wrong token for this endpoint')
    return new Response(null, { status: 204 })
  }

  if (pathname === '/push/subscription' && m === 'DELETE') {
    const b = (await readJson(req)) as { endpoint?: unknown; token?: unknown } | null
    if (!isPushEndpoint(b?.endpoint)) throw new HttpError(400, 'endpoint must be an https URL of a known push service')
    if (!isSecretString(b?.token)) throw new HttpError(400, 'token must be 16-128 chars of A-Z a-z 0-9 _ -')
    const row = await env.DB.prepare('SELECT token_hash FROM push_subscriptions WHERE endpoint = ?')
      .bind(b.endpoint)
      .first<{ token_hash: string }>()
    if (row) {
      const hash = await sha256Hex(b.token)
      if (!safeEqual(row.token_hash, hash)) throw new HttpError(403, 'wrong token for this endpoint')
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND token_hash = ?').bind(b.endpoint, hash).run()
    }
    return new Response(null, { status: 204 })
  }

  if (pathname === '/ping' && m === 'POST') {
    const id = parsePing(await readJson(req))
    if (!id) throw new HttpError(400, 'deviceId must be 16-128 chars of A-Z a-z 0-9 _ -')
    const day = new Date().toISOString().slice(0, 10)
    await env.DB.prepare('INSERT OR IGNORE INTO active_devices (device_hash, day) VALUES (?, ?)')
      .bind(await sha256Hex(id), day)
      .run()
    return new Response(null, { status: 204 })
  }

  if (['/health', '/push/subscription', '/ping'].includes(pathname)) throw new HttpError(405, 'method not allowed')
  throw new HttpError(404, 'not found')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    const cors: Record<string, string> = { Vary: 'Origin' }
    if (origin) {
      if (!allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403)
      cors['Access-Control-Allow-Origin'] = origin
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
    try {
      const res = await route(req, env, url)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
      console.error('unhandled', e instanceof Error ? e.message : e)
      return json({ error: 'internal error' }, 500, cors)
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCron(
        env.DB,
        { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT },
        new Date(),
      ).then((r) => console.log('cron', JSON.stringify(r))),
    )
  },
}
