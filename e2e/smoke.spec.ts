import { expect, test } from '@playwright/test'

test('app loads and shows the Kiln heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Kiln' })).toBeVisible()
})
