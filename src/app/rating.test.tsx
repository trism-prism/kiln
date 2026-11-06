// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { useCompleter } from './rating'
import { db, listPlans, listTasks } from '../data'
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
  it('lists today, matches the badge, and completes a lesson through the rating sheet (keys 1-4)', async () => {
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
    const dialog = await screen.findByRole('dialog', { name: 'How did it go?' })
    expect(dialog.textContent).toContain('Again')
    expect(dialog.textContent).toContain('Easy')
    await user.keyboard('4')
    await waitFor(() => expect((first as HTMLInputElement).checked).toBe(true))

    const tasks = (await Promise.all((await listPlans(db)).map((p) => listTasks(db, p.id)))).flat()
    const done = tasks.filter((t) => t.status === 'done')
    expect(done).toHaveLength(1)
    const cards = await db.reviewCards.toArray()
    expect(cards).toHaveLength(1)
    expect(cards[0]!.taskId).toBe(done[0]!.id)
    const logs = await db.reviewLogs.toArray()
    expect(logs.map((l) => l.rating)).toEqual([4]) // key 4 = Easy
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

function Harness({ rates, id }: { rates: boolean; id: string }) {
  const { complete, sheet } = useCompleter()
  return (
    <>
      <button onClick={() => complete({ kind: 'task', id, title: 'Some task', rates })}>go</button>
      {sheet}
    </>
  )
}

describe('useCompleter', () => {
  async function oneTask(type: 'lesson' | 'milestone') {
    await seedFixtures(db)
    const tasks = (await Promise.all((await listPlans(db)).map((p) => listTasks(db, p.id)))).flat()
    return tasks.find((t) => t.type === type)!
  }

  it('asks for a rating when the task gets a review card', async () => {
    const t = await oneTask('lesson')
    render(<Harness rates id={t.id} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'go' }))
    expect(await screen.findByRole('dialog', { name: 'How did it go?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Hard/ }))
    await waitFor(async () => expect((await db.tasks.get(t.id))!.status).toBe('done'))
    expect((await db.reviewLogs.toArray()).map((l) => l.rating)).toEqual([2])
  })

  it('completes straight away, without a sheet or a card, for a task that gets none', async () => {
    const t = await oneTask('milestone')
    render(<Harness rates={false} id={t.id} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }))
    await waitFor(async () => expect((await db.tasks.get(t.id))!.status).toBe('done'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await db.reviewCards.count()).toBe(0)
  })

  it('closing the sheet without a rating changes nothing', async () => {
    const t = await oneTask('lesson')
    render(<Harness rates id={t.id} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'go' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await db.tasks.get(t.id))!.status).toBe('open')
  })
})
