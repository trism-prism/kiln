import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { animationsDone, openSeeded } from './seed'

// The seeded clock is Monday 9 Nov 2026.
const stat = (page: Page, label: string) => page.getByRole('main').getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]')

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test('the streak chip sits in the tab pages only and opens Streak & progress; Back returns', async ({ page }) => {
  await openSeeded(page, '/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Streak:/ })).toHaveCount(0)
  for (const name of ['To Do', 'Calendar', 'Plans', 'Dashboard']) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${name}`) }).click()
    await expect(page.getByRole('link', { name: 'Streak: 0 days, not done today' })).toBeVisible()
  }
  await expect(page.getByRole('region', { name: 'Streak' })).toHaveCount(0) // no longer on the dashboard or calendar
  await page.getByRole('link', { name: 'Streak: 0 days, not done today' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Streak & progress' })).toBeVisible()
  await expect(page.getByText('Nothing logged in the last year')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
})

test('Back on a page opened directly goes to the dashboard', async ({ page }) => {
  await openSeeded(page, '/progress')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
})

test('logged study time makes today count, and Undo takes it back', async ({ page }) => {
  await openSeeded(page, '/todo')
  await page.getByRole('link', { name: 'Streak: 0 days, not done today' }).click()
  await page.getByRole('button', { name: 'Log study time' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log Study Time', exact: true })
  await expect(sheet.getByLabel('Subject')).toBeFocused()
  await expect(sheet.getByLabel('Day')).toHaveValue('Mon, Nov 9, 2026')
  // No example text in the boxes: the errors give the examples.
  for (const label of ['Subject', 'Minutes']) await expect(sheet.getByLabel(label)).not.toHaveAttribute('placeholder')

  // Errors show on Save, in plain words; the sheet stays open.
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('Add a subject')).toBeVisible()
  await expect(sheet.getByText('Enter the minutes, like 30')).toBeVisible()
  await sheet.getByLabel('Day').fill('tomorrow') // a date with no year would read as its latest past one
  await sheet.getByLabel('Day').blur()
  await expect(sheet.getByText('Pick today or earlier')).toBeVisible()
  await sheet.getByLabel('Day').fill('today')
  await sheet.getByLabel('Day').blur()

  await sheet.getByLabel('Subject').fill('Psychology')
  await sheet.getByLabel('Minutes').fill('1h 30m')
  await sheet.getByLabel('Minutes').press('Enter')
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Logged 1 h 30 min of Psychology')).toBeVisible()

  await expect(stat(page, 'Current streak')).toHaveText('1 day')
  await expect(stat(page, 'Study days')).toHaveText('1')
  await expect(stat(page, 'Time studied')).toHaveText('1 h 30 min')
  await expect(page.getByText('1 h 30 min in the last year')).toBeVisible()
  await expect(page.locator('[data-date="2026-11-09"][data-level]')).not.toHaveAttribute('data-level', '0')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(stat(page, 'Current streak')).toHaveText('0 days')
  await expect(page.getByText('Nothing logged in the last year')).toBeVisible()
})

test('the chip fills once today counts, and a past day logs to that day', async ({ page }) => {
  await openSeeded(page, '/progress')
  await page.getByRole('button', { name: 'Log study time' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log Study Time', exact: true })
  await sheet.getByLabel('Subject').fill('Spanish')
  await sheet.getByLabel('Minutes').fill('20')
  await sheet.getByLabel('Day').fill('nov 8')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('[data-date="2026-11-08"]')).toHaveAttribute('aria-label', '20 min studied on Sun, Nov 8')

  // Yesterday alone: a 1-day streak, but today not done yet.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  const chip = page.getByRole('link', { name: 'Streak: 1 day, not done today' })
  await expect(chip).toBeVisible()
  await expect(chip).not.toHaveAttribute('data-counted')

  const notDone = await chip.evaluate((el) => ({ weight: getComputedStyle(el).fontWeight, border: getComputedStyle(el).borderTopWidth }))
  expect(notDone).toEqual({ weight: '500', border: '1px' })

  // Logging time today flips it to done: filled, and heavier. (One path on purpose: ticking a lesson asks for a
  // rating on main, which feat/optional-reviews removes.)
  await chip.click()
  await page.getByRole('button', { name: 'Log study time' }).click()
  await sheet.getByLabel('Subject').fill('Spanish')
  await sheet.getByLabel('Minutes').fill('1h30')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  const done = page.getByRole('link', { name: 'Streak: 2 days, done today' })
  await expect(done).toBeVisible()
  await expect(done).toHaveAttribute('data-counted', 'true')
  expect(await done.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600')
  await expect(done.locator('svg')).toHaveAttribute('fill', 'currentColor')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the chip is a 44px outlined target, and a day with no year reads as its latest past date', async ({ page }) => {
    await openSeeded(page, '/todo')
    const chip = page.getByRole('link', { name: /^Streak:/ })
    const box = (await chip.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(await chip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px')
    await chip.click()
    await page.getByRole('button', { name: 'Log study time' }).click()
    const day = page.getByRole('dialog', { name: 'Log Study Time', exact: true }).getByLabel('Day')
    await day.fill('oct 5')
    await day.blur()
    await expect(day).toHaveValue('Mon, Oct 5, 2026')
    await day.fill('yesterday')
    await day.blur()
    await expect(day).toHaveValue('Sun, Nov 8, 2026')
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe /progress, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('the page, the sheet with its errors, and the chip', async ({ page }) => {
      await openSeeded(page, '/progress')
      await expect(page.getByRole('group', { name: 'Study activity, last year' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Log study time' }).click()
      const sheet = page.getByRole('dialog', { name: 'Log Study Time', exact: true })
      await sheet.getByRole('button', { name: 'Save' }).click()
      await expect(sheet.getByText('Add a subject')).toBeVisible()
      await animationsDone(page)
      expect(await seriousViolations(page)).toEqual([])
      await sheet.getByRole('button', { name: 'Cancel' }).click()
      await page.goto('/')
      await expect(page.getByRole('link', { name: /^Streak:/ })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}
