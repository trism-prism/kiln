import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { newDb } from '../data/test-db'
import { getMeta } from './meta'
import { pingIfDue } from './ping'

const ok = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
const asFetch = (f: ReturnType<typeof ok>) => f

describe('pingIfDue', () => {
  it('sends one random device id, once per local day', async () => {
    const db = newDb()
    const f = ok()
    expect(await pingIfDue(db, asFetch(f), 'https://api.test', '2026-11-09')).toBe(true)
    expect(await pingIfDue(db, asFetch(f), 'https://api.test', '2026-11-09')).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('https://api.test/ping')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string) as Record<string, string>
    expect(Object.keys(body)).toEqual(['deviceId'])
    expect(body.deviceId).toMatch(/^[A-Za-z0-9_-]{16,128}$/)

    // The next day sends again, with the same id.
    expect(await pingIfDue(db, asFetch(f), 'https://api.test', '2026-11-10')).toBe(true)
    expect(JSON.parse(f.mock.calls[1]![1]?.body as string)).toEqual(body)
  })

  it('does nothing without a server address', async () => {
    const db = newDb()
    const f = ok()
    expect(await pingIfDue(db, asFetch(f), '', '2026-11-09')).toBe(false)
    expect(f).not.toHaveBeenCalled()
    expect(await getMeta(db, 'pingDeviceId')).toBeUndefined()
  })

  it('ignores failures and tries again on the next open', async () => {
    const db = newDb()
    const down = vi.fn(async () => {
      throw new TypeError('offline')
    })
    expect(await pingIfDue(db, down as unknown as typeof fetch, 'https://api.test', '2026-11-09')).toBe(false)
    const refused = vi.fn(async () => new Response(null, { status: 500 }))
    expect(await pingIfDue(db, refused as unknown as typeof fetch, 'https://api.test', '2026-11-09')).toBe(false)
    expect(await getMeta(db, 'pingDay')).toBeUndefined()
    expect(await pingIfDue(db, asFetch(ok()), 'https://api.test', '2026-11-09')).toBe(true)
  })

  it('shares one request between simultaneous calls', async () => {
    const db = newDb()
    const f = ok()
    await Promise.all([pingIfDue(db, asFetch(f), 'https://api.test', '2026-11-09'), pingIfDue(db, asFetch(f), 'https://api.test', '2026-11-09')])
    expect(f).toHaveBeenCalledTimes(1)
  })
})
