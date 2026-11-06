import { describe, expect, it } from 'vitest'
import {
  b64uEncode,
  decryptRow,
  deriveKeys,
  encryptRow,
  generateSyncKey,
  keyToMnemonic,
  keyToQrPayload,
  mnemonicToKey,
  qrPayloadToKey,
  recordKey,
} from './crypto'

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, updatedAt: 1000, deleted: false, deviceId: 'd', ...extra })

describe('sync key forms', () => {
  it('round-trips through 24 words', () => {
    const key = generateSyncKey()
    const words = keyToMnemonic(key)
    expect(words.split(' ')).toHaveLength(24)
    expect(mnemonicToKey(words)).toEqual(key)
  })

  it('accepts any case and spacing', () => {
    const key = generateSyncKey()
    const messy = '  ' + keyToMnemonic(key).toUpperCase().split(' ').join(' \n ') + ' '
    expect(mnemonicToKey(messy)).toEqual(key)
  })

  it('rejects a bad checksum, an unknown word and a wrong length', () => {
    const words = keyToMnemonic(generateSyncKey()).split(' ')
    // Changing the last word changes the checksum bits (a 1 in 256 chance it still matches, so try a few).
    const swapped = ['abandon', 'zoo', 'about', 'ability'].filter((w) => w !== words[23]).map((w) => [...words.slice(0, 23), w].join(' '))
    expect(swapped.some((s) => { try { mnemonicToKey(s); return false } catch { return true } })).toBe(true)
    expect(() => mnemonicToKey([...words.slice(0, 23), 'notaword'].join(' '))).toThrow(/not a valid sync key/)
    expect(() => mnemonicToKey(words.slice(0, 12).join(' '))).toThrow(/24 words/)
    // The classic 24-word test phrase with a wrong final word is invalid.
    expect(() => mnemonicToKey(Array(24).fill('abandon').join(' '))).toThrow(/not a valid sync key/)
  })

  it('round-trips through the QR payload and rejects other text', () => {
    const key = generateSyncKey()
    const qr = keyToQrPayload(key)
    expect(qr.startsWith('kiln-sync:')).toBe(true)
    expect(qrPayloadToKey(qr)).toEqual(key)
    expect(() => qrPayloadToKey('https://example.com')).toThrow()
    expect(() => qrPayloadToKey('kiln-sync:abc')).toThrow()
  })
})

describe('derived secrets', () => {
  it('are the same on two devices that share the key (words in, same ids out)', async () => {
    const words = keyToMnemonic(generateSyncKey())
    const a = await deriveKeys(mnemonicToKey(words))
    const b = await deriveKeys(mnemonicToKey(words))
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
    expect(await decryptRow(k, w)).toEqual({ table: 'plans', row: r })
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
