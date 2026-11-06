import { expect, test } from '@playwright/test'
import { mockWorker } from './worker-mock'

test.beforeEach(async ({ context }) => {
  await mockWorker(context)
})

test.describe('onboarding', () => {
  test('shows on the first run and never again after it is skipped', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeVisible()
    await expect(page.getByText('Step 1 of 4: Study time')).toBeVisible()
    await page.getByRole('button', { name: 'Skip setup' }).click()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
  })

  test('is only on the dashboard', async ({ page }) => {
    await page.goto('/todo')
    await expect(page.getByRole('heading', { level: 1, name: 'To Do' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
  })

  test('saves study time, loads a sample plan and does not come back', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Light:/ }).click()
    await expect(page.getByRole('textbox', { name: 'Monday' })).toHaveValue('60')
    await expect(page.getByRole('textbox', { name: 'Sunday' })).toHaveValue('90')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 2 of 4: Start date')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 3 of 4: Reminder')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Load sample plan' }).click()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
    await page.goto('/settings')
    await expect(page.getByRole('textbox', { name: 'Monday' })).toHaveValue('60')
  })

  test('is not shown to someone who already saved settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Save study time' }).click()
    await expect(page.getByText('Study time saved')).toBeVisible()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
  })
})

test('the sync key shows 24 words and a QR code, and validates on a second device', async ({ browser }) => {
  const a = await browser.newContext()
  await mockWorker(a)
  const first = await a.newPage()
  await first.goto('/settings')
  await first.getByRole('button', { name: 'Create a sync key' }).click()
  const list = first.getByRole('list', { name: 'Sync key, 24 words' })
  await expect(list.getByRole('listitem')).toHaveCount(24)
  await expect(first.getByRole('img', { name: 'QR code of your sync key' })).toBeVisible()
  const words = (await list.locator('li span.font-medium').allTextContents()).join(' ')
  expect(words.split(' ')).toHaveLength(24)

  // A second device: no server needed to check the words.
  const b = await browser.newContext()
  await mockWorker(b)
  const second = await b.newPage()
  await second.goto('/settings')
  await second.getByRole('button', { name: 'Join with a key' }).click()
  const box = second.getByRole('textbox', { name: 'Sync key' })
  const join = second.getByRole('button', { name: 'Join', exact: true })

  await box.fill(words.split(' ').slice(0, 5).join(' '))
  await expect(second.getByText('5 of 24 words')).toBeVisible()
  await expect(join).toBeDisabled()

  await box.fill(['zzzzz', ...words.split(' ').slice(1)].join(' '))
  await expect(second.getByText(/not a valid sync key/)).toBeVisible()
  await expect(join).toBeDisabled()

  await box.fill(words)
  await expect(second.getByText('This is a valid sync key.')).toBeVisible()
  await expect(join).toBeEnabled()
  await join.click()
  await expect(second.getByText(/^Sync is on\. Last synced/)).toBeVisible()
  await second.getByRole('button', { name: 'Show key' }).click()
  const joined = (await second.getByRole('list', { name: 'Sync key, 24 words' }).locator('li span.font-medium').allTextContents()).join(' ')
  expect(joined).toBe(words)
  await expect(second.getByTestId('sync-summary')).toContainText('Received 0')

  await a.close()
  await b.close()
})
