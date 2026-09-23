// Sync key handling and record encryption (WebCrypto). No network, no database.
import type { TableName } from '../data'

export const KEY_BYTES = 32
/**
 * Version of the encrypted payload format (`v` inside the ciphertext): the highest row version this app reads.
 * Raise it when old clients must not read new rows. A client defers rows above its own version ("update this app").
 * 2: study time plans (schema 5). An older client would strip `studyMinutesPerWeek` and could write the plan back as
 * an empty task plan, so study plans and their sessions travel as version 2 (rowVersion) and older clients wait.
 */
export const SYNC_VERSION = 2

/** The version a row is sent with: 2 for study sessions and study time plans, 1 for everything an older client can read. */
export function rowVersion(table: TableName, row: object): number {
  if (table === 'studyItems') return 2
  if (table === 'plans' && (row as { studyMinutesPerWeek?: unknown }).studyMinutesPerWeek !== undefined) return 2
  return 1
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function b64uEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodes base64url (no padding). Returns null on bad input. */
export function b64uDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

// ---- the sync key ----

export const generateSyncKey = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(KEY_BYTES))

// ---- derived secrets ----

export interface SyncKeys {
  /** Server-visible identifier of this sync key's space. */
  spaceId: string
  /** Proof of ownership sent with every request; the server keeps only its hash. */
  token: string
  /** AES-GCM-256 key for the record payloads. */
  encKey: CryptoKey
  /** HMAC key that makes each record's server-side key. */
  ridKey: CryptoKey
}

async function derive(root: CryptoKey, label: string): Promise<ArrayBuffer> {
  // Empty salt: the root is already 256 random bits. The label separates the four purposes.
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(label) }, root, 256)
}

/** HKDF-SHA256 from the sync key. The same key gives the same result on every device. */
export async function deriveKeys(key: Uint8Array): Promise<SyncKeys> {
  if (key.length !== KEY_BYTES) throw new Error('A sync key is 32 bytes')
  const root = await crypto.subtle.importKey('raw', key as BufferSource, 'HKDF', false, ['deriveBits'])
  const [encBits, space, auth, rid] = await Promise.all([
    derive(root, 'kiln/sync/enc'),
    derive(root, 'kiln/sync/space'),
    derive(root, 'kiln/sync/auth'),
    derive(root, 'kiln/sync/rid'),
  ])
  return {
    spaceId: b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', space))),
    token: b64uEncode(new Uint8Array(auth)),
    encKey: await crypto.subtle.importKey('raw', encBits, 'AES-GCM', false, ['encrypt', 'decrypt']),
    ridKey: await crypto.subtle.importKey('raw', rid, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  }
}

/** The server-side key of a record: HMAC of table and id, so the server learns neither. */
export async function recordKey(keys: SyncKeys, table: TableName, id: string): Promise<string> {
  return b64uEncode(new Uint8Array(await crypto.subtle.sign('HMAC', keys.ridKey, enc.encode(`${table}:${id}`))))
}

// ---- records ----

/** A record as it travels: everything but `ciphertext` and `iv` is visible to the server. */
export interface WireRow {
  recordKey: string
  updatedAt: number
  iv: string
  ciphertext: string
}

/** Encrypts one row on its own. The AAD (space id plus record key) ties the blob to its slot. */
export async function encryptRow(
  keys: SyncKeys,
  table: TableName,
  row: { id: string; updatedAt: number },
  version = rowVersion(table, row),
): Promise<WireRow> {
  const key = await recordKey(keys, table, row.id)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(keys.spaceId + key) },
    keys.encKey,
    enc.encode(JSON.stringify({ v: version, table, row })),
  )
  return { recordKey: key, updatedAt: row.updatedAt, iv: b64uEncode(iv), ciphertext: b64uEncode(new Uint8Array(data)) }
}

/**
 * Decrypts a wire row to `{table, row}` (not yet validated: pass `row` through the table's schema).
 * Throws if the blob was changed, belongs to another key or another slot, or its contents do not
 * hash to the record key it was stored under.
 */
export async function decryptRow(keys: SyncKeys, w: WireRow): Promise<{ v: number; table: TableName; row: { id: string; updatedAt: number } & Record<string, unknown> }> {
  const iv = b64uDecode(w.iv)
  const data = b64uDecode(w.ciphertext)
  if (!iv || iv.length !== 12 || !data) throw new Error('bad encoding')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(keys.spaceId + w.recordKey) },
    keys.encKey,
    data,
  )
  const parsed: unknown = JSON.parse(dec.decode(plain))
  const p = parsed as { v?: unknown; table?: unknown; row?: { id?: unknown; updatedAt?: unknown } }
  if (typeof p?.table !== 'string' || typeof p.row?.id !== 'string' || typeof p.row.updatedAt !== 'number') throw new Error('bad payload')
  if ((await recordKey(keys, p.table as TableName, p.row.id)) !== w.recordKey) throw new Error('record key mismatch')
  const v = p.v === undefined ? 1 : p.v
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('bad version')
  return { v, table: p.table as TableName, row: p.row as { id: string; updatedAt: number } & Record<string, unknown> }
}
