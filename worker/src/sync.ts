// End-to-end encrypted sync: /sync/push and /sync/pull. The server stores opaque ciphertext keyed by
// opaque identifiers; it cannot read records and does not know their tables or ids. See README.md.
import { b64uDecode } from './b64'
import { HttpError, json, safeEqual, sha256Hex } from './http'

export interface SyncEnv {
  DB: D1Database
  /** Optional overrides of the caps below. */
  MAX_SYNC_SPACES?: string
  MAX_SYNC_RECORDS?: string
  MAX_SYNC_BYTES?: string
}

const DEFAULT_MAX_SPACES = 5_000
const DEFAULT_MAX_RECORDS = 20_000
const DEFAULT_MAX_BYTES = 25_000_000

const MAX_PUSH_ROWS = 200
const MAX_PULL_ROWS = 500
/** Ciphertext characters in one record (about 48 KB of plaintext). */
const MAX_CIPHERTEXT = 65_536
/** A pull response stops adding rows after this many ciphertext characters (at least one row is sent). */
const PULL_BYTE_BUDGET = 900_000
const DAY_MS = 86_400_000

const B64U = /^[A-Za-z0-9_-]+$/

/** 32 bytes as 43 base64url characters: space id, token and record key. */
export const isId = (v: unknown): v is string => typeof v === 'string' && v.length === 43 && b64uDecode(v)?.length === 32

interface Row {
  recordKey: string
  updatedAt: number
  iv: string
  ciphertext: string
}

export function object(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'body must be an object')
  const b = body as Record<string, unknown>
  for (const k of Object.keys(b)) if (!allowed.includes(k)) throw new HttpError(400, `unknown field: ${k}`)
  return b
}

function parseRow(v: unknown, now: number): Row {
  const r = object(v, ['recordKey', 'updatedAt', 'iv', 'ciphertext'])
  if (!isId(r.recordKey)) throw new HttpError(400, 'recordKey must be 32 base64url bytes')
  if (typeof r.updatedAt !== 'number' || !Number.isSafeInteger(r.updatedAt) || r.updatedAt < 0 || r.updatedAt > now + DAY_MS) {
    throw new HttpError(400, 'updatedAt must be a ms timestamp, at most one day ahead')
  }
  if (typeof r.iv !== 'string' || r.iv.length !== 16 || b64uDecode(r.iv)?.length !== 12) throw new HttpError(400, 'iv must be 12 base64url bytes')
  const c = r.ciphertext
  if (typeof c !== 'string' || c.length < 22 || c.length > MAX_CIPHERTEXT || !B64U.test(c) || c.length % 4 === 1) {
    throw new HttpError(400, `ciphertext must be base64url, 22-${MAX_CIPHERTEXT} chars`)
  }
  return { recordKey: r.recordKey, updatedAt: r.updatedAt, iv: r.iv, ciphertext: c }
}

const cap = (v: string | undefined, d: number) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d)

interface Space {
  token_hash: string
  seq: number
  record_count: number
  bytes: number
  closed_at: string | null
}

export async function handleSync(kind: 'push' | 'pull', body: unknown, env: SyncEnv): Promise<Response> {
  const now = Date.now()
  const b = object(body, kind === 'push' ? ['spaceId', 'token', 'rows'] : ['spaceId', 'token', 'cursor', 'limit'])
  if (!isId(b.spaceId)) throw new HttpError(400, 'spaceId must be 32 base64url bytes')
  if (!isId(b.token)) throw new HttpError(400, 'token must be 32 base64url bytes')
  const spaceId = b.spaceId
  const tokenHash = await sha256Hex(b.token)
  const db = env.DB

  const find = () => db.prepare('SELECT token_hash, seq, record_count, bytes, closed_at FROM sync_spaces WHERE space_id = ?').bind(spaceId).first<Space>()

  if (kind === 'pull') {
    const cursor = b.cursor
    const limit = b.limit
    if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'cursor must be an integer >= 0')
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PULL_ROWS) {
      throw new HttpError(400, `limit must be an integer 1-${MAX_PULL_ROWS}`)
    }
    const space = await find()
    // A space nobody has pushed to yet is empty (its token is set by the first push).
    if (!space) return json({ rows: [], cursor, more: false }, 200)
    if (!safeEqual(space.token_hash, tokenHash)) throw new HttpError(403, 'wrong sync key')
    if (space.closed_at !== null) throw new HttpError(410, 'sync was disconnected')
    // A cursor ahead of the space (for example a restored server) starts over.
    const from = cursor > space.seq ? 0 : cursor
    const found = await db
      .prepare(
        `SELECT record_key AS recordKey, updated_at AS updatedAt, seq, iv, ciphertext FROM sync_records
         WHERE space_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
      )
      .bind(spaceId, from, limit + 1)
      .all<Row & { seq: number }>()
    const rows: (Row & { seq: number })[] = []
    let size = 0
    for (const r of found.results.slice(0, limit)) {
      size += r.ciphertext.length
      if (rows.length > 0 && size > PULL_BYTE_BUDGET) break
      rows.push(r)
    }
    return json(
      {
        rows: rows.map(({ recordKey, updatedAt, iv, ciphertext }) => ({ recordKey, updatedAt, iv, ciphertext })),
        cursor: rows.length ? rows[rows.length - 1]!.seq : from,
        more: found.results.length > rows.length,
      },
      200,
    )
  }

  // push
  if (!Array.isArray(b.rows) || b.rows.length < 1 || b.rows.length > MAX_PUSH_ROWS) {
    throw new HttpError(400, `rows must be an array of 1-${MAX_PUSH_ROWS}`)
  }
  const sent = b.rows.map((r) => parseRow(r, now))

  let space = await find()
  if (!space) {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM sync_spaces WHERE closed_at IS NULL').first<{ n: number }>()
    if ((n?.n ?? 0) >= cap(env.MAX_SYNC_SPACES, DEFAULT_MAX_SPACES)) throw new HttpError(503, 'sync capacity reached')
    // OR IGNORE: if two first pushes race, the first token wins and the other is rejected below.
    await db
      .prepare('INSERT OR IGNORE INTO sync_spaces (space_id, token_hash, created_at) VALUES (?, ?, ?)')
      .bind(spaceId, tokenHash, new Date(now).toISOString())
      .run()
    space = await find()
  }
  if (!space || !safeEqual(space.token_hash, tokenHash)) throw new HttpError(403, 'wrong sync key')
  if (space.closed_at !== null) throw new HttpError(410, 'sync was disconnected')

  // One version per record: the newest in the request (the first on a tie).
  const newest = new Map<string, Row>()
  for (const r of sent) {
    const dup = newest.get(r.recordKey)
    if (!dup || r.updatedAt > dup.updatedAt) newest.set(r.recordKey, r)
  }
  const stored = await db
    .prepare(
      `SELECT record_key AS k, updated_at AS u, length(ciphertext) AS n FROM sync_records
       WHERE space_id = ?1 AND record_key IN (SELECT value FROM json_each(?2))`,
    )
    .bind(spaceId, JSON.stringify([...newest.keys()]))
    .all<{ k: string; u: number; n: number }>()
  const old = new Map(stored.results.map((r) => [r.k, r]))

  // Keep only rows newer than the stored version (ties keep the stored one).
  const accepted: Row[] = []
  let newRecords = 0
  let deltaBytes = 0
  for (const r of newest.values()) {
    const o = old.get(r.recordKey)
    if (o && r.updatedAt <= o.u) continue
    accepted.push(r)
    if (!o) newRecords++
    deltaBytes += r.ciphertext.length - (o?.n ?? 0)
  }

  if (accepted.length > 0) {
    // One batch (a transaction). The first statement hands out n sequence numbers and takes the
    // quota in the same UPDATE, so the caps are enforced where the counters live and two pushes at
    // once cannot both squeeze in. The insert only runs if that UPDATE changed a row (changes()).
    // Counters move only for rows that are accepted: new ones, or replacements by their size change.
    // ponytail: newRecords/deltaBytes come from the read above; a same-key race can skew them by one row.
    const n = accepted.length
    const maxRecords = cap(env.MAX_SYNC_RECORDS, DEFAULT_MAX_RECORDS)
    const maxBytes = cap(env.MAX_SYNC_BYTES, DEFAULT_MAX_BYTES)
    const [claim] = await db.batch([
      db
        .prepare(
          `UPDATE sync_spaces SET seq = seq + ?2, record_count = record_count + ?3, bytes = bytes + ?4
           WHERE space_id = ?1 AND closed_at IS NULL AND (?3 <= 0 OR record_count + ?3 <= ?5) AND (?4 <= 0 OR bytes + ?4 <= ?6)`,
        )
        .bind(spaceId, n, newRecords, deltaBytes, maxRecords, maxBytes),
      db
        .prepare(
          `INSERT INTO sync_records (space_id, record_key, updated_at, seq, iv, ciphertext)
           SELECT ?1, json_extract(value, '$[0]'), json_extract(value, '$[1]'),
                  (SELECT seq FROM sync_spaces WHERE space_id = ?1) - ?2 + 1 + key,
                  json_extract(value, '$[2]'), json_extract(value, '$[3]')
           FROM json_each(?3) WHERE changes() = 1
           ON CONFLICT (space_id, record_key) DO UPDATE SET
             updated_at = excluded.updated_at, seq = excluded.seq, iv = excluded.iv, ciphertext = excluded.ciphertext
           WHERE excluded.updated_at > sync_records.updated_at`,
        )
        .bind(spaceId, n, JSON.stringify(accepted.map((r) => [r.recordKey, r.updatedAt, r.iv, r.ciphertext]))),
    ])
    if (claim?.meta.changes !== 1) {
      // A disconnect can land between the read above and the claim: nothing was written, and the answer is 410.
      if ((await find())?.closed_at) throw new HttpError(410, 'sync was disconnected')
      throw new HttpError(507, 'sync space is full')
    }
  }
  return json({ accepted: accepted.length, stale: sent.length - accepted.length }, 200)
}

/**
 * Disconnect: deletes the space's records and marks it closed, so every other device that still holds the key
 * is told (410) on its next run instead of silently recreating the space. Idempotent. A space nobody pushed to
 * is closed too (a row is made), so a device that was offline when its peer disconnected still learns of it.
 * The row stays (token hash and counters only); cleanup keeps closed rows.
 */
export async function handleClose(body: unknown, env: SyncEnv): Promise<Response> {
  const b = object(body, ['spaceId', 'token'])
  if (!isId(b.spaceId)) throw new HttpError(400, 'spaceId must be 32 base64url bytes')
  if (!isId(b.token)) throw new HttpError(400, 'token must be 32 base64url bytes')
  const spaceId = b.spaceId
  const tokenHash = await sha256Hex(b.token)
  const now = new Date().toISOString()
  const db = env.DB
  const find = () => db.prepare('SELECT token_hash FROM sync_spaces WHERE space_id = ?').bind(spaceId).first<{ token_hash: string }>()
  let space = await find()
  if (!space) {
    await db
      .prepare('INSERT OR IGNORE INTO sync_spaces (space_id, token_hash, created_at, closed_at) VALUES (?, ?, ?, ?)')
      .bind(spaceId, tokenHash, now, now)
      .run()
    space = await find()
  }
  if (!space || !safeEqual(space.token_hash, tokenHash)) throw new HttpError(403, 'wrong sync key')
  await db.batch([
    db.prepare('DELETE FROM sync_records WHERE space_id = ?').bind(spaceId),
    db
      .prepare('UPDATE sync_spaces SET closed_at = COALESCE(closed_at, ?2), record_count = 0, bytes = 0 WHERE space_id = ?1')
      .bind(spaceId, now),
  ])
  return new Response(null, { status: 204 })
}

/** Cron: drops spaces that were created more than a day ago and never stored a record. */
export async function cleanupSyncSpaces(db: D1Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString()
  const r = await db.prepare('DELETE FROM sync_spaces WHERE record_count = 0 AND closed_at IS NULL AND created_at < ?').bind(cutoff).run()
  return r.meta.changes
}
