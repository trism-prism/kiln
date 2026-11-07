import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// A plan about something other than coding interviews: no dailyPractice, so no LeetCode UI anywhere.
const plan = {
  schemaVersion: 1,
  id: 'music-theory',
  title: 'Music theory basics',
  schedulingMode: 'auto',
  modules: [{ id: 'm1', title: 'Scales', order: 1 }],
  tasks: [
    {
      id: 'major-scale',
      moduleId: 'm1',
      order: 1,
      title: 'The major scale',
      type: 'lesson',
      estimatedMinutes: 40,
      topics: ['scales'],
      description: 'Learn the pattern of whole and half steps.',
      objectives: ['Build a major scale from any note'],
      verificationQuestions: ['What is the step pattern?'],
      resources: [
        { title: 'Major scale explained', kind: 'video', minutes: 15, url: 'https://example.com/scale' },
        { title: 'Scale drills', kind: 'video', minutes: 10 },
        { title: 'Interval flashcards', kind: 'other', minutes: 10, url: 'https://quizlet.com/example' },
      ],
    },
  ],
}

test('a plan without daily practice shows no LeetCode UI, links its resources, and warns about videos without a link', async ({ page }) => {
  await page.goto('/import')
  await page.getByLabel('Plan text').fill(JSON.stringify(plan))
  await expect(page.getByText(/1 video without a link/)).toBeVisible()
  const go = page.getByRole('button', { name: /^Import "/ })
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page).toHaveURL(/\/plans\/.+/)

  await page.goto('/todo') // the plan starts tomorrow
  await page.getByRole('tab', { name: 'Next 7' }).click()
  const main = page.getByRole('main')
  await expect(main.getByRole('link', { name: 'The major scale' })).toBeVisible()
  await expect(main.getByText(/Daily problem|LeetCode|Solve in/)).toHaveCount(0)

  await main.getByRole('link', { name: 'The major scale' }).click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  const link = page.getByRole('link', { name: 'Major scale explained (Video, opens in a new tab)' })
  await expect(link).toHaveAttribute('href', 'https://example.com/scale')
  await expect(page.getByRole('link', { name: /^Interval flashcards/ })).toHaveAttribute('href', 'https://quizlet.com/example')
  await expect(page.getByText('Scale drills')).toBeVisible() // no link: plain text
  await expect(page.getByRole('link', { name: /^Scale drills/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Practice' })).toHaveCount(0)

  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})
