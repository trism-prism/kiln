import { expect, test, type Page } from '@playwright/test'
import { mockWorker } from './worker-mock'

test.beforeEach(async ({ context }) => {
  await mockWorker(context)
})

async function ready(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
}

test('the manifest is served and valid', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const res = await page.request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m).toMatchObject({ name: 'Kiln', short_name: 'Kiln', start_url: '/', scope: '/', display: 'standalone', theme_color: '#f7f4ee', background_color: '#f7f4ee' })
  const icons = m.icons as { src: string; sizes: string; type: string; purpose?: string }[]
  expect(icons.some((i) => i.sizes === '192x192' && i.type === 'image/png')).toBe(true)
  expect(icons.some((i) => i.sizes === '512x512' && i.purpose === undefined)).toBe(true)
  expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  for (const icon of icons) {
    const r = await page.request.get(`/${icon.src}`)
    expect(r.ok(), icon.src).toBe(true)
    expect(r.headers()['content-type']).toContain('image/png')
  }
  // iOS and the toolbar color in light and dark.
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon-180x180.png')
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)
  expect((await page.request.get('/apple-touch-icon-180x180.png')).ok()).toBe(true)
})

test('the service worker registers and takes control', async ({ page }) => {
  await ready(page)
  expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active?.scriptURL))).toMatch(/\/sw\.js$/)
  await page.reload()
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
})

test('reloading offline works after the first visit', async ({ page, context }) => {
  await ready(page)
  await page.reload() // now controlled by the worker
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  // Another address and a lazily loaded page also come from the cache.
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await context.setOffline(false)
})

test('the Worker is never cached by the service worker', async ({ page }) => {
  await ready(page)
  await page.reload()
  await page.goto('/settings')
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url)
    return urls
  })
  expect(cached.length).toBeGreaterThan(10)
  expect(cached.some((u) => u.startsWith('http://127.0.0.1:8787'))).toBe(false)
})

test('blocked notifications are explained instead of offering the button', async ({ page }) => {
  // Headless Chromium starts with notifications denied.
  await page.goto('/settings')
  await expect(page.getByTestId('push-state')).toContainText('Notifications are blocked for Kiln')
  await expect(page.getByRole('button', { name: 'Turn on reminders' })).toBeHidden()
})

test('Settings offers reminders, install help and the privacy page', async ({ page }) => {
  // Headless Chromium reports 'denied' even after a grant, so show the not-yet-asked state.
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }))
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Turn on reminders' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Install' })).toBeVisible()
  await page.getByRole('link', { name: 'Privacy: what Kiln stores and sends' }).click()
  await expect(page).toHaveURL('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How to delete your data' })).toBeVisible()
})

test('the daily ping sends only a random id, once a day', async ({ browser }) => {
  const context = await browser.newContext()
  const hits = await mockWorker(context)
  const page = await context.newPage()
  await page.goto('/')
  await expect.poll(() => hits.filter((h) => h.path === '/ping').length).toBe(1)
  const body = hits.find((h) => h.path === '/ping')!.body as Record<string, string>
  expect(Object.keys(body)).toEqual(['deviceId'])
  expect(body.deviceId).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  await page.reload()
  await page.waitForTimeout(500)
  expect(hits.filter((h) => h.path === '/ping')).toHaveLength(1)
  await context.close()
})

test('the app icon badge follows today\'s task count', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: (number | null)[] = []
    ;(window as unknown as { __badge: (number | null)[] }).__badge = calls
    Object.defineProperty(navigator, 'setAppBadge', { value: async (n: number) => void calls.push(n), configurable: true })
    Object.defineProperty(navigator, 'clearAppBadge', { value: async () => void calls.push(null), configurable: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip setup' }).waitFor()
  // Step through to the plan step, then load the sample plan.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Load sample plan', exact: true }).click()
  await expect(page.getByText('Sample plan loaded')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badge: (number | null)[] }).__badge.at(-1) ?? 0)).toBeGreaterThan(0)
})
