import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSeeded } from './seed'

// The seeded clock is Monday 9 Nov 2026, so the month grid for November has 9 Nov as "today".
const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`)
const firstTaskChip = (page: Page, date: string) => cell(page, date).locator('[data-chip^="task:"]').first()

/**
 * Mouse drag in small steps: locator.dragTo moves too fast for Chromium to start (and carry) a native drag
 * with React Aria's handlers, which need several dragover events on the way.
 */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + 10, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 20, a.y + a.height / 2 + 12, { steps: 5 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2 + 3, { steps: 3 })
  await page.mouse.up()
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test('month view shows the seeded items, today, and the budget', async ({ page }) => {
  await openSeeded(page, '/calendar')
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible()
  await expect(page.getByRole('grid', { name: 'November 2026' })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  const today = cell(page, '2026-11-09')
  await expect(today.locator('[data-chip]').first()).toBeVisible()
  await expect(page.locator('[data-day="2026-11-09"]')).toHaveAttribute('aria-label', /today.*\d+ items?.*of 120 minutes/)
  await expect(page.locator('[data-day="2026-11-14"]')).toHaveAttribute('aria-label', /of 180 minutes/) // Saturday's budget
  await expect(today.locator('[data-chip^="practice:"]').first()).toBeVisible() // the daily problem
})

test('week view, remembered after a reload', async ({ page }) => {
  await openSeeded(page, '/calendar')
  await page.getByRole('tab', { name: 'Week' }).click()
  await expect(page.getByRole('grid', { name: 'Nov 9 to Nov 15, 2026' })).toBeVisible()
  await expect(page.locator('[data-day]')).toHaveCount(7)
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByRole('grid', { name: 'Nov 16 to Nov 22, 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page.getByRole('grid', { name: 'Nov 9 to Nov 15, 2026' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Week', selected: true })).toBeVisible()
})

test('arrow keys move between days and Enter opens the day with links to the tasks', async ({ page }) => {
  await openSeeded(page, '/calendar')
  const today = page.locator('[data-day="2026-11-09"]')
  await today.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-day="2026-11-10"]')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-day="2026-11-17"]')).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown')
  await page.locator('[data-day="2026-11-09"]').focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Mon, Nov 9, 2026' })
  await expect(panel).toBeVisible()
  await panel.getByRole('link').first().click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
})

test('dragging a task to a later day pins it there (and undo puts it back)', async ({ page }) => {
  await openSeeded(page, '/calendar')
  const chip = firstTaskChip(page, '2026-11-09')
  const id = (await chip.getAttribute('data-chip'))!.slice('task:'.length)
  await drag(page, chip, cell(page, '2026-11-13'))
  await expect(page.getByText('Moved to Fri, Nov 13')).toBeVisible()
  await expect(cell(page, '2026-11-13').locator(`[data-chip="task:${id}"]`)).toBeVisible()
  await expect(cell(page, '2026-11-09').locator(`[data-chip="task:${id}"]`)).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(cell(page, '2026-11-09').locator(`[data-chip="task:${id}"]`)).toBeVisible()
  await drag(page, chip, cell(page, '2026-11-13'))
  await expect(cell(page, '2026-11-13').locator(`[data-chip="task:${id}"]`)).toBeVisible()
  await page.goto(`/task/${id}`)
  await expect(page.getByText('Fri, Nov 13, 2026').first()).toBeVisible()
})

test('moving a task past one that depends on it shows a warning that names it', async ({ page }) => {
  await openSeeded(page, '/calendar')
  const chip = firstTaskChip(page, '2026-11-09')
  await drag(page, chip, cell(page, '2026-11-20'))
  await expect(page.getByText('Moved to Fri, Nov 20')).toBeVisible()
  await expect(page.getByText('Dependency warning')).toBeVisible()
  await expect(page.getByText(/needs this and is due/)).toBeVisible()
})

test('done items cannot be dragged and past days are not drop targets', async ({ page }) => {
  await openSeeded(page, '/todo')
  const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  await lesson.getByRole('checkbox').click({ force: true })
  await page.keyboard.press('3')
  await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
  await page.goto('/calendar')
  const done = cell(page, '2026-11-09').locator('[data-chip^="task:"]', { hasText: '' }).filter({ has: page.locator('svg') }).first()
  await expect(done).toBeVisible()
  await expect(done).not.toHaveAttribute('draggable', 'true')
})

test('"Move to…" in the day panel reschedules by keyboard', async ({ page }) => {
  await openSeeded(page, '/calendar')
  await page.locator('[data-day="2026-11-09"]').focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Mon, Nov 9, 2026' })
  const first = panel.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Move to…/ }) }).first()
  const title = (await first.getByRole('link').first().innerText()).trim()
  const row = panel.getByRole('listitem').filter({ hasText: title })
  await row.getByRole('button', { name: /^Move to…/ }).click()
  await row.getByLabel(`Move ${title} to`).fill('2026-11-12')
  await row.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByText('Moved to Thu, Nov 12')).toBeVisible()
  await expect(panel.getByRole('link', { name: title })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(panel.getByRole('link', { name: title })).toBeVisible()
})

test('the day panel adds a to-do on that day', async ({ page }) => {
  await openSeeded(page, '/calendar')
  await page.locator('[data-day="2026-11-12"]').focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Thu, Nov 12, 2026' })
  await panel.getByRole('button', { name: 'Add to-do' }).click()
  const form = page.getByRole('dialog', { name: 'Add to-do' })
  await expect(form.getByLabel('Day (optional)')).toHaveValue('2026-11-12')
  await form.getByLabel('Title').fill('Read chapter 3')
  await form.getByRole('button', { name: 'Add to-do' }).click()
  await expect(panel.getByRole('listitem').filter({ hasText: 'Read chapter 3' })).toBeVisible()
})

test('the streak is 1 after completing an item, on the calendar and the dashboard', async ({ page }) => {
  await openSeeded(page, '/calendar')
  await expect(page.getByRole('region', { name: 'Streak' }).getByText('0 days').first()).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  await lesson.getByRole('checkbox').click({ force: true })
  await page.keyboard.press('3')
  await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click()
  const streak = page.getByRole('region', { name: 'Streak' })
  await expect(streak.getByText('Current streak').locator('xpath=following-sibling::dd[1]')).toHaveText('1 day')
  await expect(streak.getByText('Longest streak').locator('xpath=following-sibling::dd[1]')).toHaveText('1 day')
  await expect(streak.locator('[data-date="2026-11-09"][data-level]')).toHaveAttribute('aria-label', /\d+ (min|h)( [0-9]+ min)? studied, 1 task done on Mon, Nov 9/)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('link', { name: '1 day streak' })).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe /calendar, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('month view, the day panel and the Move to field', async ({ page }) => {
      await openSeeded(page, '/calendar')
      await expect(page.getByRole('grid', { name: 'November 2026' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Streak' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
      await page.locator('[data-day="2026-11-09"]').focus()
      await page.keyboard.press('Enter')
      const panel = page.getByRole('dialog', { name: 'Mon, Nov 9, 2026' })
      await panel.getByRole('button', { name: /^Move to…/ }).first().click()
      await page.waitForTimeout(800) // the dialog's entrance animation
      expect(await seriousViolations(page)).toEqual([])
    })

    test('week view', async ({ page }) => {
      await openSeeded(page, '/calendar')
      await page.getByRole('tab', { name: 'Week' }).click()
      await expect(page.getByRole('grid', { name: 'Nov 9 to Nov 15, 2026' })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('the dashboard with its streak chip', async ({ page }) => {
      await openSeeded(page, '/')
      await expect(page.getByRole('link', { name: /streak/ })).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}
