// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validatePlan, type Issue } from '../../domain/plan-format'
import { Report } from './Report'

afterEach(cleanup)

const issues: Issue[] = [
  { path: 'tasks[13]', message: 'tasks[13] "Two Sum": estimatedMinutes is required', severity: 'error' },
  { path: 'tasks[2]', message: 'tasks[2] "Edit Distance": estimatedMinutes is 120; split work over 90 minutes into sessions', severity: 'warning' },
  { path: 'plan', message: 'plan: unknown field', severity: 'error' },
]

describe('Report', () => {
  it('renders nothing without problems', () => {
    const { container } = render(<Report issues={[]} />)
    expect(container.textContent).toBe('')
  })

  it('groups errors and warnings, with the warning prefix, and says errors block the import', () => {
    render(<Report issues={issues} />)
    expect(screen.getByRole('status').textContent).toContain('2 errors block the import')
    const errors = screen.getByRole('region', { name: 'Errors' })
    expect(within(errors).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'tasks[13] "Two Sum": estimatedMinutes is required',
      'plan: unknown field',
    ])
    const warnings = screen.getByRole('region', { name: 'Warnings' })
    expect(within(warnings).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'warning: tasks[2] "Edit Distance": estimatedMinutes is 120; split work over 90 minutes into sessions',
    ])
  })

  it('warnings alone do not block', () => {
    render(<Report issues={[issues[1] as Issue]} />)
    expect(screen.getByRole('status').textContent).toContain('Warnings do not block the import')
    expect(screen.queryByRole('region', { name: 'Errors' })).toBeNull()
  })

  it('renders what the validator returns for broken JSON, with line and column', () => {
    render(<Report issues={validatePlan('{\n  "id": ,\n}').issues} />)
    expect(screen.getByText(/^json: line 2, column 9: unexpected ","/)).toBeTruthy()
  })

  it('copies every problem, one per line', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<Report issues={issues} />)
    await user.click(screen.getByRole('button', { name: /Copy/ }))
    expect(writeText).toHaveBeenCalledWith(
      [
        'tasks[13] "Two Sum": estimatedMinutes is required',
        'warning: tasks[2] "Edit Distance": estimatedMinutes is 120; split work over 90 minutes into sessions',
        'plan: unknown field',
      ].join('\n'),
    )
  })
})
