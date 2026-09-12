import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator } from '@playwright/test'
import { openSeeded } from './seed'

// The header used to wrap its buttons into three rows on a phone, two of them outside the 64px bar.
for (const width of [320, 360, 390, 1280]) {
  test(`plan header at ${width}: title and star in the bar, the three actions in one row on screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await openSeeded(page, '/plans')
    await page.getByRole('main').getByRole('heading', { level: 2 }).first().getByRole('link').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Modules' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready) // measure in Instrument Sans, not the wider fallback
    const box = async (loc: Locator) => {
      await expect(loc).toBeVisible()
      return (await loc.boundingBox())!
    }
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    const title = await box(page.getByRole('heading', { level: 1 }))
    const star = await box(button('Favorite'))
    const rowLoc = button('Edit plan').locator('..')
    const row = await box(rowLoc)
    const buttons = [await box(button('Edit plan')), await box(button('Reschedule')), await box(button('Delete plan'))]
    const middle = (b: { y: number; height: number }) => b.y + b.height / 2
    expect(middle(star)).toBeCloseTo(middle(title), 0)
    expect(star.x).toBeGreaterThan(title.x + title.width)
    // All three on one line, each fully inside its row (nothing scrolled out of sight).
    for (const b of buttons) {
      expect(b.y).toBeCloseTo(buttons[0]!.y, 0)
      expect(b.x).toBeGreaterThanOrEqual(row.x)
      expect(b.x + b.width).toBeLessThanOrEqual(row.x + row.width)
    }
    expect(row.x + row.width).toBeLessThanOrEqual(width)
    expect(await rowLoc.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    // Phone: the actions sit below the 64px bar; desktop: in it, to the right of the star.
    if (width < 768) expect(buttons[0]!.y).toBeGreaterThanOrEqual(64)
    else expect(middle(buttons[0]!)).toBeCloseTo(middle(star), 0)
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  })
}

test('favorite a plan, edit it, then restore the older version', async ({ page }) => {
  await openSeeded(page, '/plans')
  const firstPlan = page.getByRole('main').getByRole('heading', { level: 2 }).first().getByRole('link')
  const planTitle = (await firstPlan.innerText()).trim()
  const star = page.getByRole('button', { name: `Favorite ${planTitle}` })
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await firstPlan.click()

  // Settings: two seeded plans, so the share shows with a live example.
  await expect(page.getByText(/about \d+ of your \d+ min a day/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Favorite', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('switch', { name: 'Daily practice problem' })).toBeVisible()

  // Rename the first task and save.
  await page.getByRole('button', { name: 'Edit plan' }).click()
  const form = page.getByRole('form', { name: 'Edit plan' })
  const firstTask = form.getByRole('textbox', { name: 'Task name' }).first()
  const original = await firstTask.inputValue()
  await firstTask.fill('Renamed in the editor')
  await form.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText('Plan saved')).toBeVisible()
  const modules = page.getByRole('main').getByRole('heading', { level: 2, name: 'Modules' })
  await expect(modules).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Renamed in the editor' })).toBeVisible()

  const versions = page.getByRole('list', { name: 'Versions' }).getByRole('listitem')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('Renamed 1 task')
  await expect(versions.nth(1)).toContainText('Before your first edit')

  // Restore the version from before the edit: the old name is back, as a new version.
  await versions.nth(1).getByRole('button', { name: 'Restore' }).click()
  const confirm = page.getByRole('dialog', { name: 'Restore this version?' })
  await expect(confirm).toContainText('including changes made on other devices. Progress is kept.')
  await confirm.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText(/^Restored the version from /)).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: original, exact: true })).toBeVisible()
  await expect(versions).toHaveCount(3)
  await expect(versions.first()).toContainText('Restored')
})

test('the editor manages focus, disables the end arrows and checks dependency cycles', async ({ page }) => {
  await openSeeded(page, '/plans')
  await page.getByRole('main').getByRole('heading', { level: 2 }).first().getByRole('link').click()
  const edit = page.getByRole('button', { name: 'Edit plan', exact: true })
  await edit.click()
  const form = page.getByRole('form', { name: 'Edit plan' })
  await expect(form.getByRole('heading', { name: 'Edit plan' })).toBeFocused()

  const module = form.locator('[data-module]').first()
  await expect(module.getByRole('button', { name: /^Move module .* up$/ })).toBeDisabled()
  await expect(module.getByRole('button', { name: /^Move task .* up$/ }).first()).toBeDisabled()

  // Add task focuses the new name field; Details points at its panel.
  await module.getByRole('button', { name: 'Add task' }).click()
  const name = module.getByRole('textbox', { name: 'Task name' }).last()
  await expect(name).toBeFocused()
  await expect(module.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-controls', /^details-/)

  // Deleting the last row moves focus to Add task.
  await module.getByRole('button', { name: /^Delete task / }).last().click()
  await expect(module.getByRole('button', { name: 'Add task' })).toBeFocused()

  // Two tasks that depend on each other are refused with the reason.
  const dependOnOther = async (details: number) => {
    await module.getByRole('button', { name: 'Details' }).nth(details).click()
    await module.getByText(/^Depends on/).first().click()
    const box = module.getByRole('checkbox').first()
    if (!(await box.isChecked())) await module.locator('label:has(input[type=checkbox])').first().click()
    await expect(box).toBeChecked()
  }
  await dependOnOther(1)
  await dependOnOther(0)
  await form.getByRole('button', { name: 'Save plan' }).click()
  await expect(form.getByRole('alert')).toContainText('creates a cycle')

  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(edit).toBeFocused()
})

test('an error under Deadline leaves Pinned to level, and Save plan focuses the unreadable date', async ({ page }) => {
  await openSeeded(page, '/plans')
  await page.getByRole('main').getByRole('heading', { level: 2 }).first().getByRole('link').click()
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click()
  const form = page.getByRole('form', { name: 'Edit plan' })
  await form.locator('[data-module]').first().getByRole('button', { name: 'Details' }).first().click()
  const deadline = form.getByRole('textbox', { name: 'Deadline (optional)' })
  const pinned = form.getByRole('textbox', { name: 'Pinned to (optional)' })
  const offset = async () => (await pinned.boundingBox())!.y - (await deadline.boundingBox())!.y
  expect(Math.abs(await offset())).toBeLessThanOrEqual(1)
  await deadline.fill('soon')
  await deadline.press('Tab')
  await expect(form.getByText('Try a date like Nov 20')).toBeVisible()
  expect(Math.abs(await offset())).toBeLessThanOrEqual(1)
  await form.getByRole('button', { name: 'Save plan' }).click()
  await expect(deadline).toBeFocused()
  await expect(form).toBeVisible()
})
