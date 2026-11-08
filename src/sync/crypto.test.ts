import { describe, expect, it } from 'vitest'
import {
  b64uEncode,
  decryptRow,
  deriveKeys,
  encryptRow,
  generateSyncKey,
  recordKey,
  rowVersion,
  SYNC_VERSION,
} from './crypto'

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, updatedAt: 1000, deleted: false, deviceId: 'd', ...extra })

describe('derived secrets', () => {
  it('keep their values: a device that already syncs must keep its space (key of 32 zero bytes)', async () => {
    const k = await deriveKeys(new Uint8Array(32))
    expect(k.spaceId).toBe('lop4bkSWz0c_-TZaQ8-l48Ub1kOLjX8BLdekvos2KBo')
    expect(k.token).toBe('bUrmm8tLSFw4lPutq77fqnZI6LY2ZGcsueJAhSOeqRw')
  })

  it('are the same on two devices that share the key', async () => {
    const key = generateSyncKey()
    const a = await deriveKeys(key)
    const b = await deriveKeys(key)
    expect(a.spaceId).toBe(b.spaceId)
    expect(a.token).toBe(b.token)
    expect(await recordKey(a, 'tasks', 'x')).toBe(await recordKey(b, 'tasks', 'x'))
  })

  it('differ per key and per purpose', async () => {
    const a = await deriveKeys(generateSyncKey())
    const b = await deriveKeys(generateSyncKey())
    expect(a.spaceId).not.toBe(b.spaceId)
    expect(a.token).not.toBe(b.token)
    expect(a.spaceId).not.toBe(a.token)
    expect(a.spaceId).toHaveLength(43)
    expect(a.token).toHaveLength(43)
  })

  it('make record keys that hide table and id, and differ by both', async () => {
    const k = await deriveKeys(generateSyncKey())
    const a = await recordKey(k, 'tasks', 'abc')
    expect(a).toHaveLength(43)
    expect(a).not.toContain('abc')
    expect(await recordKey(k, 'plans', 'abc')).not.toBe(a)
    expect(await recordKey(k, 'tasks', 'abd')).not.toBe(a)
  })

  it('reject a key of the wrong size', async () => {
    await expect(deriveKeys(new Uint8Array(16))).rejects.toThrow()
  })
})

describe('record encryption', () => {
  it('round-trips and keeps the plaintext off the wire', async () => {
    const k = await deriveKeys(generateSyncKey())
    const r = row('id-1', { title: 'Secret plan title' })
    const w = await encryptRow(k, 'plans', r)
    expect(w.updatedAt).toBe(1000)
    expect(JSON.stringify(w)).not.toContain('Secret')
    expect(JSON.stringify(w)).not.toContain('id-1')
    expect(await decryptRow(k, w)).toEqual({ v: 1, table: 'plans', row: r })
  })

  it('puts a protocol version inside the encrypted payload', async () => {
    const k = await deriveKeys(generateSyncKey())
    expect((await decryptRow(k, await encryptRow(k, 'plans', row('a')))).v).toBe(1)
    expect((await decryptRow(k, await encryptRow(k, 'plans', row('a'), 7))).v).toBe(7)
  })

  it('sends study time plans and their sessions as version 2, the rest as version 1', async () => {
    expect(SYNC_VERSION).toBe(2)
    expect(rowVersion('studyItems', row('p:2026-11-09'))).toBe(2)
    expect(rowVersion('plans', row('a', { studyMinutesPerWeek: 180 }))).toBe(2)
    expect(rowVersion('plans', row('a'))).toBe(1)
    expect(rowVersion('tasks', row('a', { studyMinutesPerWeek: 180 }))).toBe(1)
    const k = await deriveKeys(generateSyncKey())
    const w = await encryptRow(k, 'studyItems', row('p:2026-11-09'))
    expect((await decryptRow(k, w)).v).toBe(2)
  })

  it('uses a fresh IV every time', async () => {
    const k = await deriveKeys(generateSyncKey())
    const a = await encryptRow(k, 'plans', row('x'))
    const b = await encryptRow(k, 'plans', row('x'))
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.recordKey).toBe(b.recordKey)
  })

  it('fails when a blob is moved to another record key (AAD binding)', async () => {
    const k = await deriveKeys(generateSyncKey())
    const a = await encryptRow(k, 'tasks', row('a'))
    const b = await encryptRow(k, 'tasks', row('b'))
    await expect(decryptRow(k, { ...a, recordKey: b.recordKey })).rejects.toThrow()
    await expect(decryptRow(k, { ...b, ciphertext: a.ciphertext, iv: a.iv })).rejects.toThrow()
  })

  it('fails when the blob was changed or the key is another', async () => {
    const k = await deriveKeys(generateSyncKey())
    const w = await encryptRow(k, 'tasks', row('a'))
    const flipped = (w.ciphertext[5] === 'A' ? 'B' : 'A')
    await expect(decryptRow(k, { ...w, ciphertext: w.ciphertext.slice(0, 5) + flipped + w.ciphertext.slice(6) })).rejects.toThrow()
    await expect(decryptRow(k, { ...w, iv: b64uEncode(new Uint8Array(12)) })).rejects.toThrow()
    await expect(decryptRow(await deriveKeys(generateSyncKey()), w)).rejects.toThrow()
    await expect(decryptRow(k, { ...w, ciphertext: '***' })).rejects.toThrow()
  })

  it('binds the record key to the table and id inside the blob', async () => {
    // The blob decrypts under its own key only: its inner table and id must hash to the key it sits under.
    const k = await deriveKeys(generateSyncKey())
    const w = await encryptRow(k, 'tasks', row('a'))
    expect((await decryptRow(k, w)).row.id).toBe('a')
    expect(w.recordKey).toBe(await recordKey(k, 'tasks', 'a'))
  })
})
