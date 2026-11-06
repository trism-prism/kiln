import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme}`, () => {
    test.use({ colorScheme })
    for (const path of ['/', '/todo', '/design']) {
      test(`${path} has no serious or critical violations`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).analyze()
        const bad = violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
        expect(bad).toEqual([])
      })
    }
  })
}
