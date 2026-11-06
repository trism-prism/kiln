import { expect, test } from '@playwright/test'
import { advanceDays, openSeeded } from './seed'

// Design review screenshots, written to docs/design/. Off by default: SCREENSHOTS=1 npx playwright test screenshots
// The dashboard, To Do and calendar are shot with the sample plans, a few days in: one lesson done on day one,
// nothing since, so there are overdue items, a due review and a greyed row.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to write docs/design screenshots')

const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
const routes = { dashboard: '/', todo: '/todo', calendar: '/calendar', design: '/design' }

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const [name, path] of Object.entries(routes)) {
      test(`${name} ${size} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        if (name === 'design') {
          await page.goto(path)
        } else {
          await openSeeded(page, '/todo')
          const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
          await lesson.getByRole('checkbox').click({ force: true })
          await page.keyboard.press('3')
          await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
          await advanceDays(page, 3)
          await page.goto(path)
        }
        // Pages are lazy chunks: wait for the page itself, not just the shell.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (name === 'todo') await expect(page.getByRole('region', { name: /^Overdue/ })).toBeVisible()
        if (name === 'calendar') await expect(page.getByRole('grid')).toBeVisible()
        if (name === 'dashboard') await expect(page.getByText(/Projected finish/).first()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `docs/design/${name}-${size}-${colorScheme}.png`, fullPage: name === 'design' || name === 'calendar' })
      })
    }
  }
}
