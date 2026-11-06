// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ url: 'https://api.test' }))
vi.mock('../../pwa/env', () => ({
  get API_URL() {
    return env.url
  },
  VAPID_PUBLIC_KEY: '',
}))

import { db } from '../../data'
import { getSyncSecret } from '../../sync'
import { SyncSection } from './SyncSection'

const WORDS = Array(23).fill('abandon').concat('art').join(' ')
const offline = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline')
    }),
  )

beforeEach(() => {
  env.url = 'https://api.test'
  offline()
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await db.meta.clear()
})

describe('Settings > Sync', () => {
  it('explains when the build has no server address and offers nothing', async () => {
    env.url = ''
    render(<SyncSection />)
    expect(await screen.findByText(/no server address/)).toBeTruthy()
    expect(((await screen.findByRole('button', { name: 'Create a sync key' })) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Join with a key' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates a key and shows the 24 words, the QR code and a warning', async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await screen.findByRole('button', { name: 'Create a sync key' }))
    const list = await screen.findByRole('list', { name: 'Sync key, 24 words' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByRole('img', { name: 'QR code of your sync key' })).toBeTruthy()
    expect(screen.getByText(/unlock all your Kiln data/)).toBeTruthy()
    const secret = await getSyncSecret(db)
    expect(list.textContent?.replace(/[0-9]+\./g, ' ').split(/\s+/).filter(Boolean).join(' ')).toBe(secret?.mnemonic)
    expect(screen.getByText(/Sync is on/)).toBeTruthy()
  })

  it('validates typed words before joining and then turns sync on', async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await screen.findByRole('button', { name: 'Join with a key' }))
    const box = screen.getByRole('textbox', { name: 'Sync key' })
    const join = screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement

    await user.type(box, 'abandon abandon abandon')
    expect(screen.getByText('3 of 24 words')).toBeTruthy()
    expect(join.disabled).toBe(true)

    await user.clear(box)
    await user.click(box)
    await user.paste(Array(24).fill('abandon').join(' '))
    expect(screen.getByText(/not a valid sync key/)).toBeTruthy()
    expect(join.disabled).toBe(true)

    await user.clear(box)
    await user.click(box)
    await user.paste(WORDS)
    expect(screen.getByText('This is a valid sync key.')).toBeTruthy()
    expect(join.disabled).toBe(false)

    await user.click(join)
    await waitFor(async () => expect((await getSyncSecret(db))?.mnemonic).toBe(WORDS))
    expect(await screen.findByText(/Sync is on/)).toBeTruthy()
  })

  it('shows the summary of the last run, with the wrong-key message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await screen.findByRole('button', { name: 'Create a sync key' }))
    await user.click(await screen.findByRole('button', { name: 'Sync now' }))
    const summary = await screen.findByTestId('sync-summary')
    expect(summary.textContent).toMatch(/does not match the data on the server/)
    expect(summary.textContent).toMatch(/Received 0/)
  })

  it('shows offline as a calm message, not an alarm', async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await screen.findByRole('button', { name: 'Create a sync key' }))
    await user.click(await screen.findByRole('button', { name: 'Sync now' }))
    expect((await screen.findByTestId('sync-summary')).textContent).toMatch(/Offline/)
  })

  it('turns sync off after a confirmation, keeping the data', async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await screen.findByRole('button', { name: 'Create a sync key' }))
    await user.click(await screen.findByRole('button', { name: 'Turn off sync' }))
    expect(await screen.findByText(/Your plans and tasks stay on this device/)).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Turn off sync' }))
    expect(await screen.findByRole('button', { name: 'Create a sync key' })).toBeTruthy()
    expect(await getSyncSecret(db)).toBeUndefined()
  })
})
