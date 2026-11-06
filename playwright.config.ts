import { defineConfig, devices } from '@playwright/test'

// PW_PORT picks another port, so worktrees can run their suites side by side (each then builds and serves its own copy).
// E2E_PORT is accepted as an alias.
const port = Number(process.env.PW_PORT ?? process.env.E2E_PORT ?? 4173)
const custom = !!(process.env.PW_PORT ?? process.env.E2E_PORT)
const origin = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: origin },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The e2e build is the production build plus the sample-plan hook (src/app/devSeed.ts), in its own folder.
    command: `npm run build:e2e && npm run preview -- --outDir dist-e2e --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI && !custom,
    timeout: 120_000,
    // The build points at a pretend Worker; the tests answer its requests (e2e/worker-mock.ts).
    // The VAPID key is a syntactically valid placeholder (0x04 then 64 zero bytes), never used to push.
    env: {
      VITE_API_URL: 'http://127.0.0.1:8787',
      VITE_VAPID_PUBLIC_KEY: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
  },
})
