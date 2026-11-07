import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { advanceDays, openSeeded } from './seed'
import { mockWorker } from './worker-mock'

// Design review screenshots, written to docs/design/. Off by default: SCREENSHOTS=1 npx playwright test screenshots
// The dashboard, To Do and calendar are shot with the sample plans, a few days in: one lesson done on day one,
// nothing since, so there are overdue items, a due review and a greyed row.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to write docs/design screenshots')

const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
const routes = { dashboard: '/', todo: '/todo', calendar: '/calendar', design: '/design' }

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const [name, path] of Object.entries(routes)) {
      test(`${name} ${size} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        if (name === 'design') {
          await page.goto(path)
        } else {
          await openSeeded(page, '/todo')
          const lesson = page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: '· Lesson ·' }).first()
          await lesson.getByRole('checkbox').click({ force: true })
          // The rating keys only work once the sheet is open; pressing early lost the key on a cold first run.
          await expect(page.getByRole('dialog', { name: 'How did it go?' })).toBeVisible()
          await page.keyboard.press('3')
          await expect(lesson.getByText('Done', { exact: true })).toBeVisible()
          await advanceDays(page, 3)
          await page.goto(path)
        }
        // Pages are lazy chunks: wait for the page itself, not just the shell.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (name === 'todo') await expect(page.getByRole('region', { name: /^Overdue/ })).toBeVisible()
        if (name === 'calendar') await expect(page.getByRole('grid')).toBeVisible()
        if (name === 'dashboard') await expect(page.getByText(/Expected finish/).first()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `docs/design/${name}-${size}-${colorScheme}.png`, fullPage: name === 'design' || name === 'calendar' })
      })
    }
  }
}

// The screens added by the UX overhaul. Each scene sets itself up and returns whether to shoot the full page.
const canvas = fileURLToPath(new URL('../fixtures/calendars/canvas.ics', import.meta.url))
const QUICK_ADD = ['# Cells', 'Read chapter 1 45m', 'Watch the cell video https://www.youtube.com/watch?v=abc 20m', 'Flashcards https://quizlet.com/123/cells ?', 'Practice quiz 1h', '## Genetics', 'Read chapter 2 1h30m !', 'Punnett squares 40m', 'Lab write-up', '# Exam prep', 'Mock exam 1h30m', 'Final exam tomorrow'].join('\n')

async function openFirstPlan(page: Page) {
  await openSeeded(page, '/plans')
  await page.getByRole('main').getByRole('heading', { level: 2 }).first().getByRole('link').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Modules' })).toBeVisible()
}

/**
 * Marks up to 90 open tasks done on scattered days of the past 365 (raw IndexedDB), so the heatmap has a history.
 * Rows get a fresh updatedAt and this device's id (meta "deviceId"), as updateRecord writes them. Returns how many rows it wrote.
 */
async function backfillHistory(page: Page): Promise<{ wrote: number; open: number }> {
  return page.evaluate(
    () =>
      new Promise<{ wrote: number; open: number }>((resolve, reject) => {
        const open = indexedDB.open('kiln')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction(['meta', 'tasks'], 'readwrite')
          const store = tx.objectStore('tasks')
          let wrote = 0
          let openTasks = 0
          tx.objectStore('meta').get('deviceId').onsuccess = (m) => {
            const deviceId = (m.target as IDBRequest<{ value: string } | undefined>).result?.value
            if (!deviceId) return reject(new Error('no deviceId in meta'))
            store.openCursor().onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
              if (!cursor) return
              const t = cursor.value
              if (!t.deleted && t.status === 'open') {
                openTasks++
                if (wrote < 90) {
                  // Deterministic spread over the year: clusters of busy days with gaps, denser toward the present.
                  const daysAgo = Math.min(364, Math.floor(((wrote * 37) % 100) ** 1.45 / 2.2) + (wrote % 9 === 0 ? 40 : 1))
                  cursor.update({ ...t, status: 'done', completedAt: Date.now() - daysAgo * 86_400_000, updatedAt: Math.max(Date.now(), t.updatedAt + 1), deviceId })
                  wrote++
                }
              }
              cursor.continue()
            }
          }
          tx.oncomplete = () => resolve({ wrote, open: openTasks })
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
}

const scenes: Record<string, (page: Page) => Promise<{ full?: boolean; clip?: Locator } | void>> = {
  onboarding: async (page) => {
    await mockWorker(page.context())
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'How many minutes can you study?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Steady/ })).toBeChecked()
  },
  'todo-preferences': async (page) => {
    await openSeeded(page, '/todo')
    await page.getByRole('button', { name: 'To-do List Preferences' }).click()
    const dialog = page.getByRole('dialog', { name: 'To-do List Preferences' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radiogroup', { name: 'Show tasks until' }).locator('label', { hasText: 'Next Week' }).click()
  },
  'quick-add': async (page) => {
    await page.goto('/import')
    await page.getByRole('tab', { name: 'Quick add' }).click()
    const panel = page.getByRole('tabpanel', { name: 'Quick add' })
    await panel.getByRole('textbox', { name: 'Plan title' }).fill('Biology')
    await panel.getByRole('textbox', { name: 'Tasks, one per line' }).fill(QUICK_ADD)
    await expect(panel.getByRole('status').first()).toHaveText('9 tasks in 3 modules')
    return { full: true }
  },
  'course-calendar': async (page) => {
    await page.goto('/import?tab=calendar')
    const panel = page.getByRole('tabpanel', { name: 'From a course calendar' })
    await panel.locator('input[type=file]').setInputFiles(canvas)
    await expect(panel.getByRole('checkbox', { name: /^MATH-221-001: 3 assignments/ })).toBeChecked()
    return { full: true }
  },
  'plan-edit': async (page) => {
    await openFirstPlan(page)
    await page.getByRole('button', { name: 'Edit plan' }).click()
    await expect(page.getByRole('form', { name: 'Edit plan' }).getByRole('heading', { name: 'Edit plan' })).toBeFocused()
  },
  'plan-history': async (page) => {
    await openFirstPlan(page)
    await page.getByRole('button', { name: 'Edit plan' }).click()
    const form = page.getByRole('form', { name: 'Edit plan' })
    await form.getByRole('textbox', { name: 'Task name' }).first().fill('Renamed in the editor')
    await form.getByRole('button', { name: 'Save plan' }).click()
    await expect(page.getByRole('list', { name: 'Versions' }).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()
    // Dismiss the toast so it does not sit over the list: it carries a Reschedule action, so it never closes on its own.
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText('Plan saved')).toBeHidden()
  },
  heatmap: async (page) => {
    await openSeeded(page, '/todo')
    const { wrote, open } = await backfillHistory(page)
    expect(wrote).toBe(Math.min(90, open)) // every row it meant to write was written
    expect(wrote).toBe(90) // the sample plans have far more open tasks than that
    await page.goto('/progress')
    const heatmap = page.getByRole('group', { name: 'Study activity, last year' })
    await expect(heatmap).toBeVisible()
    await expect(page.getByText(/in the last year$/)).toBeVisible()
    return { clip: page.getByRole('main') }
  },
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const [name, scene] of Object.entries(scenes)) {
      test(`${name} ${size} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        const shot = (await scene(page)) ?? {}
        await page.evaluate(() => document.fonts.ready)
        const path = `docs/design/${name}-${size}-${colorScheme}.png`
        if (shot.clip) await shot.clip.screenshot({ path })
        else await page.screenshot({ path, fullPage: shot.full })
      })
    }
  }
}
