import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Reads the tokens straight from src/index.css so the test can't drift from the real values.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const tokens = new Map<string, [string, string]>()
for (const m of css.matchAll(/--kiln-([a-z-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g)) {
  tokens.set(m[1]!, [m[2]!, m[3]!])
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const surfaces = ['surface', 'surface-raised', 'surface-muted']
const textOnSurfaces = ['text', 'text-muted', 'accent', 'danger', 'success', 'warning']
// [foreground, background, minimum ratio]: 4.5 for text, 3 for control outlines and focus rings.
const pairs: [string, string, number][] = [
  ...textOnSurfaces.flatMap((fg) => surfaces.map((bg): [string, string, number] => [fg, bg, 4.5])),
  ['accent-contrast', 'accent', 4.5],
  ['danger-contrast', 'danger', 4.5],
  ...['border-strong', 'focus'].flatMap((fg) => surfaces.map((bg): [string, string, number] => [fg, bg, 3])),
]

describe('design tokens', () => {
  it('parses every color token from index.css', () => {
    expect(tokens.size).toBeGreaterThanOrEqual(14)
  })

  for (const [mode, i] of [['light', 0], ['dark', 1]] as const) {
    it.each(pairs)(`${mode}: %s on %s reaches %s:1`, (fg, bg, min) => {
      const f = tokens.get(fg)?.[i]
      const b = tokens.get(bg)?.[i]
      expect(f, fg).toBeDefined()
      expect(b, bg).toBeDefined()
      expect(contrast(f!, b!)).toBeGreaterThanOrEqual(min)
    })
  }
})
