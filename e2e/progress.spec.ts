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
  await expect(sheet.locator('input[placeholder]')).toHaveCount(0)

  // Errors show on Save, in plain words; the sheet stays open.
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('Add a subject')).toBeVisible()
  await expect(sheet.getByText('Enter the minutes, like 30')).toBeVisible()
  await sheet.getByLabel('Day').fill('nov 12')
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

  // Finishing a task today flips it to done.
  const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  await lesson.getByRole('checkbox').click({ force: true })
  // Main still asks for a rating here; the optional-reviews branch drops it.
  const rating = page.getByRole('dialog', { name: 'How did it go?' })
  await expect(rating.or(lesson.getByText('Done', { exact: true })).first()).toBeVisible()
  if (await rating.isVisible()) await page.keyboard.press('3')
  const done = page.getByRole('link', { name: 'Streak: 2 days, done today' })
  await expect(done).toBeVisible()
  await expect(done).toHaveAttribute('data-counted', 'true')
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
