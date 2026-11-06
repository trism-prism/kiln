import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openSeeded } from './seed'

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme}`, () => {
    test.use({ colorScheme })
    for (const path of ['/', '/todo', '/design', '/settings', '/privacy', '/terms', '/licenses']) {
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

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

// With sample plans loaded: the screens that have real content.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe with sample plans, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('/todo (with a done row and the rating sheet open)', async ({ page }) => {
      await openSeeded(page, '/todo')
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await expect(lesson).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await lesson.getByRole('checkbox').click({ force: true })
      await expect(page.getByRole('dialog', { name: 'How did it go?' })).toBeVisible()
      await page.waitForTimeout(800)
      expect(await seriousViolations(page)).toEqual([])
      await page.keyboard.press('3')
      await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/ dashboard', async ({ page }) => {
      await openSeeded(page, '/')
      await expect(page.getByText(/Expected finish/).first()).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/todo preferences dialog and add-to-do form', async ({ page }) => {
      await openSeeded(page, '/todo')
      await page.getByRole('button', { name: 'To-do list preferences' }).click()
      await expect(page.getByRole('dialog', { name: 'To-do list preferences' })).toBeVisible()
      await page.waitForTimeout(800) // let the dialog finish its entrance before axe reads its colors
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Done' }).click()
      await page.getByRole('button', { name: 'Add to-do' }).click()
      await expect(page.getByRole('dialog', { name: 'Add to-do' })).toBeVisible()
      await page.waitForTimeout(800)
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/tasks page (done task)', async ({ page }) => {
      await openSeeded(page, '/todo')
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await lesson.getByRole('link').first().click()
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Mark done' }).click()
      await expect(page.getByRole('dialog', { name: 'How did it go?' })).toBeVisible()
      await page.waitForTimeout(800) // let the sheet finish its entrance before axe reads its colors
      await page.keyboard.press('4')
      await expect(page.getByText(/^Completed /)).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/plans and /plans/:id', async ({ page }) => {
      await openSeeded(page, '/plans')
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('heading', { level: 2 }).first().getByRole('link').click()
      await expect(page.getByRole('heading', { level: 2, name: 'Modules' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/brush-up with a due review', async ({ page }) => {
      await openSeeded(page, '/todo')
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await lesson.getByRole('checkbox').click({ force: true })
      await page.keyboard.press('1')
      await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Brush up' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Mastery by topic' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}
