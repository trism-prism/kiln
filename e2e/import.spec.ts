import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/plans/${name}.json`, import.meta.url), 'utf8')
const publicFile = (name: string) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

async function paste(page: Page, text: string) {
  await page.goto('/import')
  await page.getByLabel('Plan text').fill(text)
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
  await expect(page.getByTestId('projection')).toContainText('Projected finish')
  await expect(page.getByRole('heading', { name: 'First 14 days' })).toBeVisible()
  await importIt(page, /^Add part \d of 3 to "DSA Zero to Hero in Python"/)

  await paste(page, fixture('system-design'))
  await expect(page.getByTestId('match')).toHaveText('New plan')
  await expect(page.getByTestId('projection')).toContainText('Projected finish')
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
  await expect(page.getByLabel('Plan text')).toHaveValue(/^moduleId,/)
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
  await expect(page.getByText('Spreadsheet loaded: kiln-plan-template.xlsx')).toBeVisible()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Excel plan')
  await importIt(page)
})

test.describe('clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  for (const [button, mentions] of [
    ['Copy prompt (Kiln assigns dates)', 'schemaVersion'],
    ['Copy prompt (fixed dates)', 'fixedDate'],
  ] as const) {
    test(`${button} puts the prompt on the clipboard`, async ({ page }) => {
      await page.goto('/import')
      await page.getByRole('button', { name: button }).click()
      await expect(page.getByText('Prompt copied')).toBeVisible()
      const text = await page.evaluate(() => navigator.clipboard.readText())
      expect(text.length).toBeGreaterThan(2000)
      expect(text).toContain(mentions)
      expect(text).not.toContain('{{SCHEMA_REFERENCE}}')
    })
  }

  test('Paste from clipboard fills the box', async ({ page }) => {
    await page.goto('/import')
    await page.evaluate((t) => navigator.clipboard.writeText(t), '{"hello": 1}')
    await page.getByRole('button', { name: 'Paste from clipboard' }).click()
    await expect(page.getByLabel('Plan text')).toHaveValue('{"hello": 1}')
  })
})

test('Paste from clipboard shows a hint when the browser refuses', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('button', { name: 'Paste from clipboard' }).click()
  await expect(page.getByText(/could not read the clipboard/)).toBeVisible()
  await expect(page.getByLabel('Plan text')).toBeFocused()
})

test('builds a plan by hand and imports it', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Build by hand' }).click()
  await page.getByLabel('Plan title').fill('Hand made')
  await page.getByLabel('Module 1 title').fill('Basics')
  const task = page.getByRole('group', { name: 'Task 1.1' })
  await task.getByLabel('Title').fill('Read chapter one')
  await task.getByLabel('Minutes').fill('45')
  await page.getByRole('button', { name: 'Add task to module 1' }).click()
  const second = page.getByRole('group', { name: 'Task 1.2' })
  await second.getByLabel('Title').fill('Two Sum')
  await second.getByLabel('Minutes').fill('30')
  await second.getByRole('button', { name: /Type/ }).click()
  await page.getByRole('option', { name: 'practice' }).click()
  await second.getByLabel('LeetCode problem (optional)').fill('two-sum')
  await page.getByRole('button', { name: 'Review plan' }).click()
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
  await expect(page.getByLabel('Plan id')).toHaveValue('hand-made')
  await importIt(page)
})

test('the builder reports a missing duration', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('tab', { name: 'Build by hand' }).click()
  await page.getByLabel('Plan title').fill('Hand made')
  await page.getByLabel('Module 1 title').fill('Basics')
  await page.getByRole('group', { name: 'Task 1.1' }).getByLabel('Title').fill('Read')
  await page.getByRole('button', { name: 'Review plan' }).click()
  await expect(page.getByText(/^tasks\[0\] "Read": estimatedMinutes is required$/)).toBeVisible()
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
  await page.getByLabel('Date', { exact: true }).fill('2027-01-01')
  await page.getByRole('button', { name: 'Add day off' }).click()
  await expect(page.getByRole('list', { name: 'Days off' })).toContainText('2027-01-01')
  await page.getByRole('button', { name: 'Remove 2027-01-01' }).click()
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

    test('/import, build by hand', async ({ page }) => {
      await page.goto('/import')
      await page.getByRole('tab', { name: 'Build by hand' }).click()
      await page.getByLabel('Module 1 title').fill('Basics')
      await page.getByRole('button', { name: 'Review plan' }).click()
      await expect(page.getByText(/errors? blocks?/)).toBeVisible()
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
