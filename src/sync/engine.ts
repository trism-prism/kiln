// Sync engine: pull, merge, push. No React. See README.md.
import type { Table } from 'dexie'
import { z } from 'zod'
import { mergeRows, rowSchemas } from '../data/backup'
import type { KilnDB } from '../data/db'
import { TABLE_NAMES, type Base, type TableName } from '../data/types'
import { addDaysISO, toLocalISODate } from '../lib/date'
import {
  b64uDecode,
  b64uEncode,
  decryptRow,
  deriveKeys,
  encryptRow,
  rowVersion,
  SYNC_VERSION,
  type SyncKeys,
  type WireRow,
} from './crypto'

// Device-local settings, kept in the `meta` table (never synced, never in a backup).
const META_KEY = 'syncKey'
const META_CURSOR = 'syncCursor'
const META_PUSHED = 'syncPushed'
const META_LAST = 'syncLastSynced'
const META_RETRY = 'syncRetry'
/** Set when another device disconnected sync, so Settings can say why it is off. Cleared when sync is turned on again. */
const META_PEER = 'syncDisconnected'
const META_ALL = [META_KEY, META_CURSOR, META_PUSHED, META_LAST, META_RETRY, META_PEER]

const PULL_LIMIT = 500
const PUSH_ROWS = 200
/** Stay well under the server's 1 MB body limit. */
const PUSH_BYTES = 800_000
/** The server refuses larger ciphertexts. */
const MAX_CIPHERTEXT = 65_536
/** Rows that decrypted but could not be used yet (see RetryEntry): at most this many, this large in total. */
const RETRY_MAX_ROWS = 200
const RETRY_MAX_CHARS = 4_000_000

export type SyncErrorKind =
  /** Sync is off on this device (or its key changed during the run). */
  | 'not-enabled'
  /** The server refused the key (401/403). */
  | 'wrong-key'
  /** The space is full or the request was too large (413/507). */
  | 'quota'
  /** No connection; try again later. */
  | 'network'
  /** The server failed or answered something unexpected; try again later. */
  | 'server'
  /** Other devices wrote data in a newer format; update the app. */
  | 'update-required'
  /** Another device disconnected sync: the server copy is gone and this device turned sync off (its data is kept). */
  | 'disconnected'
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
  /** Received rows dropped for good: they could not be decrypted (wrong key, damaged, moved). */
  invalid: number
  /** Received rows kept for a later run (failed validation, or written in a newer format). */
  retrying: number
  /** Local records too large to upload. They block the push mark, so they are reported on every run until edited or deleted. */
  tooLarge: { table: TableName; id: string }[]
  /** Set when the run stopped early or needs attention. Work done before the error is kept and counted above. */
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

// ---- one thing at a time ----

const queues = new WeakMap<KilnDB, Promise<unknown>>()

/**
 * Runs `fn` after everything queued before it on this database, and inside the Web Lock
 * `kiln-sync` when the browser has one, so other tabs of the app wait too. Runs, key changes and
 * turning sync off therefore never overlap.
 */
function exclusive<T>(db: KilnDB, fn: () => Promise<T>): Promise<T> {
  const locked = () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('kiln-sync', fn) : fn())
  const p = (queues.get(db) ?? Promise.resolve()).then(locked)
  queues.set(db, p.catch(() => undefined))
  return p
}

const synced = (db: KilnDB) => TABLE_NAMES.map((n) => db.table(n))

/**
 * A read-write transaction that first checks the sync key is still the one the run started with,
 * so a run can never write cursor, marks or rows that belong to another space.
 */
function guarded<T>(db: KilnDB, rawKey: string, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [...tables, db.meta], async () => {
    if ((await db.meta.get(META_KEY))?.value !== rawKey) throw new SyncFail('not-enabled', 'The sync key changed during the run')
    return fn()
  })
}

// ---- enable, disable, status ----

/** Where to reach the server. */
export interface SyncNet {
  fetch: typeof fetch
  baseUrl: string
}

/**
 * Turns sync on with this key (32 bytes: made on this device, or received from another through a pairing code).
 * Starts from scratch: the next sync pulls everything and pushes every local record. Waits for a running sync first.
 */
export function enableSyncKey(db: KilnDB, key: Uint8Array): Promise<void> {
  return exclusive(db, () =>
    db.transaction('rw', db.meta, async () => {
      await db.meta.bulkDelete(META_ALL)
      await db.meta.put({ key: META_KEY, value: b64uEncode(key) })
    }),
  )
}

/** Turns sync off on this device only. Local data stays; so does the data on the server. Waits for a running sync. */
export function disableSync(db: KilnDB): Promise<void> {
  return exclusive(db, () => db.meta.bulkDelete(META_ALL))
}

export type DisconnectResult = { ok: true } | { ok: false; error: { kind: SyncErrorKind; message: string } }

/**
 * Disconnects sync everywhere: the server deletes the synced copy and marks the space closed, so every other
 * device finds out on its next run. This device turns sync off and keeps its data. If the server cannot be
 * reached (or refuses), nothing changes and sync stays on. Waits for a running sync.
 */
export function disconnectSync(db: KilnDB, net: SyncNet): Promise<DisconnectResult> {
  return exclusive(db, async () => {
    const raw = await getMeta(db, META_KEY)
    const key = raw === undefined ? null : b64uDecode(raw)
    if (!key) return { ok: true }
    try {
      await makePost(net.fetch, net.baseUrl, await deriveKeys(key))('/sync/close', {}, z.undefined())
    } catch (e) {
      // 410: someone else already closed it, which is what was asked for.
      if (!(e instanceof SyncFail && e.kind === 'disconnected')) return { ok: false, error: toError(e) }
    }
    await db.meta.bulkDelete(META_ALL)
    return { ok: true }
  })
}

export interface SyncStatus {
  enabled: boolean
  /** ms epoch of the last run that finished without an error. */
  lastSyncedAt?: number
  /** Sync is off because another device disconnected it. */
  disconnectedByPeer?: boolean
}

export async function getSyncStatus(db: KilnDB): Promise<SyncStatus> {
  const [key, last, peer] = await Promise.all([getMeta(db, META_KEY), getMeta(db, META_LAST), getMeta(db, META_PEER)])
  return { enabled: key !== undefined, lastSyncedAt: last === undefined ? undefined : Number(last), disconnectedByPeer: peer !== undefined }
}

/** This device's sync key, or undefined when sync is off. Treat as a password. */
export async function getSyncKey(db: KilnDB): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const raw = await getMeta(db, META_KEY)
  return (raw === undefined ? null : b64uDecode(raw)) ?? undefined
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
    if (res.status === 410) throw new SyncFail('disconnected', 'Sync was disconnected from another device')
    if (res.status === 401 || res.status === 403) throw new SyncFail('wrong-key', 'The server did not accept this sync key')
    if (res.status === 413 || res.status === 507) throw new SyncFail('quota', 'The sync space is full or the data is too large')
    if (!res.ok) throw new SyncFail('server', `The sync server answered ${res.status}`)
    const parsed = schema.safeParse(res.status === 204 ? undefined : await res.json().catch(() => undefined))
    if (!parsed.success) throw new SyncFail('server', 'The sync server sent an unexpected answer')
    return parsed.data
  }
}

const toError = (e: unknown) =>
  e instanceof SyncFail ? { kind: e.kind, message: e.message } : { kind: 'local' as const, message: e instanceof Error ? e.message : String(e) }

// ---- pull ----

/**
 * A received row that decrypted (so it is genuine) but cannot be used yet: it fails this app's
 * validation, or a newer app wrote it (`version`). Kept in meta and tried again on every run;
 * dropped when a newer version of the same record arrives. Rows that do not decrypt are not kept.
 */
interface RetryEntry {
  wire: WireRow
  why: 'schema' | 'version'
  /** The table inside the ciphertext (entries saved before this field have none). */
  table?: TableName
}
type RetrySet = Map<string, RetryEntry>
const retryId = (w: WireRow) => `${w.recordKey}:${w.updatedAt}`

type Decoded = { ok: { table: TableName; row: Base } } | { defer: 'schema' | 'version'; table: TableName } | { bad: true } | { old: true }

/** Study session tombstones dated more than this many days back are not kept (nor waited on): nothing reads them. */
const STUDY_TOMBSTONE_DAYS = 60
const oldSessionTombstone = (table: string, row: Record<string, unknown>) =>
  table === 'studyItems' && row.deleted === true && typeof row.date === 'string' && row.date < addDaysISO(toLocalISODate(new Date()), -STUDY_TOMBSTONE_DAYS)

async function decode(keys: SyncKeys, w: WireRow, schemas: ReturnType<typeof rowSchemas>): Promise<Decoded> {
  let d
  try {
    d = await decryptRow(keys, w)
  } catch {
    return { bad: true }
  }
  if (oldSessionTombstone(d.table, d.row)) return { old: true }
  if (d.v > SYNC_VERSION) return { defer: 'version', table: d.table }
  const schema = (schemas as Record<string, z.ZodType | undefined>)[d.table]
  const ok = schema?.safeParse(d.row)
  return ok?.success ? { ok: { table: d.table, row: ok.data as Base } } : { defer: 'schema', table: d.table }
}

/** Decrypts and validates wire rows, sorting them into rows to merge, rows to retry, and rows to drop. */
async function ingest(keys: SyncKeys, wires: WireRow[], retry: RetrySet, seen: Map<string, number>, s: SyncSummary) {
  const schemas = rowSchemas(Date.now())
  const decoded = await Promise.all(wires.map((w) => decode(keys, w, schemas)))
  const byTable = new Map<TableName, Base[]>()
  wires.forEach((w, i) => {
    // A new version of a record replaces whatever of it was waiting.
    for (const [id, e] of retry) if (e.wire.recordKey === w.recordKey && e.wire.updatedAt <= w.updatedAt) retry.delete(id)
    const d = decoded[i]!
    if ('ok' in d) {
      const k = `${d.ok.table}:${d.ok.row.id}`
      seen.set(k, Math.max(seen.get(k) ?? 0, d.ok.row.updatedAt))
      byTable.set(d.ok.table, [...(byTable.get(d.ok.table) ?? []), d.ok.row])
    } else if ('defer' in d) {
      retry.set(retryId(w), { wire: w, why: d.defer, table: d.table })
    } else if ('bad' in d) {
      s.invalid++
    }
  })
  // Bounded: study sessions are given up first (the scheduler makes them again), then the oldest waiting rows,
  // so a plan row never makes way for its sessions.
  let chars = [...retry.values()].reduce((n, e) => n + e.wire.ciphertext.length, 0)
  const order = [...retry].sort(([, a], [, b]) => Number(b.table === 'studyItems') - Number(a.table === 'studyItems'))
  for (const [id, e] of order) {
    if (retry.size <= RETRY_MAX_ROWS && chars <= RETRY_MAX_CHARS) break
    retry.delete(id)
    chars -= e.wire.ciphertext.length
    s.invalid++
  }
  return byTable
}

const loadRetry = async (db: KilnDB): Promise<RetrySet> => new Map(Object.entries(JSON.parse((await getMeta(db, META_RETRY)) ?? '{}') as Record<string, RetryEntry>))
const saveRetry = (db: KilnDB, retry: RetrySet) => db.meta.put({ key: META_RETRY, value: JSON.stringify(Object.fromEntries(retry)) })

/** Merges rows and saves the retry set (and the cursor, for a pulled page) in one transaction. */
async function commit(db: KilnDB, rawKey: string, byTable: Map<TableName, Base[]>, retry: RetrySet, s: SyncSummary, cursor?: number) {
  // The async callback keeps the transaction open across the awaits.
  await guarded(db, rawKey, synced(db), async () => {
    for (const [table, rows] of byTable) {
      const r = await mergeRows(db.table(table) as Table<Base, string>, rows, { takeTies: true })
      s.applied += r.added + r.replaced
    }
    await saveRetry(db, retry)
    if (cursor !== undefined) await db.meta.put({ key: META_CURSOR, value: String(cursor) })
  })
}

/** Tries the waiting rows again (the app may have been updated), then pulls every page. */
async function pullAll(db: KilnDB, rawKey: string, keys: SyncKeys, post: Post, s: SyncSummary): Promise<{ seen: Map<string, number>; retry: RetrySet }> {
  const seen = new Map<string, number>()
  const retry = await loadRetry(db)
  if (retry.size) {
    const waiting = [...retry.values()].map((e) => e.wire)
    retry.clear()
    await commit(db, rawKey, await ingest(keys, waiting, retry, seen, s), retry, s)
  }

  let cursor = Number((await getMeta(db, META_CURSOR)) ?? 0)
  for (;;) {
    const page = await post('/sync/pull', { cursor, limit: PULL_LIMIT }, pullResponse)
    // Checked before anything is written, so a stuck server cannot make us loop or half-apply.
    if (page.more && page.cursor <= cursor) throw new SyncFail('server', 'The sync server did not advance the cursor')
    s.pulled += page.rows.length
    await commit(db, rawKey, await ingest(keys, page.rows, retry, seen, s), retry, s, page.cursor)
    if (!page.more) return { seen, retry }
    cursor = page.cursor
  }
}

// ---- push ----

async function pushChanged(db: KilnDB, rawKey: string, keys: SyncKeys, post: Post, seen: Map<string, number>, s: SyncSummary): Promise<void> {
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

  // The push mark of a table only ever moves up to rows this run really sent. A row the server just
  // sent us (and that we did not change since) is not sent back and does not move the mark: its
  // updatedAt may come from another device's clock and must not hide our own, older edits.
  // A row too large to upload stops the mark just below it, so it is reported until it is changed.
  const toSend: { table: TableName; wire: WireRow }[] = []
  const blockedAt: Partial<Record<TableName, number>> = {}
  for (const { table, row } of changed) {
    if (row.updatedAt <= (seen.get(`${table}:${row.id}`) ?? -1)) continue
    const wire = await encryptRow(keys, table, row, rowVersion(table, row))
    if (wire.ciphertext.length > MAX_CIPHERTEXT) {
      s.tooLarge.push({ table, id: row.id })
      blockedAt[table] ??= row.updatedAt
    } else toSend.push({ table, wire })
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

  for (const [i, chunk] of chunks.entries()) {
    const r = await post('/sync/push', { rows: chunk.map((c) => c.wire) }, pushResponse)
    s.pushed += r.accepted
    s.rejectedStale += r.stale
    // Rows are sorted by updatedAt. A tie with the next chunk's first row keeps the mark just below
    // it, so that row is retried.
    const next = chunks[i + 1]?.[0]?.wire.updatedAt
    const upTo = new Map<TableName, number>()
    for (const c of chunk) upTo.set(c.table, Math.max(upTo.get(c.table) ?? -1, c.wire.updatedAt))
    for (const [t, v] of upTo) {
      let cap = v
      if (next !== undefined && cap >= next) cap = next - 1
      const blocked = blockedAt[t]
      if (blocked !== undefined && cap >= blocked) cap = blocked - 1
      marks[t] = Math.max(marks[t] ?? -1, cap)
    }
    await guarded(db, rawKey, [], () => db.meta.put({ key: META_PUSHED, value: JSON.stringify(marks) }))
  }
}

// ---- sync now ----

const running = new WeakMap<KilnDB, Promise<SyncSummary>>()

/**
 * One sync: pull and merge everything new, then push local changes. Never throws for expected
 * trouble: the summary's `error` says what stopped it (wrong key, quota, offline...) and what was
 * done before that is kept. Safe to call again at any time; a call during a running sync shares it.
 * Key changes and turning sync off wait for a running sync, and a run notices if the key changed.
 */
export function syncNow(db: KilnDB, fetchImpl: typeof fetch, baseUrl: string): Promise<SyncSummary> {
  let p = running.get(db)
  if (!p) {
    p = exclusive(db, () => run(db, fetchImpl, baseUrl)).finally(() => running.delete(db))
    running.set(db, p)
  }
  return p
}

async function run(db: KilnDB, fetchImpl: typeof fetch, baseUrl: string): Promise<SyncSummary> {
  const s: SyncSummary = { pulled: 0, applied: 0, pushed: 0, rejectedStale: 0, invalid: 0, retrying: 0, tooLarge: [] }
  let rawKey: string | undefined
  try {
    rawKey = await getMeta(db, META_KEY)
    const key = rawKey === undefined ? null : b64uDecode(rawKey)
    if (rawKey === undefined || !key) throw new SyncFail('not-enabled', 'Sync is not turned on')
    const keys = await deriveKeys(key)
    const post = makePost(fetchImpl, baseUrl, keys)
    const { seen, retry } = await pullAll(db, rawKey, keys, post, s)
    s.retrying = retry.size
    await pushChanged(db, rawKey, keys, post, seen, s)
    if ([...retry.values()].some((e) => e.why === 'version')) {
      throw new SyncFail('update-required', 'Other devices use a newer version of Kiln; update this app to see all changes')
    }
    await guarded(db, rawKey, [], () => db.meta.put({ key: META_LAST, value: String(Date.now()) }))
  } catch (e) {
    s.error = toError(e)
    if (s.error.kind === 'disconnected' && rawKey !== undefined) {
      // Another device disconnected sync: turn it off here (only if the key is still the one this run used) and keep every row.
      const key = rawKey
      await guarded(db, key, [], async () => {
        await db.meta.bulkDelete(META_ALL)
        await db.meta.put({ key: META_PEER, value: '1' })
      }).catch(() => undefined)
    }
  }
  return s
}
