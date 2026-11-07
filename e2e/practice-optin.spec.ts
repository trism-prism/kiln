import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// A plan about something other than coding interviews: no dailyPractice, so no LeetCode UI anywhere.
const plan = {
  schemaVersion: 1,
  id: 'music-theory',
  title: 'Music theory basics',
  schedulingMode: 'auto',
  sources: [{ id: 'course', title: 'Theory course', kind: 'course', url: 'https://example.com/course' }],
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
        { title: 'Course lecture', kind: 'video', minutes: 10, sourceId: 'course' },
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

  const planPage = page.url()

  // The plan starts tomorrow, so today's list is empty; no LeetCode wording appears on it or the Dashboard.
  for (const path of ['/todo', '/']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('main').getByText(/Daily problem|LeetCode|Solve in/)).toHaveCount(0)
  }

  await page.goto(planPage)
  await expect(page.getByRole('main').getByText(/Daily problem|LeetCode|Solve in/)).toHaveCount(0)
  await page.locator('details').first().getByRole('link', { name: 'The major scale' }).click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  const link = page.getByRole('link', { name: 'Major scale explained (Video, opens in a new tab)' })
  await expect(link).toHaveAttribute('href', 'https://example.com/scale')
  await expect(page.getByRole('link', { name: /^Interval flashcards/ })).toHaveAttribute('href', 'https://quizlet.com/example')
  // A video with no url of its own takes the link of its source.
  await expect(page.getByRole('link', { name: /^Course lecture/ })).toHaveAttribute('href', 'https://example.com/course')
  await expect(page.getByText('Scale drills')).toBeVisible() // no link: plain text
  await expect(page.getByRole('link', { name: /^Scale drills/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Practice' })).toHaveCount(0)

  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})
