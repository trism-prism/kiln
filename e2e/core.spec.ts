import { expect, test, type Page } from '@playwright/test'
import { advanceDays, openSeeded } from './seed'

const badgeCount = async (page: Page) => {
  const name = (await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).first().getAttribute('aria-label')) ?? ''
  return Number(/, (\d+) items? due/.exec(name)?.[1] ?? 0)
}

test('seed, To Do matches the badge, complete a lesson, review comes back and shows in brush up', async ({ page }) => {
  await openSeeded(page, '/todo')
  await expect(page.getByRole('heading', { level: 1, name: 'To Do' })).toBeVisible()
  const today = page.getByRole('region', { name: 'Today' })
  await expect(today).toBeVisible()

  // Today's open items = the badge.
  const open = today.getByRole('checkbox', { checked: false })
  await expect.poll(async () => open.count()).toBeGreaterThan(1)
  const before = await open.count()
  await expect.poll(() => badgeCount(page)).toBe(before)

  // A daily LeetCode problem is listed with a link and a difficulty.
  const daily = today.getByRole('listitem').filter({ hasText: 'Daily problem' }).first()
  await expect(daily.getByRole('link', { name: /Solve in Python/ })).toHaveAttribute('href', /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/)
  await expect(daily.getByText(/^LeetCode (Easy|Medium|Hard)$/)).toBeVisible()

  // Complete a lesson with "Good" (key 3).
  const lesson = today.getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  const title = (await lesson.getByRole('link').first().innerText()).trim()
  await lesson.getByRole('checkbox').click({ force: true })
  const sheet = page.getByRole('dialog', { name: 'How did it go?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Again/ })).toBeVisible()
  await page.keyboard.press('3')
  await expect(sheet).toBeHidden()
  await expect(lesson.getByRole('checkbox')).toBeChecked()
  await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
  await expect.poll(() => badgeCount(page)).toBe(before - 1)

  // Greyed but still in place and openable.
  await lesson.getByRole('link').first().click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByText(/^Completed /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rate again' })).toBeVisible()
  await page.goBack()

  // Three days later the first review is due, listed as its own item.
  await advanceDays(page, 3)
  await expect(page.getByRole('listitem').filter({ hasText: `Review: ${title}` })).toBeVisible()
  await expect.poll(() => badgeCount(page)).toBeGreaterThan(0)

  // Brush up lists it as due, with a recall bar, and Review now rates it.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Brush up' }).click()
  const entry = page.getByRole('main').getByRole('listitem').filter({ hasText: title })
  await expect(entry).toBeVisible()
  await expect(entry.getByText('Due', { exact: true })).toBeVisible()
  await expect(entry.getByRole('meter', { name: 'Recall' })).toBeVisible()
  await entry.getByRole('button', { name: /^Review now/ }).click()
  await page.getByRole('button', { name: /^Easy/ }).click()
  await expect(page.getByText(`Reviewed: ${title}`)).toBeVisible()
  await expect(entry.getByText('Due', { exact: true })).toBeHidden()
})

test('undo from the toast puts a completion back', async ({ page }) => {
  await openSeeded(page, '/todo')
  const today = page.getByRole('region', { name: 'Today' })
  const lesson = today.getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  await expect(lesson).toBeVisible()
  const before = await today.getByRole('checkbox', { checked: false }).count()
  await lesson.getByRole('checkbox').click({ force: true })
  await page.getByRole('button', { name: /^Hard/ }).click()
  await expect(lesson.getByRole('checkbox')).toBeChecked()
  // A toast with an action stays until dismissed.
  await page.clock.fastForward(30_000)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(lesson.getByRole('checkbox')).not.toBeChecked()
  await expect.poll(() => today.getByRole('checkbox', { checked: false }).count()).toBe(before)
})

test('overdue work is pinned on top and can be rescheduled', async ({ page }) => {
  await openSeeded(page, '/todo')
  await advanceDays(page, 2)
  const overdue = page.getByRole('region', { name: /^Overdue/ })
  await expect(overdue).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: /^Reschedule overdue/ }).click()
  await expect(page.getByText(/^Moved \d+ overdue tasks?: /)).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  await expect(page.getByRole('region', { name: /^Overdue/ })).toBeHidden()
})

test('to-do list preferences: choose the days, kept after a reload', async ({ page }) => {
  await openSeeded(page, '/todo')
  await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Tomorrow' })).toBeHidden()
  await page.getByRole('button', { name: 'To-do list preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'To-do list preferences' })
  await expect(dialog.getByRole('checkbox', { name: 'Show personal to-dos' })).toBeChecked()
  await dialog.getByRole('radiogroup', { name: 'Show tasks until' }).locator('label', { hasText: 'Next week' }).click()
  await dialog.getByLabel('Until day').fill('31')
  await expect(dialog.getByText('Pick a month and a day')).toBeVisible()
  await expect(dialog.getByLabel('Until day')).toHaveAccessibleDescription('Pick a month and a day')
  await dialog.getByLabel('Until day').fill('')
  await expect(dialog.getByText('Pick a month and a day')).toBeHidden()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Tomorrow' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Tomorrow' })).toBeVisible()
})

test('personal to-dos: add with minutes, mark done, edit, delete', async ({ page }) => {
  await openSeeded(page, '/todo')
  await page.getByRole('button', { name: 'Add to-do' }).click()
  const form = page.getByRole('dialog', { name: 'Add to-do' })
  await form.getByRole('button', { name: 'Add to-do' }).click()
  await expect(form.getByText('Enter a title.')).toBeVisible()
  await form.getByLabel('Title').fill('Buy lab notebook')
  for (const bad of ['0x1A', '1e2']) {
    await form.getByLabel('Minutes (optional)').fill(bad)
    await form.getByRole('button', { name: 'Add to-do' }).click()
    await expect(form.getByText('Enter whole minutes from 0 to 1440, or leave it empty.')).toBeVisible()
  }
  await expect(form.getByLabel('Day (optional)')).toHaveValue('') // not prefilled: the hint says no day means today
  await form.getByLabel('Minutes (optional)').fill('20')
  await form.getByRole('button', { name: 'Add to-do' }).click()
  // The row appears (live query) while the form is still saving; the dialog's scrim covers the page until it closes.
  await expect(form).toBeHidden()
  const row = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: 'Buy lab notebook' })
  await expect(row).toContainText('To-do · 20 min')
  await row.locator('label').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await expect(row.getByText('Done', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Edit Buy lab notebook' }).click()
  await page.getByLabel('Title').fill('Buy two lab notebooks')
  await page.getByRole('button', { name: 'Save' }).click()
  const renamed = page.getByRole('listitem').filter({ hasText: 'Buy two lab notebooks' })
  await expect(renamed).toBeVisible()
  await renamed.getByRole('button', { name: 'Delete Buy two lab notebooks' }).click()
  // The Undo toast also names the to-do, so check the list (main) and the toast separately.
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: 'Buy two lab notebooks' })).toBeHidden()
  await expect(page.getByText('Deleted: Buy two lab notebooks')).toBeVisible()
})

test('dashboard shows one card per plan', async ({ page }) => {
  await openSeeded(page, '/')
  const cards = page.getByRole('heading', { level: 2 })
  await expect(cards).toHaveCount(2)
  await expect(page.getByText('Essential tasks')).toHaveCount(2)
  await expect(page.getByText('Mastery')).toHaveCount(2)
  await expect(page.getByText(/Expected finish/).first()).toBeVisible()
  await expect(page.getByText(/Next: /).first()).toBeVisible()
})

test('plan page lists modules and opens a task', async ({ page }) => {
  await openSeeded(page, '/plans')
  await page.getByRole('heading', { level: 2 }).first().getByRole('link').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Modules' })).toBeVisible()
  const modules = page.locator('details')
  expect(await modules.count()).toBeGreaterThan(2)
  await expect(modules.first()).toHaveAttribute('open', '')
  await modules.first().getByRole('listitem').first().getByRole('link').click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible()
})

test('deleting a plan asks first and removes it', async ({ page }) => {
  await openSeeded(page, '/plans')
  const first = page.getByRole('heading', { level: 2 }).first().getByRole('link')
  const name = await first.innerText()
  await first.click()
  await page.getByRole('button', { name: 'Delete plan' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete this plan?' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete plan' }).click()
  await expect(page).toHaveURL('/plans')
  await expect(page.getByRole('link', { name, exact: true })).toBeHidden()
})

test('skip and pin on the task page', async ({ page }) => {
  await openSeeded(page, '/todo')
  const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
  await lesson.getByRole('link').first().click()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByText('Skipped', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Unskip' }).click()
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible()
  await page.getByLabel('Pin to date').fill('2026-11-20')
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(page.getByText('Pinned to', { exact: true })).toBeVisible()
  await expect(page.getByText('Fri, Nov 20, 2026').first()).toBeVisible()
})
