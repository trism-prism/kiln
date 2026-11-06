import { expect, test } from '@playwright/test'

// Design review screenshots, written to docs/design/. Off by default: SCREENSHOTS=1 npx playwright test screenshots
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to write docs/design screenshots')

const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
const routes = { dashboard: '/', todo: '/todo', design: '/design' }

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const [name, path] of Object.entries(routes)) {
      test(`${name} ${size} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        await page.goto(path)
        // Pages are lazy chunks: wait for the page itself, not just the shell.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `docs/design/${name}-${size}-${colorScheme}.png`, fullPage: name === 'design' })
      })
    }
  }
}
