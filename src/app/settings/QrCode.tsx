import { useMemo } from 'react'
import { encode } from 'uqr'

/** The QR modules for `text` (true = dark), no quiet zone. */
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: 'M', border: 0 }).data
}

/** SVG path data: one rectangle per horizontal run of dark modules. */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = []
  modules.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x++
        continue
      }
      const start = x
      while (x < row.length && row[x]) x++
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  })
  return parts.join('')
}

/**
 * A QR code as inline SVG. Always black on white with a 4-module quiet zone, whatever the theme,
 * because scanners need that contrast.
 */
export function QrCode({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const modules = useMemo(() => qrModules(text), [text])
  const size = modules.length
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      shapeRendering="crispEdges"
      className={`rounded-md border border-border ${className}`}
    >
      <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#ffffff" />
      <path d={qrPath(modules)} fill="#000000" />
    </svg>
  )
}
