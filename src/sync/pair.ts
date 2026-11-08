// Pairing with a 6-digit code: CPace (ristretto255, draft-irtf-cfrg-cpace) over the server's relay.
// The code is `SS PPPP`: SS is a slot the server hands out, PPPP is the password and never leaves the
// two devices. The host sends the sync key encrypted under the key the two devices derive. No React.
// See README.md. The server routes are in worker/src/pair.ts.
import { b64uDecode, b64uEncode, KEY_BYTES } from './crypto'

/** Where to reach the server (same shape as the sync engine's). */
export interface PairNet {
  fetch: typeof fetch
  baseUrl: string
}

const DSI = 'kiln/pair/v1'
const ISK_DSI = 'CPaceRistretto255_ISK'
const CONFIRM_INFO = 'kiln/pair/confirm'
const BOX_INFO = 'kiln/pair/box'
const MAX_WRONG = 3
const POLL_MS = 2000
/** Longest a pairing is followed: the code's 180 seconds plus the grace the server keeps after a reply. */
const GIVE_UP_MS = 245_000
/** Failed polls in a row (offline, server down) before giving up. */
const MAX_POLL_FAILURES = 5

const enc = new TextEncoder()

// ---- building blocks (exported for the tests that check them against the CPace draft's vectors) ----

/** LEB128 length followed by the bytes (the draft's prepend_len). */
export function lv(...parts: (Uint8Array | string)[]): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  for (const p of parts) {
    const b = typeof p === 'string' ? enc.encode(p) : p
    const len: number[] = []
    let n = b.length
    do {
      len.push(n > 0x7f ? (n & 0x7f) | 0x80 : n)
      n = Math.floor(n / 128)
    } while (n > 0)
    chunks.push(Uint8Array.from(len), b)
  }
  return concat(...chunks)
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export const sha512 = async (data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-512', data as BufferSource))

async function curve() {
  const m = await import('@noble/curves/ed25519.js')
  return { Point: m.ristretto255.Point, derive: m.ristretto255_hasher.deriveToCurve! }
}

/** The generator of a pairing: the ristretto255 element derived from SHA-512 of the generator string. */
export async function generatorFromString(genStr: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const { derive } = await curve()
  return new Uint8Array(derive(await sha512(genStr)).toBytes())
}

/** This app's generator string: lv(DSI) || lv(PPPP) || lv(sid). */
export const generatorString = (pppp: string, sid: Uint8Array) => lv(DSI, pppp, sid)

/** A random scalar: 32 random bytes with the top 4 bits cleared (the draft's sample_scalar), never zero. */
export function sampleScalar(): Uint8Array<ArrayBuffer> {
  for (;;) {
    const s = crypto.getRandomValues(new Uint8Array(32))
    s[31]! &= 0x0f
    if (s.some((b) => b !== 0)) return s
  }
}

const scalarToBigint = (s: Uint8Array) => s.reduce((n, b, i) => n | (BigInt(b) << BigInt(8 * i)), 0n)

/** y * element, both as bytes. Returns null when `element` is not a valid encoding or the result is the identity. */
export async function scalarMultVfy(y: Uint8Array, element: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  const { Point } = await curve()
  try {
    const r = Point.fromBytes(element).multiply(scalarToBigint(y))
    return r.is0() ? null : new Uint8Array(r.toBytes())
  } catch {
    return null
  }
}

/** The pairing's shared secret from CPace: SHA-512(lv(DSI_ISK) || lv(sid) || lv(K) || transcript). */
export const iskFrom = (sid: Uint8Array, K: Uint8Array, transcript: Uint8Array) => sha512(concat(lv(ISK_DSI, sid, K), transcript))

async function hkdf(ikm: Uint8Array, info: string): Promise<ArrayBuffer> {
  const root = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, root, 256)
}

export interface PairKeys {
  confirmKey: CryptoKey
  boxKey: CryptoKey
}

/** The two keys derived from the ISK: one to confirm the code matched, one to lock the sync key. */
export async function pairKeys(isk: Uint8Array): Promise<PairKeys> {
  const [confirm, box] = await Promise.all([hkdf(isk, CONFIRM_INFO), hkdf(isk, BOX_INFO)])
  return {
    confirmKey: await crypto.subtle.importKey('raw', confirm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
    boxKey: await crypto.subtle.importKey('raw', box, 'AES-GCM', false, ['encrypt', 'decrypt']),
  }
}

/** The guest's proof that it derived the same secret: HMAC(confirmKey, "B" || Ya || Yb). */
export async function confirmTag(k: PairKeys, Ya: Uint8Array, Yb: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', k.confirmKey, concat(enc.encode('B'), Ya, Yb)))
}

/** Constant-time check of a tag (WebCrypto verify). */
export const tagMatches = (k: PairKeys, Ya: Uint8Array, Yb: Uint8Array, tag: Uint8Array) =>
  crypto.subtle.verify('HMAC', k.confirmKey, tag as BufferSource, concat(enc.encode('B'), Ya, Yb))

/** Locks the sync key for the guest: IV (12 bytes) || AES-GCM(key) with the session id as AAD. 60 bytes. */
export async function sealKey(k: PairKeys, sid: Uint8Array, syncKey: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: sid as BufferSource }, k.boxKey, syncKey as BufferSource)
  return concat(iv, new Uint8Array(ct))
}

/** Opens `sealKey`'s output. Throws if the secret differs or anything was changed. */
export async function openKey(k: PairKeys, sid: Uint8Array, box: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (box.length !== 12 + KEY_BYTES + 16) throw new Error('bad box')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: box.slice(0, 12), additionalData: sid as BufferSource },
    k.boxKey,
    box.slice(12),
  )
  return new Uint8Array(plain)
}

// ---- the code ----

/** 4 random digits, uniform (bytes of 250 and above are skipped). */
export function randomPassword(): string {
  let out = ''
  while (out.length < 4) for (const b of crypto.getRandomValues(new Uint8Array(8))) if (b < 250 && out.length < 4) out += String(b % 10)
  return out
}

/** `074821` shown as `074 821`. */
export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

/** Keeps the digits of what was typed (spaces and dashes are fine), at most 6. */
export const cleanCode = (text: string) => text.replace(/\D/g, '').slice(0, 6)

// ---- talking to the relay ----

interface Reply {
  status: number
  data: Record<string, unknown>
}

async function post(net: PairNet, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Reply | 'network'> {
  try {
    const res = await net.fetch(net.baseUrl.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, data: data && typeof data === 'object' ? data : {} }
  } catch {
    return 'network'
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      clearTimeout(t)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done)
  })

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const rand32 = () => b64uEncode(crypto.getRandomValues(new Uint8Array(32)))

// ---- host: shows the code ----

export type HostState =
  | { kind: 'code'; code: string; expiresAt: number }
  | { kind: 'wrong'; left: number }
  | { kind: 'connecting' }
  | { kind: 'done' }
  | { kind: 'expired' }
  | { kind: 'dead' }
  /** `full`: all codes are taken (503); `slow`: too many requests (429); `network`: no connection; `server`: anything else. */
  | { kind: 'error'; reason: 'full' | 'slow' | 'network' | 'server' }

export interface HostOptions {
  /** The 32-byte sync key to hand over. */
  key: Uint8Array
  net: PairNet
  /** Stops the pairing (the code just expires on the server). */
  signal: AbortSignal
  onState: (s: HostState) => void
  /** Called after the server accepted the sealed key and before `done`: where a new key is saved. */
  onDelivered?: () => Promise<void>
  pollMs?: number
}

/** Runs the host side until the key was handed over, the code died or `signal` aborts. Never throws. */
export async function hostPairing(o: HostOptions): Promise<void> {
  const { net, signal, onState } = o
  const poll = o.pollMs ?? POLL_MS
  const sid = crypto.getRandomValues(new Uint8Array(16))
  const sidText = b64uEncode(sid)
  const pppp = randomPassword()
  const hostToken = rand32()
  const ya = sampleScalar()
  const { Point } = await curve()
  const g = Point.fromBytes(await generatorFromString(generatorString(pppp, sid)))
  const Ya = new Uint8Array(g.multiply(scalarToBigint(ya)).toBytes())

  const started = await post(net, '/pair/start', { sid: sidText, hostToken, msgA: b64uEncode(Ya) }, signal)
  if (signal.aborted) return
  if (started === 'network') return onState({ kind: 'error', reason: 'network' })
  const slot = str(started.data.slot)
  if (started.status !== 201 || !slot) {
    return onState({ kind: 'error', reason: started.status === 503 ? 'full' : started.status === 429 ? 'slow' : 'server' })
  }
  const begun = Date.now()
  const expiresAt = begun + (num(started.data.expiresIn) ?? 180) * 1000
  onState({ kind: 'code', code: slot + pppp, expiresAt })

  let wrong = 0
  let failures = 0
  while (!signal.aborted) {
    await sleep(poll, signal)
    if (signal.aborted) return
    if (Date.now() - begun > GIVE_UP_MS) return onState({ kind: 'expired' })
    const r = await post(net, '/pair/poll', { sid: sidText, hostToken }, signal)
    if (signal.aborted) return
    if (r === 'network' || r.status >= 500 || r.status === 429) {
      if (++failures >= MAX_POLL_FAILURES) return onState({ kind: 'error', reason: r === 'network' ? 'network' : 'server' })
      continue
    }
    failures = 0
    if (r.status === 404) return onState({ kind: 'expired' })
    if (r.status !== 200) return onState({ kind: 'error', reason: 'server' })
    wrong = Math.max(wrong, num(r.data.wrong) ?? 0)
    if (r.data.state === 'done' || r.data.state === 'delivered') return onState({ kind: 'done' })
    if (r.data.state !== 'answer') {
      if (wrong >= MAX_WRONG) return onState({ kind: 'dead' })
      continue
    }

    onState({ kind: 'connecting' })
    const msgB = b64uDecode(str(r.data.msgB) ?? '')
    const tagB = b64uDecode(str(r.data.tagB) ?? '')
    let box: string | null = null
    if (msgB && tagB) {
      const K = await scalarMultVfy(ya, msgB)
      if (K) {
        const keys = await pairKeys(await iskFrom(sid, K, concat(lv(Ya), lv(msgB))))
        if (await tagMatches(keys, Ya, msgB, tagB)) box = b64uEncode(await sealKey(keys, sid, o.key))
      }
    }
    const sent = await post(net, '/pair/reply', { sid: sidText, hostToken, box }, signal)
    if (signal.aborted) return
    if (sent === 'network' || sent.status >= 500) {
      // The answer is still waiting on the server: the next poll gives it to us again.
      if (++failures >= MAX_POLL_FAILURES) return onState({ kind: 'error', reason: sent === 'network' ? 'network' : 'server' })
      continue
    }
    if (sent.status === 404) return onState({ kind: 'expired' })
    if (sent.status !== 204) {
      // 409: no answer waiting any more (a repeated reply); look again.
      continue
    }
    if (box !== null) {
      await o.onDelivered?.()
      return onState({ kind: 'done' })
    }
    wrong++
    if (wrong >= MAX_WRONG) return onState({ kind: 'dead' })
    onState({ kind: 'wrong', left: MAX_WRONG - wrong })
  }
}

// ---- guest: types the code ----

export type JoinState =
  | { kind: 'waiting' }
  | { kind: 'wrong'; left: number }
  | { kind: 'done'; key: Uint8Array<ArrayBuffer> }
  /** The code is not valid, has expired or was used. */
  | { kind: 'expired' }
  /** Too many wrong tries: the code no longer works. */
  | { kind: 'dead' }
  /** Another device is answering this code right now. */
  | { kind: 'busy' }
  /** Too many requests from this device (429). */
  | { kind: 'slow' }
  | { kind: 'error'; reason: 'network' | 'server' }

export interface JoinOptions {
  /** The 6 digits (use `cleanCode`). */
  code: string
  net: PairNet
  signal: AbortSignal
  onState: (s: JoinState) => void
  pollMs?: number
}

/** One try with a code. Ends with `done` (the key), or a state that says why not. Never throws. */
export async function joinPairing(o: JoinOptions): Promise<void> {
  const { net, signal, onState } = o
  const poll = o.pollMs ?? POLL_MS
  if (!/^\d{6}$/.test(o.code)) return onState({ kind: 'expired' })
  onState({ kind: 'waiting' })
  const joined = await post(net, '/pair/join', { slot: o.code.slice(0, 2) }, signal)
  if (signal.aborted) return
  if (joined === 'network') return onState({ kind: 'error', reason: 'network' })
  if (joined.status === 404) return onState({ kind: 'expired' })
  if (joined.status === 429) return onState({ kind: 'slow' })
  const sidText = str(joined.data.sid)
  const sid = b64uDecode(sidText ?? '')
  const Ya = b64uDecode(str(joined.data.msgA) ?? '')
  if (joined.status !== 200 || !sidText || sid?.length !== 16 || Ya?.length !== 32) return onState({ kind: 'error', reason: 'server' })

  const { Point } = await curve()
  const g = Point.fromBytes(await generatorFromString(generatorString(o.code.slice(2), sid)))
  const yb = sampleScalar()
  const Yb = new Uint8Array(g.multiply(scalarToBigint(yb)).toBytes())
  const K = await scalarMultVfy(yb, Ya)
  if (!K) return onState({ kind: 'error', reason: 'server' })
  const keys = await pairKeys(await iskFrom(sid, K, concat(lv(Ya), lv(Yb))))
  const guestToken = rand32()
  const answered = await post(
    net,
    '/pair/answer',
    { sid: sidText, guestToken, msgB: b64uEncode(Yb), tagB: b64uEncode(await confirmTag(keys, Ya, Yb)) },
    signal,
  )
  if (signal.aborted) return
  if (answered === 'network') return onState({ kind: 'error', reason: 'network' })
  if (answered.status === 404) return onState({ kind: 'expired' })
  if (answered.status === 409) return onState({ kind: 'busy' })
  if (answered.status === 429) return onState({ kind: 'slow' })
  if (answered.status !== 202) return onState({ kind: 'error', reason: 'server' })

  const begun = Date.now()
  let failures = 0
  while (!signal.aborted) {
    await sleep(poll, signal)
    if (signal.aborted) return
    if (Date.now() - begun > GIVE_UP_MS) return onState({ kind: 'expired' })
    const r = await post(net, '/pair/fetch', { sid: sidText, guestToken }, signal)
    if (signal.aborted) return
    if (r === 'network' || r.status >= 500 || r.status === 429) {
      if (++failures >= MAX_POLL_FAILURES) return onState({ kind: 'error', reason: r === 'network' ? 'network' : 'server' })
      continue
    }
    failures = 0
    if (r.status === 404) return onState({ kind: 'expired' })
    // Another device took over the code after our answer was rejected.
    if (r.status === 403) return onState({ kind: 'busy' })
    if (r.status !== 200) return onState({ kind: 'error', reason: 'server' })
    const boxText = str(r.data.box)
    const box = boxText ? b64uDecode(boxText) : null
    if (box) {
      try {
        return onState({ kind: 'done', key: await openKey(keys, sid, box) })
      } catch {
        return onState({ kind: 'error', reason: 'server' })
      }
    }
    if (r.data.state === 'wrong') {
      const left = num(r.data.left) ?? 0
      return onState(left <= 0 ? { kind: 'dead' } : { kind: 'wrong', left })
    }
  }
}
