import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/plans/${name}.json`, import.meta.url), 'utf8')
const publicFile = (name: string) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

/**
 * Puts the plan into the textarea the way a paste does: one value change and one input event.
 * locator.fill() of a 40 to 50 kB plan takes 1.5 to 2 s in Chromium (it inserts the text through the editing
 * pipeline and lays out every wrapped line), which times out the four-import test when the machine is busy.
 */
async function paste(page: Page, text: string) {
  await page.goto('/import')
  const box = page.getByLabel('Paste the plan here')
  await expect(box).toBeVisible()
  await box.evaluate((el, value) => {
    // React tracks the value itself, so go through the native setter or it ignores the event.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
}

/** Waits for the preview, imports, and checks that the app moved to the new plan's page. */
async function importIt(page: Page, button: string | RegExp = /^Import "/) {
  const go = page.getByRole('button', { name: button })
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page).toHaveURL(/\/plans\/.+/)
  await expect(page.getByText(/^Imported "/)).toBeVisible()
  // The plan page lists the imported plan's modules.
  await expect(page.getByRole('heading', { level: 2, name: 'Modules' })).toBeVisible()
  await expect(page.locator('details').first()).toBeVisible()
}

test('imports the DSA plan in three parts, then system design', async ({ page }) => {
  await paste(page, fixture('dsa-part1'))
  await expect(page.getByTestId('match')).toHaveText('New plan')
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
  await expect(page.getByText('Scheduling starts when every part of the plan is imported.')).toBeVisible()
  await importIt(page)

  await paste(page, fixture('dsa-part2'))
  await expect(page.getByTestId('match')).toHaveText(/^Add part 2 of 3 to "DSA Zero to Hero in Python"/)
  await importIt(page, /^Add part \d of 3 to "DSA Zero to Hero in Python"/)

  await paste(page, fixture('dsa-part3'))
  await expect(page.getByTestId('match')).toHaveText(/^Add part 3 of 3 to /)
  // Complete now: the preview has a projected finish and a 14-day schedule.
  await expect(page.getByTestId('projection')).toContainText('Expected finish')
  await expect(page.getByRole('heading', { name: 'First 14 days' })).toBeVisible()
  await importIt(page, /^Add part \d of 3 to "DSA Zero to Hero in Python"/)

  await paste(page, fixture('system-design'))
  await expect(page.getByTestId('match')).toHaveText('New plan')
  await expect(page.getByTestId('projection')).toContainText('Expected finish')
  await importIt(page)
})

test('re-importing a plan offers update or copy', async ({ page }) => {
  await paste(page, fixture('system-design'))
  await importIt(page)
  await paste(page, fixture('system-design'))
  await expect(page.getByTestId('match')).toContainText('is already in Kiln')
  // Same title: update is the default, and the button and note say what it does.
  await expect(page.getByRole('radio', { name: /^Update "/ })).toBeChecked()
  await expect(page.getByRole('button', { name: /^Update "/ })).toBeVisible()
  await expect(page.getByText(/missing from this file are kept, not removed/)).toBeVisible()
  await page.getByText('Import as a copy with a new id').click()
  await expect(page.getByLabel('Id of the copy')).toHaveValue(/-copy$/)
  await importIt(page)
})

test('the same id with a different title defaults to a copy', async ({ page }) => {
  await paste(page, fixture('system-design'))
  await importIt(page)
  const renamed = JSON.parse(fixture('system-design')) as { title: string }
  renamed.title = 'Some other plan that reused the id'
  await paste(page, JSON.stringify(renamed))
  await expect(page.getByRole('radio', { name: /Import as a copy/ })).toBeChecked()
  await expect(page.getByRole('button', { name: /as a copy$/ })).toBeVisible()
  await importIt(page, /as a copy$/)
})

test('part 2 without part 1 is blocked', async ({ page }) => {
  await paste(page, fixture('dsa-part2'))
  await expect(page.getByTestId('match')).toContainText('Import part 1 first')
  await expect(page.getByRole('button', { name: /^Import "/ })).toBeDisabled()
})

test('invalid JSON shows the line and column', async ({ page }) => {
  await paste(page, '{\n  "schemaVersion": 1,\n  "id": ,\n}')
  await expect(page.getByRole('status').filter({ hasText: /blocks? the import/ })).toBeVisible()
  await expect(page.getByText(/json: line 3, column \d+: unexpected/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import "/ })).toHaveCount(0)
})

test('plan errors are listed in the spec format', async ({ page }) => {
  const plan = JSON.parse(fixture('system-design')) as { tasks: Record<string, unknown>[] }
  delete plan.tasks[0]?.estimatedMinutes
  await paste(page, JSON.stringify(plan))
  await expect(page.getByText(/^tasks\[0\] ".+": estimatedMinutes is required$/)).toBeVisible()
})

test('uploading the CSV template imports it', async ({ page }) => {
  await page.goto('/import')
  await page.locator('input[type=file]').first().setInputFiles(publicFile('kiln-plan-template.csv'))
  await expect(page.getByLabel('Paste the plan here')).toHaveValue(/^moduleId,/)
  await expect(page.getByText('Enter a title for the plan.').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import "/ })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Template plan')
  await expect(page.getByLabel('Plan id')).toHaveValue('template-plan')
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
  await importIt(page)
})

test('uploading the XLSX template imports it', async ({ page }) => {
  await page.goto('/import')
  await page.locator('input[type=file]').first().setInputFiles(publicFile('kiln-plan-template.xlsx'))
  await expect(page.getByText('Loaded kiln-plan-template.xlsx')).toBeVisible()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Excel plan')
  await importIt(page)
})

test.describe('clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  for (const [index, description, mentions] of [
    [0, 'Let Kiln assign dates based on your minutes per weekday.', '"schedulingMode": "auto"'],
    [1, 'Assign the dates yourself. The AI will ask you.', '"schedulingMode": "fixed"'],
  ] as const) {
    test(`Copy prompt ${index + 1} puts its prompt on the clipboard`, async ({ page }) => {
      await page.goto('/import')
      // The two buttons share a name; their descriptions tell them apart.
      const button = page.getByRole('button', { name: 'Copy prompt' }).nth(index)
      await expect(button).toHaveAccessibleDescription(description)
      await button.click()
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
      const text = await page.evaluate(() => navigator.clipboard.readText())
      expect(text.length).toBeGreaterThan(2000)
      expect(text).toContain(mentions)
      expect(text).not.toContain('{{SCHEMA_REFERENCE}}')
      expect(text).toContain('Do you have a class calendar link? Paste it here, or say no.')
    })
  }

  test('Paste from clipboard fills the box', async ({ page }) => {
    await page.goto('/import')
    await page.evaluate((t) => navigator.clipboard.writeText(t), '{"hello": 1}')
    await page.getByRole('button', { name: 'Paste from clipboard' }).click()
    await expect(page.getByLabel('Paste the plan here')).toHaveValue('{"hello": 1}')
  })
})

test('Paste from clipboard shows a hint when the browser refuses', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('button', { name: 'Paste from clipboard' }).click()
  await expect(page.getByText(/could not read the clipboard/)).toBeVisible()
  await expect(page.getByLabel('Paste the plan here')).toBeFocused()
})

const QUICK_ADD = [
  '# Cells',
  'Read chapter 1 45m',
  'Watch the cell video https://www.youtube.com/watch?v=abc 20m',
  'Flashcards https://quizlet.com/123/cells ?',
  'Practice quiz 1h',
  '## Genetics',
  'Read chapter 2 1h30m !',
  'Punnett squares 40m',
  'Lab write-up',
  '# Exam prep',
  'Mock exam 1h30m',
  'Final exam tomorrow',
].join('\n')

test('Schedule reviews is unticked at import, and ticking it switches reviews on for the new plan', async ({ page }) => {
  await paste(page, fixture('system-design'))
  const box = page.getByRole('checkbox', { name: 'Schedule reviews' })
  await expect(box).not.toBeChecked()
  await expect(box).toHaveAccessibleDescription('Finished lessons come back for a short review on later days.')
  await box.check({ force: true })
  await importIt(page)
  await expect(page.getByRole('switch', { name: 'Schedule reviews' })).toBeChecked()
})

test('a plan imported with the box unticked has reviews off', async ({ page }) => {
  await paste(page, fixture('system-design'))
  await expect(page.getByRole('checkbox', { name: 'Schedule reviews' })).not.toBeChecked()
  await importIt(page)
  await expect(page.getByRole('switch', { name: 'Schedule reviews' })).not.toBeChecked()
})

test('Schedule reviews is hidden when the import updates a plan, and back for a copy', async ({ page }) => {
  await paste(page, fixture('system-design'))
  await importIt(page)
  await paste(page, fixture('system-design'))
  await expect(page.getByRole('radio', { name: /^Update/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Schedule reviews' })).toBeHidden()
  await page.getByRole('radio', { name: 'Import as a copy with a new id' }).check({ force: true })
  await expect(page.getByRole('checkbox', { name: 'Schedule reviews' })).toBeVisible()
})

test('quick add: 12 lines become a plan that imports', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  await panel.getByRole('textbox', { name: 'Plan title' }).fill('Biology')
  await panel.getByRole('textbox', { name: 'Tasks, one per line' }).fill(QUICK_ADD)
  await expect(panel.getByRole('textbox', { name: /^Task \d+ title$/ })).toHaveCount(9)
  await expect(panel.getByRole('status').first()).toHaveText('9 tasks in 3 modules')
  await expect(panel.getByRole('textbox', { name: 'Task 2 links' })).toHaveValue('https://www.youtube.com/watch?v=abc')
  await expect(panel.getByRole('combobox', { name: 'Task 3 priority' })).toHaveValue('optional')
  await expect(panel.getByRole('textbox', { name: 'Task 7 minutes' })).toHaveValue('30')
  // Fix two rows in the preview: the exams become an exam and a milestone.
  await panel.getByRole('combobox', { name: 'Task 8 type' }).selectOption('assessment')
  await panel.getByRole('combobox', { name: 'Task 9 type' }).selectOption('milestone')
  await panel.getByRole('textbox', { name: 'Task 9 minutes' }).fill('0')
  await panel.getByRole('button', { name: 'Review plan' }).click()
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
  await expect(page.getByText(/^Fixed dates: a task has a due date/)).toBeVisible()
  await expect(page.getByLabel('Plan id')).toHaveValue('biology')
  await importIt(page)
})

test('quick add: Repeat counts up each 1, caps at 52, and a due cell takes typed dates', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  await panel.getByRole('textbox', { name: 'Tasks, one per line' }).fill('# Week 1\nRead chapter 1 1h')
  // The unit drawn in the box is part of the name.
  const repeat = panel.getByRole('textbox', { name: 'Repeat, times', exact: true })
  await expect(repeat).toHaveAccessibleDescription('')
  await repeat.fill('3')
  await expect(repeat).toHaveAccessibleDescription('Numbers like the 1 in Week 1 go up in each copy.')
  await expect(panel.getByRole('status').first()).toHaveText('3 tasks in 3 modules')
  await expect(panel.getByRole('textbox', { name: 'Task 3 title' })).toHaveValue('Read chapter 3')
  await expect(panel.getByRole('textbox', { name: 'Task 3 minutes' })).toHaveValue('60')
  await expect(panel.locator('th', { hasText: 'Week 3' })).toBeVisible()
  await repeat.fill('60')
  await expect(panel.getByText('Up to 52 times.')).toBeVisible()
  // The help line and the error are both read out (React Aria puts the error first).
  await expect(repeat).toHaveAccessibleDescription(/Numbers like the 1 in Week 1 go up in each copy\./)
  await expect(repeat).toHaveAccessibleDescription(/Up to 52 times\./)
  await expect(panel.getByRole('status').first()).toHaveText('52 tasks in 52 modules')
  await repeat.fill('1')
  const due = panel.getByRole('textbox', { name: 'Task 1 due' })
  await due.fill('dec 24 2030')
  await due.press('Enter')
  await expect(due).toHaveValue('Tue, Dec 24, 2030')
})

test('quick add: changing how many identical lines there are drops their table edits', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  const box = panel.getByRole('textbox', { name: 'Tasks, one per line' })
  await box.fill('Read\nRead\nQuiz')
  await panel.getByRole('textbox', { name: 'Task 2 minutes' }).fill('20')
  await panel.getByRole('textbox', { name: 'Task 3 minutes' }).fill('5')
  await box.fill('Read\nQuiz')
  await expect(panel.getByText('1 table edit was dropped because identical lines were added or removed.')).toBeVisible()
  await expect(panel.getByRole('textbox', { name: 'Task 1 minutes' })).toHaveValue('30')
  await expect(panel.getByRole('textbox', { name: 'Task 2 minutes' })).toHaveValue('5')
})

test('quick add: clearing Repeat to type a new number keeps the copies and their edits', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Quick add' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Quick add' })
  await panel.getByRole('textbox', { name: 'Tasks, one per line' }).fill('Read chapter 1')
  const repeat = panel.getByRole('textbox', { name: 'Repeat, times', exact: true })
  await repeat.fill('3')
  const minutes = panel.getByRole('textbox', { name: 'Task 2 minutes' })
  await minutes.fill('50')
  await repeat.fill('')
  await expect(panel.getByRole('status').first()).toHaveText('3 tasks in 1 module')
  await repeat.pressSequentially('3')
  await expect(minutes).toHaveValue('50')
  await expect(panel.getByText(/table edits? (was|were) dropped/)).toBeHidden()
  // Left empty, the box shows the count still in use.
  await repeat.fill('')
  await repeat.press('Tab')
  await expect(repeat).toHaveValue('3')
})

test('a changed study budget persists and offers a reschedule', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('row', { name: /Monday/ })).toContainText('120 min')
  await page.getByRole('row', { name: /Monday/ }).getByRole('button').click()
  const monday = page.getByRole('textbox', { name: 'Monday' })
  await expect(monday).toHaveValue('120')
  await monday.fill('45')
  await monday.press('Enter')
  await expect(page.getByTestId('week-total')).toContainText('885 min')
  await page.getByRole('button', { name: 'Save study time' }).click()
  await expect(page.getByRole('button', { name: 'Reschedule now' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row', { name: /Monday/ })).toContainText('45 min')
  await expect(page.getByTestId('week-total')).toContainText('885 min')
})

test('days off can be added and removed', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Date', { exact: true }).fill('2099-01-01')
  await page.getByRole('button', { name: 'Add day off' }).click()
  await expect(page.getByRole('list', { name: 'Days off' })).toContainText('2099-01-01')
  await page.getByRole('button', { name: 'Remove 2099-01-01' }).click()
  await expect(page.getByText('No days off.')).toBeVisible()
})

test('backup export, reset and import round trip', async ({ page }, info) => {
  await paste(page, fixture('system-design'))
  await importIt(page)
  await page.goto('/settings')
  await page.getByRole('row', { name: /Tuesday/ }).getByRole('button').click()
  await page.getByRole('textbox', { name: 'Tuesday' }).fill('77')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Save study time' }).click()
  await expect(page.getByText('Study time saved')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const file = info.outputPath('backup.json')
  await (await download).saveAs(file)
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { tables: { plans: unknown[] } }
  expect(backup.tables.plans).toHaveLength(1)

  await page.getByRole('button', { name: 'Reset local data' }).click()
  await expect(page.getByText(/no sync/)).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(0)
  const erase = page.getByRole('button', { name: 'Erase everything' })
  await expect(erase).toBeDisabled()
  await page.getByLabel('Confirmation').fill('reset')
  await erase.click()
  await expect(page.getByText('Local data erased')).toBeVisible()
  await expect(page.getByRole('row', { name: /Tuesday/ })).toContainText('120 min')

  await page.locator('input[type=file]').first().setInputFiles(file)
  // Checked first: counts and a confirm step, nothing written yet.
  await expect(page.getByText('backup.json is a valid backup')).toBeVisible()
  await expect(page.getByText(/plans: 1 added, 0 replaced, 0 stale/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Tuesday/ })).toContainText('120 min')
  await page.getByRole('button', { name: 'Import this backup' }).click()
  await expect(page.getByText('Backup imported')).toBeVisible()
  await expect(page.getByText(/plans: 1 added/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Tuesday/ })).toContainText('77 min')
})

test('a bad backup file is rejected without writing', async ({ page }, info) => {
  await page.goto('/settings')
  const bad = info.outputPath('bad.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(bad, '{"app":"other"}')
  await page.locator('input[type=file]').first().setInputFiles(bad)
  await expect(page.getByText(/Could not import the backup/)).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme}`, () => {
    test.use({ colorScheme })

    async function check(page: Page) {
      const { violations } = await new AxeBuilder({ page }).analyze()
      const bad = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
      expect(bad).toEqual([])
    }

    test('/import', async ({ page }) => {
      await page.goto('/import')
      await expect(page.getByRole('heading', { level: 1, name: 'Import' })).toBeVisible()
      await check(page)
    })

    test('/import with a plan under review', async ({ page }) => {
      await paste(page, fixture('system-design').replace('"schedulingMode"', '"unknownField": 1, "schedulingMode"'))
      await expect(page.getByRole('heading', { name: 'First 14 days' })).toBeVisible()
      await expect(page.getByText(/warning: /).first()).toBeVisible()
      await check(page)
    })

    test('/import, quick add', async ({ page }) => {
      await page.goto('/import')
      await page.getByRole('tab', { name: 'Quick add' }).click()
      await page.getByRole('tabpanel', { name: 'Quick add' }).getByRole('textbox', { name: 'Tasks, one per line' }).fill('Read 45m')
      await page.getByRole('button', { name: 'Review plan' }).click()
      await expect(page.getByText(/errors? blocks?/)).toBeVisible()
      await check(page)
    })

    test('/import, course calendar with a file loaded', async ({ page }) => {
      await page.goto('/import?tab=calendar')
      await page.getByRole('tabpanel', { name: 'From a course calendar' }).locator('input[type=file]').setInputFiles(fileURLToPath(new URL('../fixtures/calendars/canvas.ics', import.meta.url)))
      await expect(page.getByLabel('Minutes for Quiz 2')).toBeVisible()
      await check(page)
    })

    test('/settings', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('row', { name: /Monday/ })).toBeVisible()
      await check(page)
    })
  })
}
