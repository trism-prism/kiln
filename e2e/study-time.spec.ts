// Study time plans: a subject and a time per week, planned as one session a day.
// The clock is fixed at Monday 9 Nov 2026 with the default budget (120 min Mon-Fri, 180 Sat-Sun, 14 h a week):
// 3 h a week is 30 min on Monday and 25 on the other days.
import { expect, test, type Page } from '@playwright/test'
import { DAY1 } from './seed'

async function fresh(page: Page, path = '/import') {
  await page.clock.install({ time: DAY1 })
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

async function addStudy(page: Page, subject: string, time: string) {
  await fresh(page)
  await page.getByRole('button', { name: 'Add study time' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add Study Time' })
  await expect(sheet.getByLabel('Subject')).toBeFocused()
  await sheet.getByLabel('Subject').fill(subject)
  await sheet.getByLabel('Time per week').fill(time)
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/plans\/.+/)
}

const todayRegion = (page: Page) => page.getByRole('main').getByRole('region', { name: 'Today' })

test('Add study time makes a plan with sessions; To Do lists today and ticking it fills the streak, Undo empties it', async ({ page }) => {
  await addStudy(page, 'Psychology', '3h')
  await expect(page.getByText('Added "Psychology"')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Psychology' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'This week' })).toHaveAccessibleName('This week')
  await expect(page.getByText('0 min of 3 h')).toBeVisible()
  const sessions = page.getByRole('main').getByRole('region', { name: 'Sessions' }).getByRole('listitem')
  await expect(sessions).toHaveCount(7)
  await expect(sessions.first()).toHaveText(/^Today\s*30 min$/)
  await expect(sessions.nth(1)).toHaveText(/^Tomorrow\s*25 min$/)
  await expect(page.getByRole('main').getByText('Time per week')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reschedule' })).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  const row = todayRegion(page).getByRole('listitem').filter({ hasText: 'Study Psychology' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Study time · 30 min', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Do, 1 item due' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Streak: 0 days, not done today' })).toBeVisible()
  await row.getByRole('checkbox', { name: 'Mark done: Study Psychology' }).click({ force: true })
  await expect(page.getByText('Done: Study Psychology')).toBeVisible()
  await expect(row.getByText('Done', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Streak: 1 day, done today' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: 'Streak: 0 days, not done today' })).toBeVisible()
  await expect(row.getByRole('checkbox', { name: 'Mark done: Study Psychology' })).not.toBeChecked()
})

test('the sheet explains its errors after Add and warns when the week cannot hold the time', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: 'Add study time' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add Study Time' })
  // Nothing red before the first Add.
  await expect(sheet.getByText('Add a subject')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByText('Add a subject')).toBeVisible()
  await expect(sheet.getByText('Enter the time, like 3h or 90m')).toBeVisible()
  const time = sheet.getByLabel('Time per week')
  await time.fill('10')
  await expect(sheet.getByText('At least 15 min, like 3h or 90m')).toBeVisible()
  await time.fill('3h')
  await expect(time).toHaveAccessibleDescription('About 25 min a day on your 7 study days.')
  await time.fill('20h')
  await expect(time).toHaveAccessibleDescription("That's more than the 14 h a week you have, so Kiln plans 14 h.")
  await time.fill('41h')
  await expect(sheet.getByText('Up to 40 h a week')).toBeVisible()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/import$/)
})

test('Quick add: one study line reviews as study time and imports; mixed with tasks it warns', async ({ page }) => {
  await fresh(page)
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  const box = panel.getByRole('textbox', { name: 'Tasks, one per line' })
  await box.fill('Read chapter 1 45m\nPsychology 3h a week')
  await expect(panel.getByText('“Psychology 3h a week” is study time, which is its own plan. Remove that line or the others.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Review plan' })).toBeDisabled()
  await box.fill('Psychology 3h a week')
  await expect(panel.getByRole('status').first()).toHaveText('Study time: Psychology, 3 h a week')
  await expect(panel.getByRole('table')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Review plan' }).click()
  await expect(panel.getByText('The plan is valid: study time for Psychology, 3 h a week.')).toBeVisible()
  await expect(panel.getByLabel('Ends (optional)')).toBeVisible()
  await expect(panel.getByText('Study Psychology (25 min)').first()).toBeVisible()
  await panel.getByRole('button', { name: 'Import "Psychology"' }).click()
  await expect(page).toHaveURL(/\/plans\/.+/)
  await expect(page.getByText('3 h a week.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Sessions' })).toBeVisible()
})

test('a study time plan pasted from an AI chat imports', async ({ page }) => {
  await fresh(page)
  const box = page.getByLabel('Paste the plan here')
  await box.fill('Here is your Kiln plan:\n```json\n{"schemaVersion": 1, "id": "study-spanish", "title": "Spanish", "subject": "Spanish", "schedulingMode": "auto", "studyMinutesPerWeek": 120}\n```')
  await expect(page.getByText('The plan is valid: study time for Spanish, 2 h a week.')).toBeVisible()
  await expect(page.getByTestId('match')).toHaveText('New plan')
  await page.getByRole('button', { name: 'Import "Spanish"' }).click()
  await expect(page).toHaveURL(/\/plans\/.+/)
  await expect(page.getByRole('heading', { level: 1, name: 'Spanish' })).toBeVisible()
})

test('editing the weekly time changes the sessions; deleting the plan removes them from To Do', async ({ page }) => {
  await addStudy(page, 'Psychology', '3h')
  await page.getByRole('button', { name: 'Edit plan' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Edit Study Time' })
  await expect(sheet.getByLabel('Time per week')).toHaveValue('3h')
  await expect(sheet.getByLabel('Starts')).toHaveCount(0)
  await sheet.getByLabel('Time per week').fill('90m')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Saved "Psychology"')).toBeVisible()
  await expect(page.getByRole('main').getByText('1 h 30 min', { exact: true })).toBeVisible()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^To Do/ }).click()
  await expect(todayRegion(page).getByText('Study time · 15 min', { exact: true })).toBeVisible()

  await page.goBack()
  await page.getByRole('button', { name: 'Delete plan' }).first().click()
  const confirm = page.getByRole('dialog', { name: 'Delete this plan?' })
  await expect(confirm.getByText('Psychology and its study history are removed from this device.', { exact: false })).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete plan' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await page.goto('/todo')
  await expect(page.getByRole('heading', { level: 1, name: 'To Do' })).toBeVisible()
  await expect(page.getByRole('main').getByText('Study Psychology')).toHaveCount(0)
})
