import { b64uDecode } from './b64'

export interface SubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  reminderTime: string
  nudgeTime: string | null
  timezone: string
}

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

// Only real push services, so a client cannot make the cron POST to an arbitrary host.
const PUSH_HOST_SUFFIXES = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']

export function isPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2048) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false
  return PUSH_HOST_SUFFIXES.some((s) => u.hostname === s || u.hostname.endsWith('.' + s))
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function keyOfLength(v: unknown, bytes: number, first?: number): v is string {
  if (typeof v !== 'string' || v.length > 128) return false
  const d = b64uDecode(v)
  return !!d && d.length === bytes && (first === undefined || d[0] === first)
}

/** Strict parse of the POST /push/subscription body. Returns an error message or the value. */
export function parseSubscription(body: unknown): SubscriptionInput | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'body must be an object'
  const b = body as Record<string, unknown>
  const allowed = new Set(['endpoint', 'p256dh', 'auth', 'reminderTime', 'nudgeTime', 'timezone'])
  for (const k of Object.keys(b)) if (!allowed.has(k)) return `unknown field: ${k}`

  if (!isPushEndpoint(b.endpoint)) return 'endpoint must be an https URL of a known push service'
  if (!keyOfLength(b.p256dh, 65, 4)) return 'p256dh must be a base64url uncompressed P-256 key'
  if (!keyOfLength(b.auth, 16)) return 'auth must be 16 base64url bytes'
  if (typeof b.reminderTime !== 'string' || !HHMM.test(b.reminderTime)) return 'reminderTime must be HH:MM'
  const nudge = b.nudgeTime ?? null
  if (nudge !== null && (typeof nudge !== 'string' || !HHMM.test(nudge))) return 'nudgeTime must be HH:MM or null'
  if (!isTimeZone(b.timezone)) return 'timezone must be an IANA time zone'
  return {
    endpoint: b.endpoint,
    p256dh: b.p256dh as string,
    auth: b.auth as string,
    reminderTime: b.reminderTime,
    nudgeTime: nudge,
    timezone: b.timezone,
  }
}

const DEVICE_ID = /^[A-Za-z0-9_-]{16,128}$/

export function parsePing(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const id = (body as Record<string, unknown>).deviceId
  return typeof id === 'string' && DEVICE_ID.test(id) ? id : null
}
