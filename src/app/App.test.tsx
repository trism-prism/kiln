// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(cleanup)

const routes: [string, string][] = [
  ['/', 'Dashboard'],
  ['/todo', 'To Do'],
  ['/task/abc', 'Task'],
  ['/calendar', 'Calendar'],
  ['/plans', 'Plans'],
  ['/plans/abc', 'Plan'],
  ['/brush-up', 'Brush up'],
  ['/import', 'Import'],
  ['/settings', 'Settings'],
  ['/design', 'Design system'],
  ['/nowhere', 'Page not found'],
]

describe('shell routes', () => {
  it.each(routes)('%s renders the shell and its page heading', async (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy()
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'To Do, 3 items due' }).length).toBeGreaterThan(0)
  })
})
