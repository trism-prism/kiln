// Sync engine: pull, merge, push. No React. See README.md.
import type { Table } from 'dexie'
import { z } from 'zod'
import { mergeRows, rowSchemas } from '../data/backup'
import type { KilnDB } from '../data/db'
import { TABLE_NAMES, type Base, type TableName } from '../data/types'
import {
  b64uDecode,
  b64uEncode,
  decryptRow,
  deriveKeys,
  encryptRow,
  generateSyncKey,
  keyToMnemonic,
  keyToQrPayload,
  mnemonicToKey,
  qrPayloadToKey,
  type SyncKeys,
  type WireRow,
} from './crypto'

// Device-local settings, kept in the `meta` table (never synced, never in a backup).
const META_KEY = 'syncKey'
const META_CURSOR = 'syncCursor'
const META_PUSHED = 'syncPushed'
const META_LAST = 'syncLastSynced'

const PULL_LIMIT = 500
const PUSH_ROWS = 200
/** Stay well under the server's 1 MB body limit. */
const PUSH_BYTES = 800_000
/** The server refuses larger ciphertexts. */
const MAX_CIPHERTEXT = 65_536

export type SyncErrorKind =
  /** Sync is off on this device. */
  | 'not-enabled'
  /** The server refused the key (401/403). */
  | 'wrong-key'
  /** The space is full or the request was too large (413/507). */
  | 'quota'
  /** No connection; try again later. */
  | 'network'
  /** The server failed or answered something unexpected; try again later. */
  | 'server'
  /** The local database failed. */
  | 'local'

export interface SyncSummary {
  /** Rows received from the server. */
  pulled: number
  /** Received rows that were new or newer than the local copy and were written. */
  applied: number
  /** Rows the server accepted. */
  pushed: number
  /** Rows the server already had a newer (or equal) version of. */
  rejectedStale: number
  /** Rows dropped: could not be decrypted or failed validation (pulled), or too large to upload (local). */
  invalid: number
  /** Set when the run stopped early. Work done before the error is kept and counted above. */
  error?: { kind: SyncErrorKind; message: string }
}

class SyncFail extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message)
  }
}

const getMeta = async (db: KilnDB, key: string) => (await db.meta.get(key))?.value

// ---- enable, disable, status ----

/** What the Settings screen shows so the user can add another device. */
export interface SyncSecret {
  /** 24 words. */
  mnemonic: string
  /** Text for the QR code. */
  qr: string
}

/**
 * Turns sync on. Without `mnemonic` it makes a new random key (create); with the 24 words of
 * another device's key it joins that space. Throws on an invalid phrase. Starts from scratch:
 * the next sync pulls everything and pushes every local record. Replaces a key set earlier.
 */
export async function enableSync(db: KilnDB, mnemonic?: string): Promise<SyncSecret> {
  return setKey(db, mnemonic === undefined ? generateSyncKey() : mnemonicToKey(mnemonic))
}

async function setKey(db: KilnDB, key: Uint8Array): Promise<SyncSecret> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.bulkDelete([META_CURSOR, META_PUSHED, META_LAST])
    await db.meta.put({ key: META_KEY, value: b64uEncode(key) })
  })
  return { mnemonic: keyToMnemonic(key), qr: keyToQrPayload(key) }
}

/** Joins from a scanned QR payload (`kiln-sync:...`); same as enableSync with the words. */
export async function enableSyncFromQr(db: KilnDB, payload: string): Promise<SyncSecret> {
  return setKey(db, qrPayloadToKey(payload))
}

/** Turns sync off on this device. Local data stays; so does the data on the server. */
export async function disableSync(db: KilnDB): Promise<void> {
  await db.meta.bulkDelete([META_KEY, META_CURSOR, META_PUSHED, META_LAST])
}

export interface SyncStatus {
  enabled: boolean
  /** ms epoch of the last run that finished without an error. */
  lastSyncedAt?: number
}

export async function getSyncStatus(db: KilnDB): Promise<SyncStatus> {
  const [key, last] = await Promise.all([getMeta(db, META_KEY), getMeta(db, META_LAST)])
  return { enabled: key !== undefined, lastSyncedAt: last === undefined ? undefined : Number(last) }
}

/** The words and QR text of this device's key, or undefined when sync is off. Treat as a password. */
export async function getSyncSecret(db: KilnDB): Promise<SyncSecret | undefined> {
  const raw = await getMeta(db, META_KEY)
  const key = raw === undefined ? null : b64uDecode(raw)
  return key ? { mnemonic: keyToMnemonic(key), qr: keyToQrPayload(key) } : undefined
}

// ---- network ----

const pullResponse = z.object({
  rows: z.array(z.object({ recordKey: z.string(), updatedAt: z.number(), iv: z.string(), ciphertext: z.string() })),
  cursor: z.number().int().min(0),
  more: z.boolean(),
})
const pushResponse = z.object({ accepted: z.number().int().min(0), stale: z.number().int().min(0) })

type Post = <T extends z.ZodType>(path: string, body: Record<string, unknown>, schema: T) => Promise<z.infer<T>>

function makePost(fetchImpl: typeof fetch, baseUrl: string, keys: SyncKeys): Post {
  const base = baseUrl.replace(/\/+$/, '')
  return async (path, body, schema) => {
    let res: Response
    try {
      res = await fetchImpl(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spaceId: keys.spaceId, token: keys.token, ...body }),
      })
    } catch {
      throw new SyncFail('network', 'Could not reach the sync server')
    }
    if (res.status === 401 || res.status === 403) throw new SyncFail('wrong-key', 'The server did not accept this sync key')
    if (res.status === 413 || res.status === 507) throw new SyncFail('quota', 'The sync space is full or the data is too large')
    if (!res.ok) throw new SyncFail('server', `The sync server answered ${res.status}`)
    const parsed = schema.safeParse(await res.json().catch(() => undefined))
    if (!parsed.success) throw new SyncFail('server', 'The sync server sent an unexpected answer')
    return parsed.data
  }
}

// ---- pull ----

const synced = (db: KilnDB) => TABLE_NAMES.map((n) => db.table(n))

/** Pulls every page, merging each page into the database in one transaction (with the new cursor). */
async function pullAll(db: KilnDB, keys: SyncKeys, post: Post, s: SyncSummary): Promise<Map<string, number>> {
  const seen = new Map<string, number>()
  let cursor = Number((await getMeta(db, META_CURSOR)) ?? 0)
  for (;;) {
    const page = await post('/sync/pull', { cursor, limit: PULL_LIMIT }, pullResponse)
    s.pulled += page.rows.length

    const schemas = rowSchemas(Date.now())
    const decoded = await Promise.all(
      page.rows.map(async (w: WireRow) => {
        try {
          const { table, row } = await decryptRow(keys, w)
          if (!(table in schemas)) return null
          const ok = schemas[table].safeParse(row)
          return ok.success ? { table, row: ok.data as Base } : null
        } catch {
          return null
        }
      }),
    )
    const byTable = new Map<TableName, Base[]>()
    for (const d of decoded) {
      if (!d) {
        s.invalid++
        continue
      }
      seen.set(`${d.table}:${d.row.id}`, Math.max(seen.get(`${d.table}:${d.row.id}`) ?? 0, d.row.updatedAt))
      byTable.set(d.table, [...(byTable.get(d.table) ?? []), d.row])
    }

    // The async callback keeps the transaction open across the awaits. Rows and cursor commit together.
    await db.transaction('rw', [...synced(db), db.meta], async () => {
      for (const [table, rows] of byTable) {
        const r = await mergeRows(db.table(table) as Table<Base, string>, rows, { takeTies: true })
        s.applied += r.added + r.replaced
      }
      await db.meta.put({ key: META_CURSOR, value: String(page.cursor) })
    })

    if (!page.more) return seen
    if (page.cursor <= cursor) throw new SyncFail('server', 'The sync server did not advance the cursor')
    cursor = page.cursor
  }
}

// ---- push ----

async function pushChanged(db: KilnDB, keys: SyncKeys, post: Post, seen: Map<string, number>, s: SyncSummary): Promise<void> {
  const marks: Partial<Record<TableName, number>> = JSON.parse((await getMeta(db, META_PUSHED)) ?? '{}')
  const changed: { table: TableName; row: Base }[] = []
  await db.transaction('r', synced(db), async () => {
    for (const table of TABLE_NAMES) {
      for (const row of (await db
        .table(table)
        .where('updatedAt')
        .above(marks[table] ?? -1)
        .toArray()) as Base[]) {
        changed.push({ table, row })
      }
    }
  })
  changed.sort((a, b) => a.row.updatedAt - b.row.updatedAt)

  // A row the server just sent us, and that we did not change since, needs no push.
  const toSend: { table: TableName; wire: WireRow }[] = []
  for (const { table, row } of changed) {
    if (row.updatedAt <= (seen.get(`${table}:${row.id}`) ?? -1)) continue
    const wire = await encryptRow(keys, table, row)
    if (wire.ciphertext.length > MAX_CIPHERTEXT) s.invalid++
    else toSend.push({ table, wire })
  }

  const chunks: (typeof toSend)[] = []
  let size = 0
  for (const item of toSend) {
    const n = item.wire.ciphertext.length + 120
    if (!chunks.length || chunks[chunks.length - 1]!.length >= PUSH_ROWS || size + n > PUSH_BYTES) {
      chunks.push([])
      size = 0
    }
    chunks[chunks.length - 1]!.push(item)
    size += n
  }

  const advance = async (upTo: Map<TableName, number>) => {
    for (const [t, v] of upTo) marks[t] = Math.max(marks[t] ?? -1, v)
    await db.meta.put({ key: META_PUSHED, value: JSON.stringify(marks) })
  }

  for (const [i, chunk] of chunks.entries()) {
    const r = await post('/sync/push', { rows: chunk.map((c) => c.wire) }, pushResponse)
    s.pushed += r.accepted
    s.rejectedStale += r.stale
    // Rows are sorted by updatedAt, so what is pushed is exactly what lies below each table's mark.
    // A tie with the next chunk's first row keeps the mark just below it, so that row is retried.
    const next = chunks[i + 1]?.[0]?.wire.updatedAt
    const upTo = new Map<TableName, number>()
    for (const c of chunk) upTo.set(c.table, Math.max(upTo.get(c.table) ?? -1, c.wire.updatedAt))
    if (next !== undefined) for (const [t, v] of upTo) if (v >= next) upTo.set(t, next - 1)
    await advance(upTo)
  }
  // Everything read above is now on the server (or oversized): move every mark to the newest row seen.
  const all = new Map<TableName, number>()
  for (const { table, row } of changed) all.set(table, Math.max(all.get(table) ?? -1, row.updatedAt))
  if (all.size) await advance(all)
}

// ---- sync now ----

const running = new WeakMap<KilnDB, Promise<SyncSummary>>()

/**
 * One sync: pull and merge everything new, then push local changes. Never throws for expected
 * trouble: the summary's `error` says what stopped it (wrong key, quota, offline...) and what was
 * done before that is kept. Safe to call again at any time; a call during a running sync shares it.
 */
export function syncNow(db: KilnDB, fetchImpl: typeof fetch, baseUrl: string): Promise<SyncSummary> {
  let p = running.get(db)
  if (!p) {
    p = run(db, fetchImpl, baseUrl).finally(() => running.delete(db))
    running.set(db, p)
  }
  return p
}

async function run(db: KilnDB, fetchImpl: typeof fetch, baseUrl: string): Promise<SyncSummary> {
  const s: SyncSummary = { pulled: 0, applied: 0, pushed: 0, rejectedStale: 0, invalid: 0 }
  try {
    const raw = await getMeta(db, META_KEY)
    const key = raw === undefined ? null : b64uDecode(raw)
    if (!key) throw new SyncFail('not-enabled', 'Sync is not turned on')
    const keys = await deriveKeys(key)
    const post = makePost(fetchImpl, baseUrl, keys)
    const seen = await pullAll(db, keys, post, s)
    await pushChanged(db, keys, post, seen, s)
    await db.meta.put({ key: META_LAST, value: String(Date.now()) })
  } catch (e) {
    s.error = e instanceof SyncFail ? { kind: e.kind, message: e.message } : { kind: 'local', message: e instanceof Error ? e.message : String(e) }
  }
  return s
}
