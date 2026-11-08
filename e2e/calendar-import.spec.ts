import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { DAY1 } from './seed'

const canvas = fileURLToPath(new URL('../fixtures/calendars/canvas.ics', import.meta.url))
const real = fileURLToPath(new URL('../fixtures/calendars/real-canvas.ics', import.meta.url))

/** Live tasks straight from IndexedDB (database "kiln", table "tasks"). */
const readTasks = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<{ title: string; deadline?: string; scheduledDate?: string; estimatedMinutes: number; deleted: boolean; status: string; completedAt?: number }[]>((resolve, reject) => {
        const open = indexedDB.open('kiln')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('tasks').objectStore('tasks').getAll()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }
      }),
  )

test('imports a Canvas calendar file: a plan per ticked course, tasks scheduled before their due dates', async ({ page }) => {
  await page.goto('/import?tab=calendar')
  const panel = page.getByRole('tabpanel', { name: 'From a course calendar' })
  await expect(panel.getByText('Where to find the calendar link in Canvas')).toBeVisible()
  await panel.locator('input[type=file]').setInputFiles(canvas)

  await expect(panel.getByRole('checkbox', { name: 'MATH-221-001: 3 in your calendar, 3 still due' })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'HIST-110: 2 in your calendar, 2 still due' })).toBeChecked()
  // Untick a course: it gets no plan.
  await panel.getByText('CS-150: 1 in your calendar, 1 still due').click()
  await expect(panel.getByRole('checkbox', { name: /^CS-150/ })).not.toBeChecked()

  await expect(panel.getByLabel('Minutes for Quiz 2')).toHaveValue('30')
  await expect(panel.getByLabel('Minutes for Prepare for Midterm Exam')).toHaveValue('180')
  await panel.getByLabel('Minutes for Problem Set 3').fill('45')
  await panel.getByLabel('Title of Reading: Chapter 6').fill('Read chapter 6')

  await panel.getByRole('button', { name: 'Import 5 items' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await expect(page.getByText('Imported 2 courses')).toBeVisible()
  await expect(page.getByRole('main').getByText('MATH-221-001').first()).toBeVisible()
  await expect(page.getByRole('main').getByText('HIST-110').first()).toBeVisible()
  await expect(page.getByRole('main').getByText('CS-150')).toHaveCount(0)

  const tasks = (await readTasks(page)).filter((t) => !t.deleted)
  expect(tasks.map((t) => t.title).sort()).toEqual([
    'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 1 of 2)',
    'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 2 of 2)',
    'Prepare for Midterm Exam (session 1 of 2)',
    'Prepare for Midterm Exam (session 2 of 2)',
    'Problem Set 3',
    'Quiz 2',
    'Read chapter 6',
  ])
  expect(tasks.find((t) => t.title === 'Problem Set 3')?.estimatedMinutes).toBe(45)
  for (const t of tasks) {
    expect(t.scheduledDate, t.title).toBeTruthy()
    expect(t.scheduledDate! <= t.deadline!, `${t.title}: ${t.scheduledDate} before ${t.deadline}`).toBe(true)
  }

  // Importing the same file again finds nothing new and keeps the edits.
  await page.goto('/import?tab=calendar')
  await panel.locator('input[type=file]').setInputFiles(canvas)
  await expect(panel.getByText('3 already in Kiln (re-importing keeps your progress).')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Import 1 item' })).toBeVisible() // CS-150 is ticked again by default
})

test('a Canvas file with past items: already due imports as completed, tests get prep, a course can be renamed', async ({ page }) => {
  await page.clock.install({ time: DAY1 })
  await page.goto('/import?tab=calendar')
  const panel = page.getByRole('tabpanel', { name: 'From a course calendar' })
  await panel.locator('input[type=file]').setInputFiles(real)

  await expect(panel.getByRole('checkbox', { name: 'COB300A: 5 in your calendar, 2 still due', exact: true })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'COB300D: 2 in your calendar, 1 still due', exact: true })).toBeChecked()
  await expect(panel.getByText('Canvas only lists assignments with a due date.')).toBeVisible()
  await expect(panel.getByText(/Section 0/)).toHaveCount(0)
  await expect(panel.getByLabel('Minutes for Test 4', { exact: true })).toHaveValue('60')
  await expect(panel.getByLabel('Minutes for Prepare for Test 4')).toHaveValue('180')
  await expect(panel.getByRole('button', { name: 'Import 4 items' })).toBeVisible()

  // The due cell takes typed text.
  const due = panel.getByLabel('Due date of Final Paper')
  await due.fill('dec 12')
  await due.blur()
  await expect(due).toHaveValue('Sat, Dec 12, 2026')

  const trigger = panel.getByRole('button', { name: 'Already due (3)' })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const all = panel.getByRole('checkbox', { name: 'Add all 3 as completed' })
  await expect(all).not.toBeChecked()
  await panel.getByText('Case Memo 1').click()
  await expect(panel.getByRole('checkbox', { name: 'Case Memo 1 · Sep 6' })).toBeChecked()
  await expect(all).toBeChecked({ indeterminate: true })
  await panel.getByText('Add all 3 as completed').click()
  await expect(all).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'Test 3 · Oct 15' })).toBeChecked()

  await panel.getByRole('textbox', { name: 'Plan name' }).nth(1).fill('Business Policy')
  await panel.getByRole('button', { name: 'Import 7 items' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await expect(page.getByText('Imported 2 courses')).toBeVisible()
  await expect(page.getByText('9 tasks added, 3 marked done.')).toBeVisible()
  await expect(page.getByRole('main').getByText('Business Policy').first()).toBeVisible()
  await expect(page.getByRole('main').getByText('COB300A').first()).toBeVisible()

  const tasks = (await readTasks(page)).filter((t) => !t.deleted)
  const done = tasks.filter((t) => t.status === 'done')
  expect(done.map((t) => t.title).sort()).toEqual(['Case Memo 1', 'Case Memo 2', 'Test 3'])
  for (const t of done) expect(t.completedAt, t.title).toBeUndefined()
  expect(tasks.find((t) => t.title === 'Final Paper (session 1 of 2)')?.deadline).toBe('2026-12-12')

  // Again: everything is in Kiln, the new name is kept.
  await page.goto('/import?tab=calendar')
  await panel.locator('input[type=file]').setInputFiles(real)
  await expect(panel.getByRole('textbox', { name: 'Plan name' }).nth(1)).toHaveValue('Business Policy')
  await expect(panel.getByRole('button', { name: /^Already due/ })).toHaveText(['Already due (1)']) // COB300D's Reflection 1, left unticked
  // The feed still says Dec 10 for the Final Paper moved to Dec 12, so that date change is offered.
  await expect(panel.getByText(/^Final Paper: due date moved from/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Import 1 item' })).toBeVisible()
})

test('a bad value is tied to its input and the disabled Import button says why', async ({ page }) => {
  await page.goto('/import?tab=calendar')
  const panel = page.getByRole('tabpanel', { name: 'From a course calendar' })
  await panel.locator('input[type=file]').setInputFiles(canvas)
  const minutes = panel.getByLabel('Minutes for Quiz 2')
  await minutes.fill('2')
  await expect(minutes).toHaveAttribute('aria-invalid', 'true')
  const id = await minutes.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  await expect(page.locator(`[id="${id}"]`)).toHaveText('Minutes must be a whole number from 5 to 600.')
  const button = panel.getByRole('button', { name: /^Import \d+ items?$/ })
  await expect(button).toBeDisabled()
  await expect(panel.getByText(/^Fix the 1 row marked in red first/)).toBeVisible()
  await expect(button).toHaveAttribute('aria-describedby', 'calendar-import-reason')
  await minutes.fill('30')
  await expect(button).toBeEnabled()
})

test('a calendar link that stopped working, or came back without its link, is explained on the tab', async ({ page }) => {
  await page.goto('/import?tab=calendar')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('kiln')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('feeds', 'readwrite')
          const base = { updatedAt: Date.now(), deleted: false, deviceId: 'e2e', planIds: [] }
          tx.objectStore('feeds').put({ ...base, id: 'f1', lms: 'canvas', url: 'https://canvas.example.edu/feeds/a.ics', lastFetchedAt: Date.now(), lastResult: { ok: false, error: 'Could not read the calendar: the calendar server answered 403.' } })
          tx.objectStore('feeds').put({ ...base, id: 'f2', lms: 'moodle', url: '', needsLink: true })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.reload()
  const panel = page.getByRole('tabpanel', { name: 'From a course calendar' })
  await expect(panel.getByRole('alert').filter({ hasText: 'Your Canvas calendar link stopped working' })).toContainText('the calendar server answered 403')
  await expect(panel.getByRole('status').filter({ hasText: 'Your Moodle calendar link was not in the backup' })).toBeVisible()
})
