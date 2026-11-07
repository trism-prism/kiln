// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { useCompleter } from './rating'
import { db, dueCards, listPlans, listTasks } from '../data'
import { seedFixtures } from '../data/seed'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterEach(cleanup)

const badge = () => {
  const name = screen.getAllByRole('link', { name: /^To Do/ })[0]!.getAttribute('aria-label') ?? ''
  return Number(/, (\d+) items? due/.exec(name)?.[1] ?? 0)
}

describe('To Do page with sample plans', () => {
  it('lists today, matches the badge, and completes a lesson with one click', async () => {
    await seedFixtures(db)
    render(
      <MemoryRouter initialEntries={['/todo']}>
        <App />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    const boxes = await screen.findAllByRole('checkbox', { name: /^Mark done:/ })
    expect(boxes.length).toBeGreaterThan(1)
    await waitFor(() => expect(badge()).toBe(boxes.length))

    // The first row is the plan's first lesson; a daily LeetCode problem is listed too, with its link.
    expect(screen.getAllByText('Daily problem', { exact: false }).length).toBeGreaterThan(0)
    const solve = screen.getAllByRole('link', { name: /^Solve in Python/ })[0]!
    expect(solve.getAttribute('href')).toMatch(/^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/)
    expect(solve.getAttribute('rel')).toContain('noopener')

    const first = boxes[0]!
    await user.click(first)
    // No rating step: the lesson is done at once and no dialog appears, before or after the write.
    await waitFor(() => expect((first as HTMLInputElement).checked).toBe(true))
    expect(screen.queryByRole('dialog')).toBeNull()

    const tasks = (await Promise.all((await listPlans(db)).map((p) => listTasks(db, p.id)))).flat()
    expect(tasks.filter((t) => t.status === 'done')).toHaveLength(1)
    // Reviews are off (the default): the card is kept but hidden from the due list.
    expect(await db.reviewCards.count()).toBe(1)
    expect(await dueCards(db, '2099-01-01')).toEqual([])
    await waitFor(() => expect(badge()).toBe(boxes.length - 1))
    // The row stays in place, checked and disabled.
    expect((first as HTMLInputElement).disabled).toBe(true)
  })

  it('shows the import prompt without plans', async () => {
    render(
      <MemoryRouter initialEntries={['/todo']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'No plans yet' })).toBeTruthy()
  })
})

function Harness({ id }: { id: string }) {
  const { complete } = useCompleter()
  return <button onClick={() => complete({ kind: 'task', id, title: 'Some task' })}>go</button>
}

describe('useCompleter', () => {
  async function oneTask(type: 'lesson' | 'milestone') {
    await seedFixtures(db)
    const tasks = (await Promise.all((await listPlans(db)).map((p) => listTasks(db, p.id)))).flat()
    return tasks.find((t) => t.type === type)!
  }

  it('completes a lesson straight away while its plan has reviews off, keeping a hidden card', async () => {
    const t = await oneTask('lesson')
    render(<Harness id={t.id} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }))
    await waitFor(async () => expect((await db.tasks.get(t.id))!.status).toBe('done'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await db.reviewCards.count()).toBe(1)
    expect(await dueCards(db, '2099-01-01')).toEqual([])
  })

  it('makes a card, rated good, when the plan has reviews on', async () => {
    const t = await oneTask('lesson')
    await db.plans.update(t.planId, { reviewsOn: true })
    render(<Harness id={t.id} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }))
    await waitFor(async () => expect(await db.reviewCards.count()).toBe(1))
    expect((await db.reviewLogs.toArray()).map((l) => l.rating)).toEqual([3])
  })

  it('completes a task that gets no card without one even with reviews on', async () => {
    const t = await oneTask('milestone')
    await db.plans.update(t.planId, { reviewsOn: true })
    render(<Harness id={t.id} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }))
    await waitFor(async () => expect((await db.tasks.get(t.id))!.status).toBe('done'))
    expect(await db.reviewCards.count()).toBe(0)
  })
})
