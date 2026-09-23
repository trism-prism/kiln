import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Light surface color from src/index.css (--kiln-surface); the dark one is a media-specific <meta theme-color> in index.html.
const SURFACE = '#f7f4ee'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The app shows its own "Update available" toast (src/pwa/register.ts); nothing registers by itself.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Kiln',
        short_name: 'Kiln',
        description: 'Turns any study plan into a daily to-do list with reminders and reviews.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: SURFACE,
        background_color: SURFACE,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Shell, every lazy chunk, fonts and icons. The two plan templates are downloads, not part of the shell.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // The link-preview image is fetched by crawlers, never by the app.
        globIgnores: ['og-image.png'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
