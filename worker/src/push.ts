// Minimal Web Push for Workers: VAPID (RFC 8292, ES256 JWT) and aes128gcm payload encryption (RFC 8291).
import { b64uDecode, b64uEncode } from './b64'

const enc = new TextEncoder()

export interface VapidKeys {
  publicKey: string // base64url, 65-byte uncompressed point
  privateKey: string // base64url, 32-byte scalar (the JWK "d")
  subject: string // mailto: or https: URL
}

async function importSigningKey(k: VapidKeys): Promise<CryptoKey> {
  const pub = b64uDecode(k.publicKey)
  if (!pub || pub.length !== 65 || pub[0] !== 4) throw new Error('bad VAPID public key')
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33)), d: k.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/** Signed VAPID JWT for the push service origin. WebCrypto's ECDSA output is already the raw r||s JWT wants. */
export async function vapidJwt(k: VapidKeys, audience: string, nowSec: number): Promise<string> {
  const part = (o: object) => b64uEncode(enc.encode(JSON.stringify(o)))
  const input = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: audience, exp: nowSec + 12 * 3600, sub: k.subject })}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importSigningKey(k),
    enc.encode(input),
  )
  return `${input}.${b64uEncode(new Uint8Array(sig))}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** RFC 8291 aes128gcm body for one record. `p256dh` and `auth` are the subscription's base64url keys. */
export async function encryptPayload(p256dh: string, auth: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64uDecode(p256dh)
  const authSecret = b64uDecode(auth)
  if (!uaPublic || uaPublic.length !== 65 || !authSecret || authSecret.length !== 16) throw new Error('bad subscription keys')

  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as SubtleCryptoDeriveKeyAlgorithm, eph.privateKey, 256),
  )

  const prk = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12)

  const record = concat(plaintext, new Uint8Array([2])) // 0x02 = last record delimiter
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/** Sends one encrypted push. Returns the push service's HTTP status. */
export async function sendPush(
  k: VapidKeys,
  sub: PushTarget,
  payload: object,
  nowSec: number,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const jwt = await vapidJwt(k, new URL(sub.endpoint).origin, nowSec)
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(payload)))
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${k.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'normal',
    },
    body,
  })
  await res.body?.cancel()
  return res.status
}
