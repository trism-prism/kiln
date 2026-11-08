import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { animationsDone, openSeeded } from './seed'

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme}`, () => {
    test.use({ colorScheme })
    for (const path of ['/', '/todo', '/design', '/settings', '/progress', '/privacy', '/terms', '/licenses']) {
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

    test('/todo (with a done row)', async ({ page }) => {
      await openSeeded(page, '/todo')
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await expect(lesson).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await lesson.getByRole('checkbox').click({ force: true })
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
      await page.getByRole('button', { name: 'To-do List Preferences' }).click()
      await expect(page.getByRole('dialog', { name: 'To-do List Preferences' })).toBeVisible()
      await animationsDone(page)
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Done' }).click()
      await page.getByRole('button', { name: 'Add to-do' }).click()
      await expect(page.getByRole('dialog', { name: 'Add to-do' })).toBeVisible()
      await animationsDone(page)
      expect(await seriousViolations(page)).toEqual([])
    })

    test('/tasks page (done task)', async ({ page }) => {
      await openSeeded(page, '/todo')
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await lesson.getByRole('link').first().click()
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Mark done' }).click()
      await expect(page.getByText(/^Completed /)).toBeVisible()
      await animationsDone(page) // the Undo toast and the status fade in; axe must read their final colors
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
      await openSeeded(page, '/todo', { reviews: true })
      const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
      await lesson.getByRole('checkbox').click({ force: true })
      await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Brush up' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Mastery by topic' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}

// Study time plans: the Import page card, both sheets (with the warning line), the plan page and To Do.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe with a study time plan, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('Import card, Add and Edit Study Time, the plan page and To Do', async ({ page }) => {
      await page.clock.install({ time: new Date(2026, 10, 9, 9, 0, 0) })
      await page.goto('/import')
      await expect(page.getByRole('heading', { level: 2, name: 'Study time' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Add study time' }).click()
      const sheet = page.getByRole('dialog', { name: 'Add Study Time' })
      await sheet.getByRole('button', { name: 'Add', exact: true }).click()
      await sheet.getByLabel('Time per week').fill('20h')
      await expect(sheet.getByText(/more than the 14 h/)).toBeVisible()
      await animationsDone(page)
      expect(await seriousViolations(page)).toEqual([])
      await sheet.getByLabel('Subject').fill('Psychology')
      await sheet.getByLabel('Time per week').fill('3h')
      await sheet.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Sessions' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Edit plan' }).click()
      await expect(page.getByRole('dialog', { name: 'Edit Study Time' })).toBeVisible()
      await animationsDone(page)
      expect(await seriousViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.goto('/todo')
      await expect(page.getByRole('main').getByText('Study Psychology', { exact: true }).first()).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}
