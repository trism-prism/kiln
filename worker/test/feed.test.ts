import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { checkFeedUrl, fetchFeed, MAX_FEED_BYTES, type FeedDeps } from '../src/feed'
import { HttpError } from '../src/http'

const GOOD = 'https://school.instructure.com/feeds/calendars/user_abc123.ics'
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'

const allow: RateLimit = { limit: async () => ({ success: true }) }
const deny: RateLimit = { limit: async () => ({ success: false }) }

type Call = { url: string; init?: RequestInit }
function fake(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return answer(url, init)
  }) as typeof fetch
  return { f, calls }
}

const deps = (f: typeof fetch, over: Partial<FeedDeps> = {}): FeedDeps => ({ fetch: f, timeoutMs: 1000, limiter: allow, ...over })

/** Runs fetchFeed and returns [status, error message or body text]. */
async function run(body: unknown, d: FeedDeps): Promise<[number, string]> {
  try {
    const r = await fetchFeed(body, '203.0.113.9', d)
    return [r.status, await r.text()]
  } catch (e) {
    if (e instanceof HttpError) return [e.status, e.message]
    throw e
  }
}

const ok = () => fake(() => new Response(ICS, { status: 200 }))

afterEach(() => vi.restoreAllMocks())

describe('checkFeedUrl', () => {
  it('accepts https .ics feeds of the supported LMSs and the Moodle export path', () => {
    for (const u of [
      GOOD,
      'https://learn.example.edu/webapps/calendar/calendarFeed/abc/learn.ics',
      'https://moodle.school.edu/calendar/export_execute.php?userid=2&authtoken=x&preset_what=all&preset_time=recentupcoming',
      'https://school.brightspace.com/d2l/le/calendar/feed/user/feed.ics?token=abc',
      'https://app.schoology.com/calendar/feed/ical/123/abc/ical.ics',
      'https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics',
      'https://Canvas.School.EDU./feeds/calendars/user_X.ICS',
    ]) {
      expect(checkFeedUrl(u), u).toBeInstanceOf(URL)
    }
  })

  it('refuses anything but https', () => {
    for (const u of ['http://school.instructure.com/a.ics', 'webcal://school.instructure.com/a.ics', 'ftp://school.edu/a.ics', 'file:///etc/a.ics', 'data:text/calendar,BEGIN.ics'])
      expect(checkFeedUrl(u), u).toBe('url must use https')
  })

  it('refuses paths that are not calendar feeds', () => {
    for (const u of ['https://school.instructure.com/', 'https://school.instructure.com/api/v1/users/self', 'https://school.edu/a.ics/../admin', 'https://school.edu/feed.ics.php'])
      expect(checkFeedUrl(u), u).toBe('url must be a calendar feed (.ics)')
  })

  it('refuses every IP literal: loopback, private, link-local, metadata, IPv6, and odd IPv4 spellings', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.5.4',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '8.8.8.8',
      '[::1]',
      '[fd00::1]',
      '[fe80::1]',
      '[::ffff:127.0.0.1]',
      '[::ffff:a9fe:a9fe]',
      '2130706433',
      '0x7f000001',
      '0x7f.0.0.1',
      '0177.0.0.1',
      '127.1',
      '127.0.0.1.',
    ]) {
      expect(checkFeedUrl(`https://${host}/feed.ics`), host).toBe('url must use a host name, not an IP address')
    }
  })

  it('refuses localhost and private-network names', () => {
    for (const host of ['localhost', 'LOCALHOST.', 'api.localhost', 'printer.local', 'metadata.google.internal', 'intranet', 'nas.lan', 'router.home', 'x.home.arpa', 'site.test'])
      expect(checkFeedUrl(`https://${host}/feed.ics`), host).toBe('url must use a public host name')
  })

  it('refuses credentials, other ports and bad input', () => {
    expect(checkFeedUrl('https://user:pw@school.edu/a.ics')).toBe('url must not contain a user name or password')
    expect(checkFeedUrl('https://user@school.edu/a.ics')).toBe('url must not contain a user name or password')
    expect(checkFeedUrl('https://school.edu:8443/a.ics')).toBe('url must use the default https port')
    expect(checkFeedUrl('https://school.edu:443/a.ics')).toBeInstanceOf(URL) // the default port is dropped by the parser
    expect(checkFeedUrl('not a url')).toBe('url is not a valid URL')
    expect(checkFeedUrl(42)).toMatch(/^url must be 1-2048/)
    expect(checkFeedUrl(`https://school.edu/${'a'.repeat(2048)}.ics`)).toMatch(/^url must be 1-2048/)
  })
})

describe('fetchFeed', () => {
  it('returns the calendar as text/calendar, no-store, and forwards nothing from the caller', async () => {
    const { f, calls } = ok()
    const r = await fetchFeed({ url: GOOD }, '203.0.113.9', deps(f))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.text()).toBe(ICS)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.redirect).toBe('manual')
    expect(calls[0]?.init?.method).toBe('GET')
    expect(Object.keys(calls[0]?.init?.headers as Record<string, string>).sort()).toEqual(['accept', 'user-agent'])
  })

  it('never fetches a refused URL', async () => {
    const { f, calls } = ok()
    for (const url of ['http://school.edu/a.ics', 'https://127.0.0.1/a.ics', 'https://localhost/a.ics', 'https://school.edu/a.txt']) {
      expect((await run({ url }, deps(f)))[0]).toBe(400)
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects bodies other than {url}', async () => {
    const { f, calls } = ok()
    expect(await run({ url: GOOD, extra: 1 }, deps(f))).toEqual([400, 'body must be {url}'])
    expect(await run(null, deps(f))).toEqual([400, 'body must be {url}'])
    expect(await run([GOOD], deps(f))).toEqual([400, 'body must be {url}'])
    expect(calls).toHaveLength(0)
  })

  describe('redirects (manual, each hop re-checked)', () => {
    const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } })

    it('follows a redirect to another valid feed URL, resolving relative locations', async () => {
      const { f, calls } = fake((u) => (u === GOOD ? redirect('/feeds/calendars/user_moved.ics', 301) : new Response(ICS)))
      expect((await run({ url: GOOD }, deps(f)))[0]).toBe(200)
      expect(calls.map((c) => c.url)).toEqual([GOOD, 'https://school.instructure.com/feeds/calendars/user_moved.ics'])
      expect(calls.every((c) => c.init?.redirect === 'manual')).toBe(true)
    })

    for (const [name, to] of [
      ['to http', 'http://school.instructure.com/feeds/calendars/user_abc123.ics'],
      ['to the metadata IP', 'https://169.254.169.254/latest/meta-data.ics'],
      ['to a private IP', 'https://10.1.2.3/feed.ics'],
      ['to IPv6 loopback', 'https://[::1]/feed.ics'],
      ['to localhost', 'https://localhost/feed.ics'],
      ['to an internal name', 'https://metadata.google.internal/feed.ics'],
      ['to a non-feed path', 'https://school.instructure.com/api/v1/users/self'],
      ['to another port', 'https://school.instructure.com:8080/feed.ics'],
    ] as const) {
      it(`refuses a redirect ${name} and does not follow it`, async () => {
        const { f, calls } = fake(() => redirect(to))
        const [status, msg] = await run({ url: GOOD }, deps(f))
        expect(status).toBe(502)
        expect(msg).toMatch(/^the calendar server redirected to a refused address/)
        expect(calls).toHaveLength(1)
      })
    }

    it('stops after 3 redirects', async () => {
      let n = 0
      const { f, calls } = fake(() => redirect(`https://school.instructure.com/hop${++n}.ics`, 307))
      expect(await run({ url: GOOD }, deps(f))).toEqual([502, 'the calendar server redirected too many times'])
      expect(calls).toHaveLength(4)
    })

    it('refuses a redirect without a location', async () => {
      const { f } = fake(() => new Response(null, { status: 302 }))
      expect((await run({ url: GOOD }, deps(f)))[0]).toBe(502)
    })
  })

  describe('2 MB cap', () => {
    it('refuses a declared Content-Length over 2 MB before reading', async () => {
      const { f } = fake(() => new Response(ICS, { headers: { 'content-length': String(MAX_FEED_BYTES + 1) } }))
      expect(await run({ url: GOOD }, deps(f))).toEqual([413, 'the calendar is larger than 2 MB'])
    })

    it('counts the streamed bytes when there is no Content-Length', async () => {
      const chunk = new TextEncoder().encode('X'.repeat(64 * 1024))
      let sent = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          if (sent === 0) c.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR\r\n'))
          c.enqueue(chunk)
          sent += chunk.length
          if (sent > MAX_FEED_BYTES * 2) c.close()
        },
      })
      const { f } = fake(() => new Response(stream))
      expect(await run({ url: GOOD }, deps(f))).toEqual([413, 'the calendar is larger than 2 MB'])
      expect(sent).toBeLessThan(MAX_FEED_BYTES + 3 * chunk.length)
    })

    it('accepts a feed just under the cap', async () => {
      const body = `${ICS}${'X'.repeat(MAX_FEED_BYTES - ICS.length)}`
      const { f } = fake(() => new Response(body))
      expect((await run({ url: GOOD }, deps(f)))[0]).toBe(200)
    })
  })

  describe('10 s timeout', () => {
    it('gives up when the server does not answer', async () => {
      const { f } = fake(
        (_u, init) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))
          }),
      )
      expect(await run({ url: GOOD }, deps(f, { timeoutMs: 50 }))).toEqual([504, 'the calendar server took longer than 10 seconds'])
    })

    it('gives up when the body never ends', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR\r\n'))
        },
      })
      const { f } = fake(() => new Response(stream))
      expect((await run({ url: GOOD }, deps(f, { timeoutMs: 50 })))[0]).toBe(504)
    })

    it('uses 10 seconds by default', async () => {
      const { FEED_TIMEOUT_MS } = await import('../src/feed')
      expect(FEED_TIMEOUT_MS).toBe(10_000)
    })
  })

  describe('rate limit', () => {
    it('answers 429 without fetching when the limiter says no', async () => {
      const { f, calls } = ok()
      expect((await run({ url: GOOD }, deps(f, { limiter: deny })))[0]).toBe(429)
      expect(calls).toHaveLength(0)
    })

    it('keys the limit by the caller and counts refused URLs too', async () => {
      const keys: string[] = []
      const spy: RateLimit = { limit: async ({ key }) => (keys.push(key), { success: true }) }
      const { f } = ok()
      await run({ url: 'http://x.edu/a.ics' }, deps(f, { limiter: spy }))
      expect(keys).toEqual(['203.0.113.9'])
    })

    it('is off (503) without the binding', async () => {
      const { f, calls } = ok()
      expect((await run({ url: GOOD }, deps(f, { limiter: undefined })))[0]).toBe(503)
      expect(calls).toHaveLength(0)
    })
  })

  it('refuses answers that are not calendars and upstream errors, without echoing them', async () => {
    const html = fake(() => new Response('<html>login</html>', { status: 200 }))
    expect(await run({ url: GOOD }, deps(html.f))).toEqual([422, 'the link did not return a calendar file'])
    const missing = fake(() => new Response('secret page', { status: 404 }))
    expect(await run({ url: GOOD }, deps(missing.f))).toEqual([502, 'the calendar server answered 404'])
    const thrown = fake(() => {
      throw new TypeError(`fetch failed for ${GOOD}`)
    })
    expect(await run({ url: GOOD }, deps(thrown.f))).toEqual([502, 'could not reach the calendar server'])
  })
})

describe('POST /feed/fetch route', () => {
  const ORIGIN = 'http://localhost:5173'
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(
      new Request('https://kiln.test/feed/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '198.51.100.7', ...headers },
        body: JSON.stringify(body),
      }),
      env,
    )

  it('fetches through the global fetch with CORS headers and never logs or stores the URL or body', async () => {
    const out = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(ICS))
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')]
    const r = await post({ url: GOOD }, { 'cf-connecting-ip': '198.51.100.8', cookie: 'session=abc' })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(await r.text()).toBe(ICS)
    const init = out.mock.calls[0]?.[1] as RequestInit
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|origin|cf-connecting-ip/i)
    // Failures too: none is logged, and no error names the URL.
    out.mockImplementation(async () => {
      throw new TypeError(`network error for ${GOOD}`)
    })
    const bad = await post({ url: GOOD }, { 'cf-connecting-ip': '198.51.100.8' })
    expect(bad.status).toBe(502)
    expect(await bad.text()).not.toContain('instructure')
    for (const l of logs) expect(l).not.toHaveBeenCalled()
    const tables = ['push_subscriptions', 'active_devices', 'sync_spaces', 'sync_records']
    for (const t of tables) expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n).toBe(0)
  })

  it('is rate limited per IP by the FEED_LIMITER binding (10 a minute)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(ICS))
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await post({ url: GOOD }, { 'cf-connecting-ip': '192.0.2.200' })).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
    // Another caller is not affected.
    expect((await post({ url: GOOD }, { 'cf-connecting-ip': '192.0.2.201' })).status).toBe(200)
  })

  it('needs POST and JSON, and refuses other origins', async () => {
    expect((await worker.fetch(new Request('https://kiln.test/feed/fetch'), env)).status).toBe(405)
    const text = await worker.fetch(new Request('https://kiln.test/feed/fetch', { method: 'POST', body: GOOD, headers: { 'cf-connecting-ip': '192.0.2.9' } }), env)
    expect(text.status).toBe(415)
    expect((await post({ url: GOOD }, { origin: 'https://evil.example' })).status).toBe(403)
  })
})
