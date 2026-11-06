import { describe, expect, it } from 'vitest'
import { keyToQrPayload } from '../../sync'
import type { SyncSummary } from '../../sync'
import { checkKeyInput, summaryLines, syncErrorText } from './sync-text'

// A valid 24-word phrase (BIP39 test vector: 32 bytes of zeros).
const WORDS = Array(23).fill('abandon').concat('art').join(' ')

const base: SyncSummary = { pulled: 0, applied: 0, pushed: 0, rejectedStale: 0, invalid: 0, retrying: 0, tooLarge: [] }

describe('checkKeyInput', () => {
  it('tells empty, partial, valid and invalid apart', () => {
    expect(checkKeyInput('  ')).toEqual({ state: 'empty' })
    expect(checkKeyInput('abandon abandon')).toEqual({ state: 'partial', words: 2 })
    expect(checkKeyInput(WORDS)).toEqual({ state: 'valid', kind: 'words' })
    expect(checkKeyInput(`  ${WORDS.toUpperCase()}\n`)).toEqual({ state: 'valid', kind: 'words' })
  })

  it('rejects a bad checksum and an unknown word', () => {
    const wrongOrder = Array(24).fill('abandon').join(' ')
    expect(checkKeyInput(wrongOrder)).toMatchObject({ state: 'invalid' })
    expect(checkKeyInput(WORDS.replace('art', 'zzzzz'))).toMatchObject({ state: 'invalid' })
  })

  it('accepts the text a QR code holds and rejects a damaged one', () => {
    const payload = keyToQrPayload(new Uint8Array(32))
    expect(checkKeyInput(payload)).toEqual({ state: 'valid', kind: 'qr' })
    expect(checkKeyInput('kiln-sync:abc')).toMatchObject({ state: 'invalid' })
  })
})

describe('summaryLines', () => {
  it('reports the counts of a quiet run', () => {
    expect(summaryLines({ ...base, pulled: 4, applied: 3, pushed: 2 })).toEqual(['Received 4, saved 3 new or newer, sent 2.'])
  })

  it('puts the error first and lists every kind of trouble', () => {
    const lines = summaryLines({
      ...base,
      invalid: 2,
      retrying: 1,
      tooLarge: [{ table: 'tasks', id: 'abc' }],
      error: { kind: 'update-required', message: 'x' },
    })
    expect(lines[0]).toMatch(/Update Kiln/)
    expect(lines.join(' ')).toMatch(/2 items could not be read/)
    expect(lines.join(' ')).toMatch(/1 item is waiting for a newer version/)
    expect(lines.join(' ')).toMatch(/1 item is too large to upload: tasks abc/)
  })
})

describe('syncErrorText', () => {
  it('has plain wording for each kind', () => {
    expect(syncErrorText('wrong-key', '')).toMatch(/does not match/)
    expect(syncErrorText('quota', '')).toMatch(/storage is full/)
    expect(syncErrorText('network', '')).toMatch(/Offline/)
    expect(syncErrorText('server', '')).toMatch(/problem/)
    expect(syncErrorText('local', 'disk full')).toMatch(/disk full/)
  })
})
