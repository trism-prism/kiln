import { defineConfig, devices } from '@playwright/test'

// PW_PORT picks another port, so worktrees can run their suites side by side (each then builds and serves its own copy).
const port = Number(process.env.PW_PORT ?? 4173)

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The e2e build is the production build plus the sample-plan hook (src/app/devSeed.ts), in its own folder.
    command: `npm run build:e2e && npm run preview -- --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI && !process.env.PW_PORT,
    timeout: 120_000,
  },
})
