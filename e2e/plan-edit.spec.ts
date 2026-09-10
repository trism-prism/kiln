import { expect, test } from '@playwright/test'
import { openSeeded } from './seed'

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
