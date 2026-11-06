// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newDb } from '../data/test-db'
import { getMeta } from './meta'
import { availability, subscriptionBody, type PushEnv } from './push-client'

const times = { reminderTime: '08:00', nudgeEnabled: true, nudgeTime: '20:30' }
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'PKEY', auth: 'AKEY' } }

describe('subscriptionBody', () => {
  it('builds the exact body the Worker validates', () => {
    expect(subscriptionBody(sub, times, 'tok_1234567890abcdef', 'Europe/Berlin')).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'PKEY',
      auth: 'AKEY',
      reminderTime: '08:00',
      nudgeTime: '20:30',
      timezone: 'Europe/Berlin',
      token: 'tok_1234567890abcdef',
    })
  })

  it('sends a null nudge time while the nudge is off', () => {
    expect(subscriptionBody(sub, { ...times, nudgeEnabled: false }, 't', 'UTC').nudgeTime).toBeNull()
  })
})

describe('availability', () => {
  const ready: PushEnv = {
    hasServiceWorker: true,
    hasPush: true,
    hasNotification: true,
    ios: false,
    standalone: false,
    apiUrl: 'https://api.test',
    vapidKey: 'key',
    permission: 'default',
  }

  it('is ready when everything is there', () => {
    expect(availability(ready)).toBe('ready')
    expect(availability({ ...ready, permission: 'granted' })).toBe('ready')
  })

  it('names each reason it is not', () => {
    expect(availability({ ...ready, hasPush: false })).toBe('unsupported')
    expect(availability({ ...ready, hasNotification: false })).toBe('unsupported')
    expect(availability({ ...ready, hasServiceWorker: false })).toBe('unsupported')
    expect(availability({ ...ready, ios: true, standalone: false })).toBe('needs-install')
    expect(availability({ ...ready, ios: true, standalone: true })).toBe('ready')
    expect(availability({ ...ready, apiUrl: '' })).toBe('not-configured')
    expect(availability({ ...ready, vapidKey: '' })).toBe('not-configured')
    expect(availability({ ...ready, permission: 'denied' })).toBe('denied')
  })

  it('asks iPhone users to install before anything else', () => {
    expect(availability({ ...ready, ios: true, hasPush: false, apiUrl: '' })).toBe('needs-install')
  })
})

// The client with a configured server and a stand-in browser.
describe('turning reminders on and off', () => {
  const vapid = btoa(String.fromCharCode(4, ...new Uint8Array(64))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const calls: string[] = []
  let current: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null
  let permission: string
  let counter: number
  const subscribe = vi.fn()

  const makeSub = () => {
    counter++
    return {
      endpoint: `https://fcm.googleapis.com/fcm/send/${counter}`,
      toJSON: () => ({ keys: { p256dh: 'PKEY', auth: 'AKEY' } }),
      unsubscribe: vi.fn(async () => {
        calls.push('unsubscribe')
        current = null
        return true
      }),
    }
  }

  beforeEach(() => {
    calls.length = 0
    counter = 0
    current = null
    permission = 'granted'
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', 'https://api.test/')
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapid)
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(async () => {
        calls.push('permission')
        return permission
      }),
    })
    Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true })
    subscribe.mockImplementation(async () => (current = makeSub()))
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => current, subscribe } }) },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    subscribe.mockReset()
  })

  const fetchWith = (status: number | 'network' | number[]) => {
    const queue = Array.isArray(status) ? [...status] : null
    return vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`)
      const s = queue ? queue.shift()! : (status as number | 'network')
      if (s === 'network') throw new TypeError('Failed to fetch')
      return new Response(null, { status: s })
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  }

  it('asks permission first, subscribes, posts the body and remembers the token', async () => {
    const { enablePush, isPushOn } = await import('./push-client')
    const db = newDb()
    const f = fetchWith(204)
    expect(await enablePush(db, times, f)).toEqual({ ok: true })
    expect(calls[0]).toBe('permission')
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/push/subscription')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    const token = await getMeta(db, 'pushToken')
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
    expect(body).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'PKEY', auth: 'AKEY', reminderTime: '08:00', nudgeTime: '20:30', token })
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(await isPushOn(db)).toBe(true)
  })

  it('stops with a clear message when permission is denied', async () => {
    permission = 'denied'
    const { enablePush, isPushOn } = await import('./push-client')
    const db = newDb()
    const f = fetchWith(204)
    const r = await enablePush(db, times, f)
    expect(r).toMatchObject({ ok: false, reason: 'denied' })
    expect(f).not.toHaveBeenCalled()
    expect(await isPushOn(db)).toBe(false)
  })

  it('reports a network error and stays off, so the button can be pressed again', async () => {
    const { enablePush, isPushOn } = await import('./push-client')
    const db = newDb()
    const r = await enablePush(db, times, fetchWith('network'))
    expect(r).toMatchObject({ ok: false, reason: 'network' })
    expect(await isPushOn(db)).toBe(false)
    expect(await enablePush(db, times, fetchWith(204))).toEqual({ ok: true })
  })

  it('starts over with a new subscription when the server has the old one under another token', async () => {
    const { enablePush } = await import('./push-client')
    const db = newDb()
    const f = fetchWith([403, 204])
    expect(await enablePush(db, times, f)).toEqual({ ok: true })
    expect(calls).toContain('unsubscribe')
    expect(counter).toBe(2)
  })

  it('re-sends only when the times changed, and does nothing while off', async () => {
    const { enablePush, syncPush } = await import('./push-client')
    const db = newDb()
    expect(await syncPush(db, times, fetchWith(204))).toBe('skipped')
    await enablePush(db, times, fetchWith(204))
    expect(await syncPush(db, times, fetchWith(204))).toBe('skipped')
    const f = fetchWith(204)
    expect(await syncPush(db, { ...times, reminderTime: '07:15' }, f)).toEqual({ ok: true })
    expect(JSON.parse(((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({ reminderTime: '07:15' })
    expect(await syncPush(db, { ...times, reminderTime: '07:15' }, fetchWith(204))).toBe('skipped')
    expect(await syncPush(db, { ...times, reminderTime: '06:00' }, fetchWith('network'))).toMatchObject({ ok: false, reason: 'network' })
  })

  it('turning off deletes the server entry with the token, then unsubscribes', async () => {
    const { enablePush, disablePush, isPushOn } = await import('./push-client')
    const db = newDb()
    await enablePush(db, times, fetchWith(204))
    const token = await getMeta(db, 'pushToken')
    const f = fetchWith(204)
    expect(await disablePush(db, f)).toEqual({ serverNotified: true })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/push/subscription')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', token })
    expect(await isPushOn(db)).toBe(false)
    expect(current).toBeNull()
  })

  it('turns off locally even when the server cannot be reached', async () => {
    const { enablePush, disablePush, isPushOn } = await import('./push-client')
    const db = newDb()
    await enablePush(db, times, fetchWith(204))
    expect(await disablePush(db, fetchWith('network'))).toEqual({ serverNotified: false })
    expect(await isPushOn(db)).toBe(false)
  })
})
