import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { ENDPOINT, makeSubscription } from './helpers'

const ORIGIN = 'http://localhost:5173'

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers } }
  if (body !== undefined) {
    ;(init.headers as Record<string, string>)['content-type'] ??= 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return worker.fetch(new Request(`https://kiln.test${path}`, init), env)
}

async function validBody(over: Record<string, unknown> = {}) {
  const s = await makeSubscription()
  return { endpoint: ENDPOINT, p256dh: s.p256dh, auth: s.auth, reminderTime: '08:00', nudgeTime: '20:00', timezone: 'America/New_York', ...over }
}

const rows = () => env.DB.prepare('SELECT * FROM push_subscriptions').all<Record<string, unknown>>().then((r) => r.results)

describe('GET /health', () => {
  it('returns ok', async () => {
    const r = await call('GET', '/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })
  it('404s unknown paths and 405s wrong methods with JSON errors', async () => {
    const a = await call('GET', '/nope')
    expect(a.status).toBe(404)
    expect(await a.json()).toHaveProperty('error')
    expect((await call('PUT', '/ping', {})).status).toBe(405)
  })
})

describe('CORS', () => {
  it('echoes an allowed origin and answers preflight', async () => {
    const r = await call('OPTIONS', '/ping', undefined, { origin: ORIGIN })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const h = await call('GET', '/health', undefined, { origin: ORIGIN })
    expect(h.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })
  it('rejects other origins', async () => {
    const r = await call('POST', '/ping', { deviceId: 'a'.repeat(20) }, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('POST /push/subscription', () => {
  it('stores a valid subscription and upserts by endpoint', async () => {
    expect((await call('POST', '/push/subscription', await validBody())).status).toBe(204)
    const second = await validBody({ reminderTime: '09:30', nudgeTime: null, timezone: 'Asia/Kolkata' })
    expect((await call('POST', '/push/subscription', second)).status).toBe(204)
    const r = await rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ endpoint: ENDPOINT, reminder_time: '09:30', nudge_time: null, timezone: 'Asia/Kolkata', p256dh: second.p256dh })
  })

  const bad: [string, (b: Record<string, unknown>) => Record<string, unknown>][] = [
    ['http endpoint', (b) => ({ ...b, endpoint: 'http://fcm.googleapis.com/x' })],
    ['unknown push host', (b) => ({ ...b, endpoint: 'https://evil.example/x' })],
    ['lookalike host', (b) => ({ ...b, endpoint: 'https://evilfcm.googleapis.com.evil.example/x' })],
    ['non-base64url p256dh', (b) => ({ ...b, p256dh: 'not base64url!!' })],
    ['short p256dh', (b) => ({ ...b, p256dh: 'AAAA' })],
    ['short auth', (b) => ({ ...b, auth: 'AAAA' })],
    ['bad reminder time', (b) => ({ ...b, reminderTime: '8:00' })],
    ['24:00', (b) => ({ ...b, reminderTime: '24:00' })],
    ['bad nudge time', (b) => ({ ...b, nudgeTime: '20:60' })],
    ['bad timezone', (b) => ({ ...b, timezone: 'Mars/Olympus' })],
    ['extra field', (b) => ({ ...b, extra: 1 })],
  ]
  it.each(bad)('400s on %s', async (_n, mutate) => {
    const r = await call('POST', '/push/subscription', mutate(await validBody()))
    expect(r.status).toBe(400)
    expect(await r.json()).toHaveProperty('error')
    expect(await rows()).toHaveLength(0)
  })

  it('400s on invalid JSON, 415 on wrong content type, 413 on large bodies', async () => {
    expect((await call('POST', '/push/subscription', '{nope')).status).toBe(400)
    expect((await call('POST', '/push/subscription', '{}', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await call('POST', '/push/subscription', 'x'.repeat(5000))).status).toBe(413)
  })

  it('does not fire at once when the reminder time already passed today', async () => {
    // 00:00 is always in the past (or equal) in any zone's current day.
    await call('POST', '/push/subscription', await validBody({ reminderTime: '00:00', nudgeTime: '23:59', timezone: 'UTC' }))
    const [r] = await rows()
    expect(r.last_reminder_date).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe('DELETE /push/subscription', () => {
  it('deletes by endpoint and is idempotent', async () => {
    await call('POST', '/push/subscription', await validBody())
    expect((await call('DELETE', '/push/subscription', { endpoint: ENDPOINT })).status).toBe(204)
    expect(await rows()).toHaveLength(0)
    expect((await call('DELETE', '/push/subscription', { endpoint: ENDPOINT })).status).toBe(204)
  })
  it('400s without a valid endpoint', async () => {
    expect((await call('DELETE', '/push/subscription', {})).status).toBe(400)
  })
})

describe('POST /ping', () => {
  const days = () => env.DB.prepare('SELECT * FROM active_devices').all<{ device_hash: string; day: string }>().then((r) => r.results)

  it('stores only a SHA-256 hash, once per device per day', async () => {
    const id = 'device-id-1234567890'
    expect((await call('POST', '/ping', { deviceId: id })).status).toBe(204)
    expect((await call('POST', '/ping', { deviceId: id })).status).toBe(204)
    expect((await call('POST', '/ping', { deviceId: 'another-device-0987654321' })).status).toBe(204)
    const r = await days()
    expect(r).toHaveLength(2)
    const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(r.map((x) => x.device_hash)).toContain(expected)
    expect(JSON.stringify(r)).not.toContain(id)
    expect(r[0].day).toBe(new Date().toISOString().slice(0, 10))
  })

  it('has no columns for IP or user agent', async () => {
    const cols = await env.DB.prepare('PRAGMA table_info(active_devices)').all<{ name: string }>()
    expect(cols.results.map((c) => c.name).sort()).toEqual(['day', 'device_hash'])
  })

  it('400s on malformed ids', async () => {
    expect((await call('POST', '/ping', { deviceId: 'short' })).status).toBe(400)
    expect((await call('POST', '/ping', { deviceId: 'has spaces and is long enough!' })).status).toBe(400)
    expect((await call('POST', '/ping', {})).status).toBe(400)
  })
})
