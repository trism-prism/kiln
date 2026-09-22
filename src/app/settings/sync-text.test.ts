import { describe, expect, it } from 'vitest'
import type { SyncSummary } from '../../sync'
import { clock, pairErrorText, summaryLines, syncErrorText, triesLeft } from './sync-text'

const base: SyncSummary = { pulled: 0, applied: 0, pushed: 0, rejectedStale: 0, invalid: 0, retrying: 0, tooLarge: [] }

describe('pairing text', () => {
  it('tells every start failure apart', () => {
    expect(pairErrorText('full')).toMatch(/Too many devices are pairing/)
    expect(pairErrorText('slow')).toMatch(/Wait a minute/)
    expect(pairErrorText('network')).toMatch(/Could not reach the server/)
    expect(pairErrorText('server')).toMatch(/problem/)
  })

  it('formats the countdown and the tries left', () => {
    expect(clock(161)).toBe('2:41')
    expect(clock(180)).toBe('3:00')
    expect(clock(0.2)).toBe('0:01')
    expect(clock(-5)).toBe('0:00')
    expect(triesLeft(1)).toBe('1 try left')
    expect(triesLeft(2)).toBe('2 tries left')
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
    expect(syncErrorText('wrong-key', '')).toMatch(/does not accept this device's sync link/)
    expect(syncErrorText('quota', '')).toMatch(/storage is full/)
    expect(syncErrorText('network', '')).toMatch(/Offline/)
    expect(syncErrorText('server', '')).toMatch(/problem/)
    expect(syncErrorText('disconnected', '')).toBe('Sync was turned off from another device. Everything on this device stays here.')
    expect(syncErrorText('local', 'disk full')).toMatch(/disk full/)
  })
})
