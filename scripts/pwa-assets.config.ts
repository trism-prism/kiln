// Icon source and sizes. Run `npm run icons`; the PNGs and favicon.ico land in public/ and are committed.
// The source SVG is full-bleed with the mark inside the maskable safe zone, so no extra padding is added.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['public/kiln-arch.svg'],
})
