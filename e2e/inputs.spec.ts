import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { animationsDone, openSeeded } from './seed'

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

/** Vertical distance between the centre of a select's value text and the centre of its button, in px. */
async function offCentre(button: Locator) {
  return button.evaluate((b) => {
    const value = b.querySelector('span')!
    const range = document.createRange()
    range.selectNodeContents(value)
    const text = range.getBoundingClientRect()
    const box = b.getBoundingClientRect()
    return Math.abs(text.top + text.height / 2 - (box.top + box.height / 2))
  })
}

test('select text sits in the vertical centre of its button', async ({ page }) => {
  await openSeeded(page, '/settings')
  const selects = [page.getByRole('button', { name: /Theme/ }), page.getByRole('button', { name: /Daily reminder: AM or PM/ })]
  for (const s of selects) expect(await offCentre(s)).toBeLessThanOrEqual(1)
  await page.goto('/import?tab=calendar')
  const lms = page.getByRole('button', { name: /Your school's system/ })
  await expect(lms).toBeVisible()
  expect(await offCentre(lms)).toBeLessThanOrEqual(1)
})

test('typing in the time field keeps focus and reads the time on leaving', async ({ page }) => {
  await openSeeded(page, '/settings')
  const time = page.getByRole('textbox', { name: 'Daily reminder' })
  await time.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('7')
  await expect(time).toBeFocused()
  await expect(time).toHaveValue('7')
  await page.keyboard.type('45p')
  await expect(time).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(time).toHaveValue('7:45')
  await expect(page.getByRole('button', { name: /Daily reminder: AM or PM/ })).toContainText('PM')
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
})

test('a date field reads typed dates, keeps a typo, and has a calendar', async ({ page }) => {
  await openSeeded(page, '/settings')
  const date = page.getByRole('textbox', { name: 'Date', exact: true })
  await date.fill('13/45')
  await date.press('Tab')
  await expect(date).toHaveValue('13/45')
  await expect(page.getByText('Try a date like Nov 20')).toBeVisible()
  await expect(date).toHaveAttribute('aria-invalid', 'true')
  await date.fill('fri')
  await expect(page.getByText('Try a date like Nov 20')).toBeHidden()
  await date.press('Enter')
  await expect(date).toHaveValue('Fri, Nov 13, 2026')
  await expect(date).toBeFocused()

  const choose = page.getByRole('button', { name: 'Choose a date' })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await choose.click()
    const dialog = page.getByRole('dialog', { name: 'Choose a date' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Change month' })).toBeVisible()
    await animationsDone(page)
    expect(await seriousViolations(page)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(choose).toBeFocused()
  }
  await choose.click()
  await page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: /November 20, 2026/ }).click()
  await expect(date).toHaveValue('Fri, Nov 20, 2026')
  await page.getByRole('button', { name: 'Add day off' }).click()
  await expect(page.getByRole('list', { name: 'Days off' })).toContainText('2026-11-20')
  await expect(date).toHaveValue('')
})
