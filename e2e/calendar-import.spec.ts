import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const canvas = fileURLToPath(new URL('../fixtures/calendars/canvas.ics', import.meta.url))

/** Live tasks straight from IndexedDB (database "kiln", table "tasks"). */
const readTasks = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<{ title: string; deadline?: string; scheduledDate?: string; estimatedMinutes: number; deleted: boolean }[]>((resolve, reject) => {
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

  await expect(panel.getByRole('checkbox', { name: /^MATH-221-001: 3 assignments/ })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: /^HIST-110: 2 assignments/ })).toBeChecked()
  // Untick a course: it gets no plan.
  await panel.getByText(/^CS-150: 1 assignment/).click()
  await expect(panel.getByRole('checkbox', { name: /^CS-150/ })).not.toBeChecked()

  await expect(panel.getByLabel('Minutes for Quiz 2')).toHaveValue('30')
  await expect(panel.getByLabel('Minutes for Prepare for Midterm Exam')).toHaveValue('180')
  await panel.getByLabel('Minutes for Problem Set 3').fill('45')
  await panel.getByLabel('Title of Reading: Chapter 6').fill('Read chapter 6')

  await panel.getByRole('button', { name: 'Import 5 assignments' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await expect(page.getByText('Imported 2 courses')).toBeVisible()
  await expect(page.getByRole('main').getByText('MATH-221-001').first()).toBeVisible()
  await expect(page.getByRole('main').getByText('HIST-110').first()).toBeVisible()
  await expect(page.getByRole('main').getByText('CS-150')).toHaveCount(0)

  const tasks = (await readTasks(page)).filter((t) => !t.deleted)
  expect(tasks.map((t) => t.title).sort()).toEqual([
    'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 1 of 2)',
    'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 2 of 2)',
    'Prepare for Midterm Exam',
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
  await expect(panel.getByRole('button', { name: 'Import 1 assignment' })).toBeVisible() // CS-150 is ticked again by default
})
