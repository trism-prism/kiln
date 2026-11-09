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
// Poll fast: the panels look at the server every 2 seconds in the app.
vi.mock('../../sync', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../sync')>()
  return {
    ...m,
    hostPairing: (o: Parameters<typeof m.hostPairing>[0]) => m.hostPairing({ ...o, pollMs: 5 }),
    joinPairing: (o: Parameters<typeof m.joinPairing>[0]) => m.joinPairing({ ...o, pollMs: 5 }),
  }
})

import { db } from '../../data'
import { enableSyncKey, generateSyncKey, getSyncKey } from '../../sync'
import { SyncSection } from './SyncSection'

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status })
type Route = (path: string, body: Record<string, unknown>) => Response | Promise<Response>
/** Stubs fetch with a handler per path; anything not handled is offline. */
const serve = (routes: Record<string, Route>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname
      const h = routes[path]
      if (!h) throw new TypeError('offline')
      return h(path, JSON.parse(String(init?.body ?? '{}')))
    }),
  )
const calls = (path: string) => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).endsWith(path)).length

beforeEach(() => {
  env.url = 'https://api.test'
  serve({})
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await db.meta.clear()
})

const on = () => enableSyncKey(db, generateSyncKey())
const button = (name: string | RegExp) => screen.findByRole('button', { name })

describe('Settings > Sync, off', () => {
  it('explains when the build has no server address and offers nothing', async () => {
    env.url = ''
    render(<SyncSection />)
    expect(await screen.findByText(/no server address/)).toBeTruthy()
    expect(((await button('Set up sync')) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Join with a code' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says why sync is off after another device disconnected it', async () => {
    await db.meta.put({ key: 'syncDisconnected', value: '1' })
    render(<SyncSection />)
    expect(await screen.findByText('Sync was turned off from another device. Everything on this device stays here.')).toBeTruthy()
    expect(await button('Set up sync')).toBeTruthy()
  })

  it('set up shows a 6-digit code with a countdown, and cancel leaves sync off', async () => {
    serve({ '/pair/start': () => reply(201, { slot: '07', expiresIn: 180 }), '/pair/poll': () => reply(200, { state: 'waiting', wrong: 0 }) })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Set up sync'))
    const code = await screen.findByTestId('pair-code')
    expect(code.textContent).toMatch(/^07\d \d{3}$/)
    expect(screen.getByText(/On your other device, open Settings > Sync, choose Join with a code/)).toBeTruthy()
    expect(screen.getByText(/Expires in [23]:\d\d/)).toBeTruthy()
    expect(await screen.findByText('Waiting for your other device...')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await button('Set up sync')).toBeTruthy()
    expect(await getSyncKey(db)).toBeUndefined()
  })

  it('shows a wrong try on the host screen, with the tries left', async () => {
    let replied: unknown
    serve({
      '/pair/start': () => reply(201, { slot: '07', expiresIn: 180 }),
      // An answer that cannot match (the identity point): the host rejects it.
      '/pair/poll': () => reply(200, replied === undefined ? { state: 'answer', msgB: 'A'.repeat(43), tagB: 'A'.repeat(43), wrong: 0 } : { state: 'waiting', wrong: 1 }),
      '/pair/reply': (_p, b) => ((replied = b.box), reply(204)),
    })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Set up sync'))
    expect(await screen.findByText('Someone entered a wrong code. 2 tries left.')).toBeTruthy()
    expect(replied).toBeNull()
    expect(screen.getByTestId('pair-code')).toBeTruthy()
  })

  it('offers a new code when the code expired, and when too many tries were wrong', async () => {
    let n = 0
    serve({
      '/pair/start': () => (n++, reply(201, { slot: '07', expiresIn: 180 })),
      '/pair/poll': () => (n === 1 ? reply(404, {}) : reply(200, { state: 'waiting', wrong: 3 })),
    })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Set up sync'))
    expect(await screen.findByText('This code expired.')).toBeTruthy()
    expect(screen.queryByTestId('pair-code')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Get a new code' }))
    expect(await screen.findByText('Too many wrong tries, so this code no longer works.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Get a new code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(n).toBe(2)
  })

  it('tells what went wrong when no code could be made', async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Set up sync'))
    expect(await screen.findByText('Could not reach the server. Check your connection and try again.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    serve({ '/pair/start': () => reply(503, { error: 'x' }) })
    await user.click(await button('Set up sync'))
    expect(await screen.findByText('Too many devices are pairing right now. Try again in a few minutes.')).toBeTruthy()
  })
})

describe('Settings > Sync, join with a code', () => {
  const open = async () => {
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Join with a code'))
    return { user, field: screen.getByRole('textbox', { name: 'Code from your other device' }) as HTMLInputElement }
  }

  it('takes digits only, and the Join button waits for six', async () => {
    const { user, field } = await open()
    expect(field.inputMode).toBe('numeric')
    expect(screen.getByText('6 digits, shown under Settings > Sync on the device that already syncs.')).toBeTruthy()
    const join = screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement
    expect(join.disabled).toBe(true)
    await user.type(field, '07a4-8')
    expect(field.value).toBe('074 8')
    expect(join.disabled).toBe(true)
    await user.type(field, '2 1999')
    expect(field.value).toBe('074 821')
    expect(join.disabled).toBe(false)
  })

  it('pasting a code with spaces works', async () => {
    const { user, field } = await open()
    await user.click(field)
    await user.paste(' 074 821 ')
    expect(field.value).toBe('074 821')
  })

  it('says a code is not valid, and clears the field', async () => {
    serve({ '/pair/join': () => reply(404, { error: 'x' }) })
    const { user, field } = await open()
    await user.type(field, '074821')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText('That code is not valid or has expired. Get a new code on your other device.')).toBeTruthy()
    expect(field.value).toBe('')
    expect(await getSyncKey(db)).toBeUndefined()
  })

  it('tells a busy code and a rate limit apart', async () => {
    // The ristretto255 base point stands in for the host's message.
    const base = Buffer.from('e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76', 'hex').toString('base64url')
    const joined = { sid: 'AAAAAAAAAAAAAAAAAAAAAA', msgA: base }
    serve({ '/pair/join': () => reply(429, {}) })
    const { user, field } = await open()
    await user.type(field, '074821')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeTruthy()
    serve({ '/pair/join': () => reply(200, joined), '/pair/answer': () => reply(409, {}) })
    await user.type(field, '074821')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText('Another device is using this code right now. Try again in a moment.')).toBeTruthy()
  })

  it('cancel goes back to the two buttons', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await button('Set up sync')).toBeTruthy()
    expect(calls('/pair/join')).toBe(0)
  })
})

describe('Settings > Sync, on', () => {
  it('shows the summary of the last run, with the wrong-key message', async () => {
    await on()
    serve({ '/sync/pull': () => reply(403, {}) })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Sync now'))
    await waitFor(() => expect(screen.getByTestId('sync-summary').textContent).toMatch(/does not accept this device's sync link/))
    expect(screen.getByTestId('sync-summary').textContent).toMatch(/Received 0/)
  })

  it('shows offline as a calm message, not an alarm', async () => {
    await on()
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Sync now'))
    await waitFor(() => expect(screen.getByTestId('sync-summary').textContent).toMatch(/Offline/))
  })

  it('offers Sync a device, which shows a code made from this key', async () => {
    await on()
    const bodies: Record<string, unknown>[] = []
    serve({ '/pair/start': (_p, b) => (bodies.push(b), reply(201, { slot: '42', expiresIn: 180 })), '/pair/poll': () => reply(200, { state: 'waiting', wrong: 0 }) })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Sync a device'))
    expect((await screen.findByTestId('pair-code')).textContent).toMatch(/^42\d \d{3}$/)
    expect(bodies).toHaveLength(1)
    // The key is not sent: only the host's message, a token and the session id.
    expect(Object.keys(bodies[0]!).sort()).toEqual(['hostToken', 'msgA', 'sid'])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await button('Sync now')).toBeTruthy()
    expect(await getSyncKey(db)).toBeDefined()
  })

  it('disconnects after a confirmation: the key goes, the server is told', async () => {
    await on()
    serve({ '/sync/close': () => reply(204) })
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Disconnect device'))
    expect(await screen.findByText(/This stops sync on this device and on every device it syncs with/)).toBeTruthy()
    expect(screen.getByText(/The synced copy is deleted from the server/)).toBeTruthy()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' }))
    expect(await button('Set up sync')).toBeTruthy()
    expect(calls('/sync/close')).toBe(1)
    expect(await getSyncKey(db)).toBeUndefined()
  })

  it('keeps sync on, and says so, when the server cannot be reached', async () => {
    await on()
    const user = userEvent.setup()
    render(<SyncSection />)
    await user.click(await button('Disconnect device'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByText('Could not reach the server, so sync is still on. Try again when you are online.')).toBeTruthy()
    expect(await getSyncKey(db)).toBeDefined()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await button('Sync now')).toBeTruthy()
  })
})
