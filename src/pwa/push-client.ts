// Push subscription client: ask for permission, subscribe, and keep the Worker's copy of the
// reminder times current. Contract: worker/README.md ("Push payload contract"). Nothing in here
// runs until the person presses "Turn on reminders" (permission needs a user gesture), except
// `syncPush`, which only re-sends times for a subscription that already exists.
import type { KilnDB, SettingsRecord } from '../data'
import { API_URL, VAPID_PUBLIC_KEY } from './env'
import { isIOS, isStandalone } from './install'
import { deleteMeta, getMeta, randomToken, setMeta } from './meta'

const META_ON = 'pushOn'
const META_TOKEN = 'pushToken'
const META_SENT = 'pushSent'

export type ReminderTimes = Pick<SettingsRecord, 'reminderTime' | 'nudgeEnabled' | 'nudgeTime'>

export interface SubscriptionBody {
  endpoint: string
  p256dh: string
  auth: string
  reminderTime: string
  nudgeTime: string | null
  timezone: string
  token: string
}

/** The JSON for `POST /push/subscription`. The nudge time is sent only while the nudge is on. */
export function subscriptionBody(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  times: ReminderTimes,
  token: string,
  timezone: string,
): SubscriptionBody {
  return {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    reminderTime: times.reminderTime,
    nudgeTime: times.nudgeEnabled ? times.nudgeTime : null,
    timezone,
    token,
  }
}

export interface PushEnv {
  hasServiceWorker: boolean
  hasPush: boolean
  hasNotification: boolean
  ios: boolean
  standalone: boolean
  apiUrl: string
  vapidKey: string
  permission: NotificationPermission | 'unavailable'
}

/** Why reminders can or cannot be turned on here. Checked in this order. */
export type PushAvailability = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'ready'

export function availability(env: PushEnv): PushAvailability {
  // iOS only has Web Push inside an installed app, so a plain Safari tab needs the install steps first.
  if (env.ios && !env.standalone) return 'needs-install'
  if (!env.hasServiceWorker || !env.hasPush || !env.hasNotification) return 'unsupported'
  if (env.apiUrl === '' || env.vapidKey === '') return 'not-configured'
  if (env.permission === 'denied') return 'denied'
  return 'ready'
}

export function readPushEnv(): PushEnv {
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPush: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    ios: isIOS(),
    standalone: isStandalone(),
    apiUrl: API_URL,
    vapidKey: VAPID_PUBLIC_KEY,
    permission: 'Notification' in window ? Notification.permission : 'unavailable',
  }
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export type PushFailure = 'denied' | 'unsupported' | 'network' | 'server'
export type PushResult = { ok: true } | { ok: false; reason: PushFailure; message: string }

const fail = (reason: PushFailure, message: string): PushResult => ({ ok: false, reason, message })

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

type SubJson = { endpoint: string; keys: { p256dh: string; auth: string } }
const toJson = (sub: PushSubscription): SubJson => {
  const j = sub.toJSON()
  return { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' } }
}

async function post(fetchImpl: typeof fetch, body: SubscriptionBody): Promise<{ status: number } | undefined> {
  try {
    const res = await fetchImpl(`${API_URL}/push/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status }
  } catch {
    return undefined
  }
}

/** True when this device has reminders on (a subscription the Worker knows about). */
export async function isPushOn(db: KilnDB): Promise<boolean> {
  return (await getMeta(db, META_ON)) === '1'
}

/**
 * Turns reminders on. Call it straight from a button press: the permission request must be the
 * first thing that happens so the browser still counts it as a user gesture.
 */
export async function enablePush(db: KilnDB, times: ReminderTimes, fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  const env = readPushEnv()
  const a = availability({ ...env, permission: env.permission === 'denied' ? 'denied' : 'default' })
  if (a !== 'ready') return fail('unsupported', 'Reminders are not available here.')
  const asked = await Notification.requestPermission()
  if (asked === 'default') return fail('denied', 'Permission was not given. Press the button again and choose Allow when asked.')
  if (asked !== 'granted') {
    return fail('denied', 'Notifications are blocked for Kiln. Allow them in your browser or device settings, then try again.')
  }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return fail('unsupported', 'The offline helper (service worker) is not running, so reminders cannot start. Use the installed or built app.')

  let token = await getMeta(db, META_TOKEN)
  if (!token) {
    token = randomToken()
    await setMeta(db, META_TOKEN, token)
  }
  const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await subscribe())
  } catch (e) {
    return fail('unsupported', `The browser refused to subscribe: ${e instanceof Error ? e.message : String(e)}`)
  }

  let body = subscriptionBody(toJson(sub), times, token, timezone())
  let res = await post(fetchImpl, body)
  if (res?.status === 403) {
    // The server has this endpoint under another token (for example after local data was erased): start over with a new subscription.
    await sub.unsubscribe()
    try {
      sub = await subscribe()
    } catch (e) {
      return fail('unsupported', `The browser refused to subscribe: ${e instanceof Error ? e.message : String(e)}`)
    }
    body = subscriptionBody(toJson(sub), times, token, timezone())
    res = await post(fetchImpl, body)
  }
  if (!res) return fail('network', 'Could not reach the Kiln server. Check your connection and try again.')
  if (res.status !== 204 && res.status !== 200) return fail('server', `The Kiln server answered ${res.status}. Try again later.`)

  await setMeta(db, META_ON, '1')
  await setMeta(db, META_SENT, JSON.stringify({ ...body, token: undefined }))
  return { ok: true }
}

/** Turns reminders off. The server entry is removed when reachable; otherwise it expires when the push service drops the subscription. */
export async function disablePush(db: KilnDB, fetchImpl: typeof fetch = fetch): Promise<{ serverNotified: boolean }> {
  let serverNotified = false
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const sub = await reg?.pushManager.getSubscription()
  const token = await getMeta(db, META_TOKEN)
  if (sub && token && API_URL !== '') {
    try {
      const res = await fetchImpl(`${API_URL}/push/subscription`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, token }),
      })
      serverNotified = res.ok
    } catch {
      // Offline: still turn it off here.
    }
  }
  await sub?.unsubscribe()
  await deleteMeta(db, META_ON)
  await deleteMeta(db, META_SENT)
  return { serverNotified }
}

/**
 * Re-sends the reminder times when they differ from what the Worker last accepted. Quietly does
 * nothing when reminders are off. Call after the times change and when the app opens.
 */
export async function syncPush(db: KilnDB, times: ReminderTimes, fetchImpl: typeof fetch = fetch): Promise<PushResult | 'skipped'> {
  if (!(await isPushOn(db)) || API_URL === '' || !('serviceWorker' in navigator)) return 'skipped'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  const token = await getMeta(db, META_TOKEN)
  if (!sub || !token) {
    await deleteMeta(db, META_ON) // the browser dropped the subscription: show the switch as off
    return 'skipped'
  }
  const body = subscriptionBody(toJson(sub), times, token, timezone())
  const key = JSON.stringify({ ...body, token: undefined })
  if ((await getMeta(db, META_SENT)) === key) return 'skipped'
  const res = await post(fetchImpl, body)
  if (!res) return fail('network', 'Could not reach the Kiln server, so the new time is not saved there yet.')
  if (res.status !== 204 && res.status !== 200) return fail('server', `The Kiln server answered ${res.status}.`)
  await setMeta(db, META_SENT, key)
  return { ok: true }
}
