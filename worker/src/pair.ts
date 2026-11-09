// Pairing relay for "join with a code". The two devices run CPace (a password-authenticated key
// exchange) with the 4 password digits of the code, which never reach this server; the server only
// passes their opaque messages along and counts wrong tries. See README.md and src/sync/README.md.
import { isCanonicalB64u } from './b64'
import { rateKey } from './feed'
import { HttpError, json, safeEqual, sha256Hex } from './http'
import { isId, object } from './sync'

export interface PairDeps {
  db: D1Database
  limiter: RateLimit | undefined
  /** The caller's IP, the rate-limit key. */
  clientKey: string
}

export const PAIR_OPS = ['start', 'join', 'answer', 'poll', 'reply', 'fetch'] as const
export type PairOp = (typeof PAIR_OPS)[number]

/** How long a code works. */
export const PAIR_TTL_MS = 180_000
/** A delivered key stays fetchable at least this long. */
const GRACE_MS = 60_000
const SLOTS = 100
const MAX_WRONG = 3

const isSid = (v: unknown): v is string => typeof v === 'string' && v.length === 22 && isCanonicalB64u(v, 16)
const isBox = (v: unknown): v is string => typeof v === 'string' && v.length === 80 && isCanonicalB64u(v, 60)

const sid = (v: unknown): string => {
  if (!isSid(v)) throw new HttpError(400, 'sid must be 16 base64url bytes')
  return v
}
const id32 = (v: unknown, name: string): string => {
  if (!isId(v)) throw new HttpError(400, `${name} must be 32 base64url bytes`)
  return v
}

interface Pairing {
  sid: string
  slot: string
  host_hash: string
  msg_a: string
  guest_hash: string | null
  msg_b: string | null
  tag_b: string | null
  wrong: number
  box: string | null
  fetched: number
  expires_at: number
}

const find = (db: D1Database, s: string) => db.prepare('SELECT * FROM sync_pairings WHERE sid = ?').bind(s).first<Pairing>()
const dead = (p: Pairing | null, now: number): boolean => !p || p.expires_at <= now || p.wrong >= MAX_WRONG || p.box !== null || p.fetched === 1
const gone = () => new HttpError(404, 'this code is not valid or has expired')

export async function handlePair(op: PairOp, body: unknown, deps: PairDeps): Promise<Response> {
  const now = Date.now()
  const { db } = deps
  if (op === 'start' || op === 'join' || op === 'answer') {
    // Fail closed: without the binding there is no rate limit, so these routes are off.
    if (!deps.limiter) throw new HttpError(503, 'pairing is not available')
    if (!(await deps.limiter.limit({ key: rateKey(deps.clientKey) })).success) throw new HttpError(429, 'too many tries, wait a minute')
  }

  if (op === 'start') {
    const b = object(body, ['sid', 'hostToken', 'msgA'])
    const s = sid(b.sid)
    const hostHash = await sha256Hex(id32(b.hostToken, 'hostToken'))
    const msgA = id32(b.msgA, 'msgA')
    await db.prepare('DELETE FROM sync_pairings WHERE expires_at <= ?').bind(now).run()
    if (await find(db, s)) throw new HttpError(409, 'sid is already in use')
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = new Set((await db.prepare('SELECT slot FROM sync_pairings').all<{ slot: string }>()).results.map((r) => r.slot))
      const free: string[] = []
      for (let i = 0; i < SLOTS; i++) if (!taken.has(String(i).padStart(2, '0'))) free.push(String(i).padStart(2, '0'))
      if (free.length === 0) break
      const slot = free[crypto.getRandomValues(new Uint32Array(1))[0]! % free.length]!
      // OR IGNORE: if another start took this slot since the read, try again.
      const r = await db
        .prepare('INSERT OR IGNORE INTO sync_pairings (sid, slot, host_hash, msg_a, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(s, slot, hostHash, msgA, now + PAIR_TTL_MS)
        .run()
      if (r.meta.changes === 1) return json({ slot, expiresIn: PAIR_TTL_MS / 1000 }, 201)
    }
    throw new HttpError(503, 'too many devices are pairing right now')
  }

  if (op === 'join') {
    const b = object(body, ['slot'])
    if (typeof b.slot !== 'string' || !/^\d{2}$/.test(b.slot)) throw new HttpError(400, 'slot must be two digits')
    const p = await db.prepare('SELECT * FROM sync_pairings WHERE slot = ?').bind(b.slot).first<Pairing>()
    if (dead(p, now)) throw gone()
    return json({ sid: p!.sid, msgA: p!.msg_a, expiresIn: Math.ceil((p!.expires_at - now) / 1000) }, 200)
  }

  if (op === 'answer') {
    const b = object(body, ['sid', 'guestToken', 'msgB', 'tagB'])
    const s = sid(b.sid)
    const guestHash = await sha256Hex(id32(b.guestToken, 'guestToken'))
    const msgB = id32(b.msgB, 'msgB')
    const tagB = id32(b.tagB, 'tagB')
    // One answer at a time: only while none is waiting (a rejected answer frees the code for the next try).
    const r = await db
      .prepare(
        `UPDATE sync_pairings SET guest_hash = ?2, msg_b = ?3, tag_b = ?4
         WHERE sid = ?1 AND msg_b IS NULL AND wrong < ?5 AND box IS NULL AND fetched = 0 AND expires_at > ?6`,
      )
      .bind(s, guestHash, msgB, tagB, MAX_WRONG, now)
      .run()
    if (r.meta.changes === 1) return new Response(null, { status: 202 })
    if (dead(await find(db, s), now)) throw gone()
    throw new HttpError(409, 'another device is using this code')
  }

  if (op === 'poll') {
    const b = object(body, ['sid', 'hostToken'])
    const s = sid(b.sid)
    const tokenHash = await sha256Hex(id32(b.hostToken, 'hostToken'))
    const p = await find(db, s)
    if (!p || p.expires_at <= now) throw gone()
    if (!safeEqual(p.host_hash, tokenHash)) throw new HttpError(403, 'wrong token')
    if (p.fetched === 1) return json({ state: 'done', wrong: p.wrong }, 200)
    if (p.box !== null) return json({ state: 'delivered', wrong: p.wrong }, 200)
    if (p.msg_b !== null) return json({ state: 'answer', msgB: p.msg_b, tagB: p.tag_b, wrong: p.wrong }, 200)
    return json({ state: 'waiting', wrong: p.wrong }, 200)
  }

  if (op === 'reply') {
    const b = object(body, ['sid', 'hostToken', 'box', 'msgB'])
    const s = sid(b.sid)
    const tokenHash = await sha256Hex(id32(b.hostToken, 'hostToken'))
    // The host says which answer it is deciding on, so a newer answer is never judged by an older check.
    const msgB = id32(b.msgB, 'msgB')
    if (b.box !== null && !isBox(b.box)) throw new HttpError(400, 'box must be null or 60 base64url bytes')
    const p = await find(db, s)
    if (!p || p.expires_at <= now) throw gone()
    if (!safeEqual(p.host_hash, tokenHash)) throw new HttpError(403, 'wrong token')
    // Only the answer that is waiting can be replied to, once, and only while the code lives (checked again at write time).
    const fresh = Date.now()
    const r =
      b.box === null
        ? await db
            .prepare(
              `UPDATE sync_pairings SET wrong = wrong + 1, msg_b = NULL, tag_b = NULL
               WHERE sid = ?1 AND msg_b = ?2 AND box IS NULL AND fetched = 0 AND expires_at > ?3`,
            )
            .bind(s, msgB, fresh)
            .run()
        : await db
            .prepare(
              `UPDATE sync_pairings SET box = ?2, msg_b = NULL, tag_b = NULL, expires_at = MAX(expires_at, ?3)
               WHERE sid = ?1 AND msg_b = ?4 AND box IS NULL AND fetched = 0 AND expires_at > ?5`,
            )
            .bind(s, b.box, fresh + GRACE_MS, msgB, fresh)
            .run()
    if (r.meta.changes !== 1) throw new HttpError(409, 'no answer is waiting')
    return new Response(null, { status: 204 })
  }

  // fetch
  const b = object(body, ['sid', 'guestToken'])
  const s = sid(b.sid)
  const tokenHash = await sha256Hex(id32(b.guestToken, 'guestToken'))
  const p = await find(db, s)
  if (!p || p.expires_at <= now) throw gone()
  if (p.guest_hash === null || !safeEqual(p.guest_hash, tokenHash)) throw new HttpError(403, 'wrong token')
  if (p.box !== null) {
    // The box stays until the code expires, so a lost response can be fetched again. It is ciphertext only the guest can open,
    // and the code is still used once: join and answer refuse a code that holds a box. `fetched` tells the host it arrived.
    await db.prepare('UPDATE sync_pairings SET fetched = 1 WHERE sid = ? AND box IS NOT NULL AND expires_at > ?').bind(s, Date.now()).run()
    return json({ box: p.box }, 200)
  }
  // No answer is waiting although this guest answered: the host rejected it.
  if (p.msg_b === null) return json({ state: 'wrong', left: Math.max(0, MAX_WRONG - p.wrong) }, 200)
  return json({ state: 'waiting' }, 200)
}

/** Cron: drops codes that have expired. */
export async function cleanupPairings(db: D1Database, now: number): Promise<number> {
  return (await db.prepare('DELETE FROM sync_pairings WHERE expires_at <= ?').bind(now).run()).meta.changes
}
