// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { keyToQrPayload } from '../../sync'
import { QrCode, qrModules, qrPath } from './QrCode'

afterEach(cleanup)

const payload = keyToQrPayload(crypto.getRandomValues(new Uint8Array(32)))

describe('QR code of the sync key', () => {
  it('encodes the payload as a square with finder patterns in three corners', () => {
    expect(payload).toMatch(/^kiln-sync:[A-Za-z0-9_-]{43}$/)
    const m = qrModules(payload)
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect(m.every((row) => row.length === n)).toBe(true)
    // A finder pattern: 7x7 dark ring, light ring, 3x3 dark center.
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const edge = x === 0 || y === 0 || x === 6 || y === 6
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
          expect(m[y0 + y]![x0 + x]).toBe(edge || core)
        }
    }
    finder(0, 0)
    finder(n - 7, 0)
    finder(0, n - 7)
  })

  it('is deterministic: the same text gives the same code', () => {
    expect(qrModules(payload)).toEqual(qrModules(payload))
    expect(qrModules(payload)).not.toEqual(qrModules(payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A')))
  })

  it('draws runs of dark modules as one path', () => {
    expect(qrPath([[true, true, false, true], [false, false, false, false]])).toBe('M0 0h2v1h-2zM3 0h1v1h-1z')
  })

  it('renders an accessible SVG that is black on white in any theme', () => {
    render(<QrCode text={payload} label="QR code of your sync key" />)
    const svg = screen.getByRole('img', { name: 'QR code of your sync key' })
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(100)
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff')
  })
})
