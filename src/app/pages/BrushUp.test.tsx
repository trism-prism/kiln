// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../data'
import { seedFixtures } from '../../data/seed'
import BrushUpPage from './BrushUp'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter>
      <BrushUpPage />
    </MemoryRouter>,
  )
const LINE = "Turn on Schedule reviews in a plan's settings."

describe('Brush up with reviews off', () => {
  it('offers the switch when a plan has lessons', async () => {
    await seedFixtures(db)
    renderPage()
    expect(await screen.findByText(LINE)).toBeTruthy()
    expect(screen.queryByText('Mastery by topic')).toBeNull()
  })

  it('shows the normal empty state with no plans', async () => {
    renderPage()
    expect(await screen.findByText('Nothing to brush up on')).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('shows the normal empty state when no plan has anything to review', async () => {
    await seedFixtures(db)
    await db.tasks.toCollection().modify({ type: 'project', practice: undefined })
    renderPage()
    expect(await screen.findByText('Nothing to brush up on')).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('shows the normal page once a plan has reviews on', async () => {
    await seedFixtures(db, undefined, true)
    renderPage()
    expect(await screen.findByText('Nothing to brush up on')).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })
})
