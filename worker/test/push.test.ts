import { describe, expect, it, vi } from 'vitest'
import { b64uDecode } from '../src/b64'
import { encryptPayload, sendPush, vapidJwt } from '../src/push'
import { decryptPush, ENDPOINT, makeSubscription, makeVapid } from './helpers'

describe('VAPID JWT', () => {
  it('has the ES256 structure and verifies with the public key', async () => {
    const keys = await makeVapid()
    const jwt = await vapidJwt(keys, 'https://fcm.googleapis.com', 1_800_000_000)
    const [h, p, s] = jwt.split('.')
    const dec = (x: string) => JSON.parse(new TextDecoder().decode(b64uDecode(x)!))
    expect(dec(h)).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(dec(p)).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:test@example.com' })
    const sig = b64uDecode(s)!
    expect(sig.length).toBe(64)

    const pub = await crypto.subtle.importKey(
      'raw',
      b64uDecode(keys.publicKey)!,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, new TextEncoder().encode(`${h}.${p}`))
    expect(ok).toBe(true)
    const tampered = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, new TextEncoder().encode(`${h}.x${p}`))
    expect(tampered).toBe(false)
  })
})

describe('payload encryption (RFC 8291)', () => {
  it('round-trips through an independent receiver', async () => {
    const sub = await makeSubscription()
    const body = await encryptPayload(sub.p256dh, sub.auth, new TextEncoder().encode('{"kind":"reminder"}'))
    expect(await decryptPush(body, sub)).toBe('{"kind":"reminder"}')
  })

  it('rejects malformed subscription keys', async () => {
    const sub = await makeSubscription()
    await expect(encryptPayload('AAAA', sub.auth, new Uint8Array([1]))).rejects.toThrow()
    await expect(encryptPayload(sub.p256dh, 'AAAA', new Uint8Array([1]))).rejects.toThrow()
  })

  it('sendPush posts the encrypted body with VAPID headers', async () => {
    const keys = await makeVapid()
    const sub = await makeSubscription()
    const f = vi.fn(async () => new Response(null, { status: 201 }))
    const status = await sendPush(keys, { endpoint: ENDPOINT, p256dh: sub.p256dh, auth: sub.auth }, { kind: 'nudge' }, 1_800_000_000, f as unknown as typeof fetch)
    expect(status).toBe(201)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    const h = init.headers as Record<string, string>
    expect(url).toBe(ENDPOINT)
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/)
    expect(h.Authorization.endsWith(`k=${keys.publicKey}`)).toBe(true)
    expect(await decryptPush(init.body as Uint8Array, sub)).toBe('{"kind":"nudge"}')
  })
})
