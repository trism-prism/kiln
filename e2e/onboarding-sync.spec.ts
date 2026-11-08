import { expect, test } from '@playwright/test'
import { mockWorker, newRelay } from './worker-mock'

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
    await expect(page.getByRole('heading', { name: 'How many minutes can you study?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Steady/ })).toBeChecked()
    await page.getByRole('radiogroup').locator('label').filter({ hasText: 'Focused' }).click()
    await expect(page.getByRole('row', { name: /Monday/ })).toContainText('90 min')
    await expect(page.getByRole('row', { name: /Sunday/ })).toContainText('120 min')
    await page.getByRole('radiogroup').locator('label').filter({ hasText: 'Light' }).click()
    await expect(page.getByRole('row', { name: /Monday/ })).toContainText('30 min')
    await expect(page.getByRole('row', { name: /Sunday/ })).toContainText('60 min')
    // Editing one day in the table leaves no preset selected and updates the week total.
    await page.getByRole('row', { name: /Wednesday/ }).getByRole('button').click()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('row', { name: /Wednesday/ }).getByRole('button')).toBeFocused()
    await page.getByRole('row', { name: /Wednesday/ }).getByRole('button').click()
    await page.getByRole('button', { name: 'More time on Wednesday' }).click()
    await expect(page.getByRole('textbox', { name: 'Wednesday' })).toHaveValue('45')
    await expect(page.getByTestId('week-total')).toContainText('285 min')
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
    await page.getByRole('radiogroup').locator('label').filter({ hasText: 'Light' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 2 of 4: Start date')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 3 of 4: Reminder')).toBeVisible()
    await page.getByRole('textbox', { name: 'Reminder time' }).fill('0715')
    await page.getByRole('button', { name: /AM or PM/ }).click()
    await page.getByRole('option', { name: 'PM' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Load sample plan', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up Kiln' })).toBeHidden()
    await page.goto('/settings')
    await expect(page.getByRole('row', { name: /Monday/ })).toContainText('30 min')
    await expect(page.getByRole('textbox', { name: 'Daily reminder' })).toHaveValue('7:15')
    await expect(page.getByRole('button', { name: /AM or PM/ }).first()).toContainText('PM') // stored as 19:15
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

// Two browsers, one server: the pairing messages go through a shared in-memory relay (worker-mock.ts), and each
// browser runs the real CPace, so a right code connects them and a wrong one cannot.
test('a second device joins with a 6-digit code, a wrong code is rejected, and Disconnect ends sync on both', async ({ browser }) => {
  const slow = { timeout: 20_000 }
  const relay = newRelay()
  const a = await browser.newContext()
  await mockWorker(a, relay)
  const first = await a.newPage()
  await first.goto('/settings')
  await first.getByRole('button', { name: 'Set up sync' }).click()
  const code = first.getByTestId('pair-code')
  await expect(code).toHaveText(/^\d{3} \d{3}$/, slow)
  await expect(first.getByText(/Expires in [0-3]:\d\d/)).toBeVisible()
  await expect(first.getByText('Waiting for your other device...')).toBeVisible()
  const digits = ((await code.textContent()) ?? '').replace(/\D/g, '')
  expect(digits).toHaveLength(6)

  const b = await browser.newContext()
  await mockWorker(b, relay)
  const second = await b.newPage()
  await second.goto('/settings')
  await second.getByRole('button', { name: 'Join with a code' }).click()
  const field = second.getByRole('textbox', { name: 'Code from your other device' })
  const join = second.getByRole('button', { name: 'Join', exact: true })
  await expect(join).toBeDisabled()

  // A wrong last digit: both screens say so, and the code still works afterwards.
  const wrong = digits.slice(0, 5) + String((Number(digits[5]) + 1) % 10)
  await field.fill(wrong)
  await expect(join).toBeEnabled()
  await join.click()
  await expect(second.getByText(/That code did not match.*2 tries left\./)).toBeVisible(slow)
  await expect(field).toHaveValue('')
  await expect(first.getByText('Someone entered a wrong code. 2 tries left.')).toBeVisible(slow)
  await expect(code).toBeVisible()

  await field.fill(digits.slice(0, 3) + ' ' + digits.slice(3))
  await join.click()
  await expect(second.getByText(/^Sync is on\. Last synced/)).toBeVisible(slow)
  await expect(first.getByText(/^Sync is on\. Last synced/)).toBeVisible(slow)
  await expect(first.getByRole('button', { name: 'Sync a device' })).toBeVisible()
  await expect(first.getByTestId('pair-code')).toBeHidden()

  // Disconnect on the first device: it is off at once, the second finds out on its next run.
  await first.getByRole('button', { name: 'Disconnect device' }).click()
  await expect(first.getByText('This stops sync on this device and on every device it syncs with.')).toBeVisible()
  await first.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Set up sync' })).toBeVisible()
  await second.reload()
  await expect(second.getByRole('button', { name: 'Set up sync' })).toBeVisible(slow)
  await expect(second.getByText('Sync was turned off from another device. Everything on this device stays here.')).toBeVisible(slow)

  await a.close()
  await b.close()
})

test('three wrong codes end the code on both screens', async ({ browser }) => {
  const slow = { timeout: 20_000 }
  const relay = newRelay()
  const a = await browser.newContext()
  await mockWorker(a, relay)
  const first = await a.newPage()
  await first.goto('/settings')
  await first.getByRole('button', { name: 'Set up sync' }).click()
  const digits = (((await first.getByTestId('pair-code').textContent({ timeout: 20_000 })) ?? '').replace(/\D/g, ''))
  const b = await browser.newContext()
  await mockWorker(b, relay)
  const second = await b.newPage()
  await second.goto('/settings')
  await second.getByRole('button', { name: 'Join with a code' }).click()
  const wrong = digits.slice(0, 5) + String((Number(digits[5]) + 1) % 10)
  for (const left of ['2 tries left', '1 try left']) {
    await second.getByRole('textbox', { name: 'Code from your other device' }).fill(wrong)
    await second.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(second.getByText(new RegExp(left))).toBeVisible(slow)
  }
  await second.getByRole('textbox', { name: 'Code from your other device' }).fill(wrong)
  await second.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(second.getByText('Too many wrong tries. Get a new code on your other device.')).toBeVisible(slow)
  await expect(first.getByText('Too many wrong tries, so this code no longer works.')).toBeVisible(slow)
  await expect(first.getByRole('button', { name: 'Get a new code' })).toBeVisible()
  await first.getByRole('button', { name: 'Get a new code' }).click()
  await expect(first.getByTestId('pair-code')).toBeVisible(slow)

  await a.close()
  await b.close()
})
