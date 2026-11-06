import { env as baseEnv } from 'cloudflare:workers'
import { b64uDecode, b64uEncode } from '../src/b64'
import type { VapidKeys } from '../src/push'

export const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'

export async function makeVapid(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  return { publicKey: b64uEncode(pub), privateKey: jwk.d!, subject: 'mailto:test@example.com' }
}

/** A browser-side subscription: public values to register, private key to decrypt what the server sends. */
export async function makeSubscription() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const authBytes = crypto.getRandomValues(new Uint8Array(16))
  return { p256dh: b64uEncode(pub), auth: b64uEncode(authBytes), pub, authBytes, privateKey: pair.privateKey }
}

export async function makeEnv() {
  const v = await makeVapid()
  return { ...baseEnv, VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_KEY: v.privateKey, VAPID_SUBJECT: v.subject }
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: string | Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const i = typeof info === 'string' ? new TextEncoder().encode(info) : info
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: i }, key, bytes * 8))
}

/** Receiver side of RFC 8291, written independently of src/push.ts. */
export async function decryptPush(
  body: Uint8Array,
  sub: { pub: Uint8Array; authBytes: Uint8Array; privateKey: CryptoKey },
): Promise<string> {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  if (rs !== 4096 || idlen !== 65) throw new Error('bad header')

  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as SubtleCryptoDeriveKeyAlgorithm, sub.privateKey, 256),
  )
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...sub.pub, ...asPublic])
  const prk = await hkdf(sub.authBytes, shared, info, 32)
  const cek = await hkdf(salt, prk, 'Content-Encoding: aes128gcm\0', 16)
  const nonce = await hkdf(salt, prk, 'Content-Encoding: nonce\0', 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher))
  let end = plain.length
  while (end > 0 && plain[end - 1] === 0) end--
  if (plain[end - 1] !== 2) throw new Error('missing last-record delimiter')
  return new TextDecoder().decode(plain.slice(0, end - 1))
}

export { b64uDecode }
