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

// Study time plans. SHOTS_DIR overrides the folder. Clock fixed at Monday 9 Nov 2026, default budget (14 h a week).
const shotsDir = process.env.SHOTS_DIR ?? 'docs/design'
const MONDAY = new Date(2026, 10, 9, 9, 0, 0)

async function studyStart(page: Page, path = '/import') {
  await page.clock.install({ time: MONDAY })
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
async function openStudySheet(page: Page) {
  await page.getByRole('button', { name: 'Add study time' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add Study Time' })
  await expect(sheet).toBeVisible()
  return sheet
}
/** Adds a study time plan through the sheet and lands on its page. */
async function addStudyPlan(page: Page, subject: string, time: string, dates: { start?: string; end?: string } = {}) {
  await page.goto('/import')
  const sheet = await openStudySheet(page)
  await sheet.getByLabel('Subject').fill(subject)
  await sheet.getByLabel('Time per week').fill(time)
  if (dates.start) await sheet.getByLabel('Starts').fill(dates.start)
  if (dates.end) await sheet.getByLabel('Ends (optional)').fill(dates.end)
  await sheet.getByLabel('Subject').click() // leaving a date field commits it
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { level: 2, name: 'Sessions' })).toBeVisible()
}
/** Sets every weekday to 0 minutes (raw IndexedDB, then a reload so the app reads it). */
async function noStudyDays(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('kiln')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ id: 'settings', updatedAt: Date.now(), deleted: false, deviceId: 'shots', minutesPerWeekday: [0, 0, 0, 0, 0, 0, 0], weekStartsOn: 'monday', reminderTime: '08:00', nudgeEnabled: false, nudgeTime: '20:00', theme: 'system', reviewCapPercent: 25, blackoutDates: [] })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.reload()
}
async function quickAdd(page: Page, text: string) {
  await studyStart(page)
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  await panel.getByRole('textbox', { name: 'Tasks, one per line' }).fill(text)
  return panel
}

const studyScenes: Record<string, (page: Page) => Promise<{ full?: boolean } | void>> = {
  'study-import-card': async (page) => {
    await studyStart(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Study time' })).toBeVisible()
  },
  'study-sheet-empty': async (page) => {
    await studyStart(page)
    await openStudySheet(page)
  },
  'study-sheet-errors': async (page) => {
    await studyStart(page)
    const sheet = await openStudySheet(page)
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sheet.getByText('Add a subject')).toBeVisible()
  },
  'study-sheet-no-days': async (page) => {
    await studyStart(page)
    await noStudyDays(page)
    const sheet = await openStudySheet(page)
    await expect(sheet.getByText(/You have no study days yet/)).toBeVisible()
  },
  'study-sheet-over': async (page) => {
    await studyStart(page)
    const sheet = await openStudySheet(page)
    await sheet.getByLabel('Subject').fill('Psychology')
    await sheet.getByLabel('Time per week').fill('20h')
    await expect(sheet.getByText(/more than the 14 h a week you have/)).toBeVisible()
  },
  'study-sheet-shared': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Spanish', '10h')
    await page.goto('/import')
    const sheet = await openStudySheet(page)
    await sheet.getByLabel('Subject').fill('Psychology')
    await sheet.getByLabel('Time per week').fill('5h')
    await expect(sheet.getByText(/Kiln shares the 14 h between them/)).toBeVisible()
  },
  'study-sheet-edit': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h')
    await page.getByRole('button', { name: 'Edit plan' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit Study Time' })).toBeVisible()
  },
  'study-plan': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h')
    return { full: true }
  },
  'study-plan-ended': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h', { end: 'Nov 10' })
    await page.clock.fastForward(2 * 24 * 3_600_000)
    await page.reload()
    await expect(page.getByText(/This plan ended on/)).toBeVisible()
  },
  'study-plan-none': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h', { start: 'Dec 1' })
    await expect(page.getByText('No sessions in the next 7 days.')).toBeVisible()
  },
  'study-todo': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h')
    await addStudyPlan(page, 'Spanish', '2h')
    await page.goto('/todo')
    const row = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Study Spanish' })
    await expect(row.getByRole('checkbox')).toBeEnabled()
    await row.getByRole('checkbox').click({ force: true })
    await expect(row.getByText('Done', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss' }).click()
  },
  'study-dashboard': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h', { end: 'Dec 12' })
    await addStudyPlan(page, 'Spanish', '2h')
    await page.goto('/')
    await expect(page.getByText('Ends Dec 12')).toBeVisible()
  },
  'study-plans': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h', { end: 'Dec 12' })
    await addStudyPlan(page, 'Spanish', '2h')
    await page.goto('/plans')
    await expect(page.getByText('3 h a week · ends Dec 12')).toBeVisible()
  },
  'study-quick-add': async (page) => {
    const panel = await quickAdd(page, 'Psychology 3h a week')
    await expect(panel.getByRole('status').first()).toHaveText('Study time: Psychology, 3 h a week')
    return { full: true }
  },
  'study-quick-add-mixed': async (page) => {
    const panel = await quickAdd(page, 'Read chapter 1 45m\nPsychology 3h a week')
    await expect(panel.getByText(/is study time, which is its own plan/)).toBeVisible()
    return { full: true }
  },
  'study-import-review': async (page) => {
    const panel = await quickAdd(page, 'Psychology 3h a week')
    await panel.getByRole('button', { name: 'Review plan' }).click()
    await expect(panel.getByText('Study Psychology (25 min)').first()).toBeVisible()
    return { full: true }
  },
  'study-calendar': async (page) => {
    await studyStart(page)
    await addStudyPlan(page, 'Psychology', '3h')
    await page.goto('/calendar')
    await expect(page.getByRole('grid')).toBeVisible()
    // Phones show the day's count, not chip titles.
    if ((page.viewportSize()?.width ?? 0) >= 768) await expect(page.getByText('Study Psychology').first()).toBeVisible()
    return { full: true }
  },
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const [name, scene] of Object.entries(studyScenes)) {
      test(`${name} ${size} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        const shot = (await scene(page)) ?? {}
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${shotsDir}/${name}-${size}-${colorScheme}.png`, fullPage: shot.full })
      })
    }
  }
}
