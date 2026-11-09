import { expect, test } from '@playwright/test'

const pages = [
  { name: 'Dashboard', path: '/' },
  { name: /^To Do/, path: '/todo', title: 'To Do' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Plans', path: '/plans' },
  { name: 'Brush up', path: '/brush-up' },
  { name: 'Import', path: '/import' },
  { name: 'Settings', path: '/settings' },
]

test('shell loads with landmarks, lang and title', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page).toHaveTitle('Dashboard · Kiln')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('link', { name: 'To Do', exact: true })).toBeVisible()
})

test('each rail item navigates', async ({ page }) => {
  await page.goto('/design')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const p of pages) {
    await nav.getByRole('link', { name: p.name, exact: typeof p.name === 'string' }).click()
    await expect(page).toHaveURL(p.path)
    const title = p.title ?? (p.name as string)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page).toHaveTitle(`${title} · Kiln`)
  }
})

test('skip link and keyboard reach the rail', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Kiln', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'To Do', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/todo')
})

test('skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('phone tab bar and More menu navigate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: /^To Do/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'To Do' })).toBeVisible()
  for (const name of ['Brush up', 'Import', 'Settings']) {
    await nav.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeFocused()
  }
})

test('theme setting overrides the system and persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/settings')
  await page.getByRole('button', { name: /Theme/ }).click()
  await page.getByRole('option', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(22, 21, 19)')
})

test('To Do with no plans offers to import one', async ({ page }) => {
  await page.goto('/todo')
  await expect(page.getByRole('heading', { name: 'No plans yet' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Import a plan' })).toBeVisible()
})

test('an open select list sits on its own opaque surface above the card, in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/settings')
    const trigger = page.getByRole('button', { name: /Theme/ })
    await trigger.click()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    const [popoverBg, cardBg] = await Promise.all([
      list.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor),
      trigger.evaluate((el) => getComputedStyle(el.closest('.shadow-sm')!).backgroundColor),
    ])
    expect(popoverBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(popoverBg).not.toBe(cardBg)
    // The list opens 4px under the field, so the help line below doesn't show through a gap.
    const [l, t] = [await list.locator('..').boundingBox(), await trigger.boundingBox()]
    expect(l!.y - (t!.y + t!.height)).toBeLessThan(6) // 8 before; a fraction over 4 at the end of the rise animation
    await page.keyboard.press('Escape')
  }
})

test('Plans with no plans shows one import button', async ({ page }) => {
  await page.goto('/plans')
  await expect(page.getByRole('heading', { name: 'No plans yet' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Import a plan' })).toHaveCount(1)
})

test('focus moves to the page heading after navigation, not on first load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).not.toBeFocused()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeFocused()
})

test('rail background spans the full height of a long page', async ({ page }) => {
  await page.goto('/design')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const railHeight = await nav.evaluate((el) => el.parentElement!.getBoundingClientRect().height)
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(railHeight).toBeGreaterThanOrEqual(pageHeight)
  await page.mouse.wheel(0, 2000)
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeInViewport()
})

test('saved theme is applied by the inline head script, before the app runs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kiln-theme', 'dark'))
  // Block the app bundle so only index.html's own script can set the theme.
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('logo link is not marked current on other pages', async ({ page }) => {
  await page.goto('/todo')
  await expect(page.getByRole('link', { name: 'Kiln', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Kiln', exact: true })).toHaveAttribute('aria-current', 'page')
})
