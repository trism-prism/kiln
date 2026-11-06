import { runCron, seedSentDate } from './cron'
import { isPushEndpoint, parsePing, parseSubscription } from './validate'

export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS: string
  VAPID_PUBLIC_KEY: string
  VAPID_SUBJECT: string
  VAPID_PRIVATE_KEY: string
}

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

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'content-type must be application/json')
  }
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY) throw new HttpError(413, 'body too large')
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'body too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url
  const m = req.method

  if (pathname === '/health' && m === 'GET') return json({ ok: true }, 200)

  if (pathname === '/push/subscription' && m === 'POST') {
    const s = parseSubscription(await readJson(req))
    if (typeof s === 'string') throw new HttpError(400, s)
    const now = new Date()
    const iso = now.toISOString()
    await env.DB.prepare(
      `INSERT INTO push_subscriptions
         (endpoint, p256dh, auth, reminder_time, nudge_time, timezone, last_reminder_date, last_nudge_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh, auth = excluded.auth, reminder_time = excluded.reminder_time,
         nudge_time = excluded.nudge_time, timezone = excluded.timezone,
         last_reminder_date = excluded.last_reminder_date, last_nudge_date = excluded.last_nudge_date,
         updated_at = excluded.updated_at`,
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
        iso,
        iso,
      )
      .run()
    return new Response(null, { status: 204 })
  }

  if (pathname === '/push/subscription' && m === 'DELETE') {
    const b = await readJson(req)
    const endpoint = (b as { endpoint?: unknown } | null)?.endpoint
    if (!isPushEndpoint(endpoint)) throw new HttpError(400, 'endpoint must be an https URL of a known push service')
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run()
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
