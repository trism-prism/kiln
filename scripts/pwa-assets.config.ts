// Icon source and sizes. Run `npm run icons`; the PNGs and favicon.ico land in public/ and are committed.
// The source SVG is a rounded charcoal tile with the mark inside the maskable safe zone (80% circle), so no padding is added.
// favicon.ico and pwa-*.png keep the transparent corners. Maskable and apple-touch fill the corners with the tile color
// so they are full-bleed squares; Android and iOS apply their own mask.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const TILE = '#1f1b16' // Same as the tile fill in public/kiln-arch.svg (--kiln-text, light).

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: TILE } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: TILE } },
  },
  images: ['public/kiln-arch.svg'],
})
