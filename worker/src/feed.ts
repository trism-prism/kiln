// POST /feed/fetch {url}: fetches a calendar feed (.ics) for the app's "Keep in sync", because LMS
// feeds send no CORS headers. The Worker must not become an open proxy or a way into private
// networks, so every hop is checked (see worker/README.md, "Calendar feeds"). The URL and the body
// are secrets (the feed link is a login token): never logged, never stored, never put in an error.
import { HttpError } from './http'

export const MAX_FEED_BYTES = 2 * 1024 * 1024
export const FEED_TIMEOUT_MS = 10_000
export const MAX_REDIRECTS = 3
const MAX_URL = 2048

// Names that only resolve inside a private network.
const PRIVATE_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'arpa', 'test', 'example', 'invalid', 'onion']
// Known feed paths that do not end in .ics.
const FEED_PATHS = [/^\/calendar\/export_execute\.php$/] // Moodle

/** The checked URL, or why it is refused. Applied to the first URL and to every redirect. */
export function checkFeedUrl(raw: unknown): URL | string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return `url must be 1-${MAX_URL} characters`
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'url is not a valid URL'
  }
  if (u.protocol !== 'https:') return 'url must use https'
  if (u.username || u.password) return 'url must not contain a user name or password'
  if (u.port !== '') return 'url must use the default https port'
  // "localhost.." and "metadata.google.internal.." resolve like their dotless forms, so every trailing dot goes.
  const host = u.hostname.toLowerCase().replace(/\.+$/, '')
  // The URL parser turns every IPv4 spelling (decimal, hex, octal, short forms) into dotted digits,
  // and IPv6 literals keep their brackets, so this rejects every IP literal, private or not.
  if (host.startsWith('[') || /^[0-9.]+$/.test(host) || /^(0x[0-9a-f]*|[0-9]+)(\.(0x[0-9a-f]*|[0-9]+))*$/.test(host)) return 'url must use a host name, not an IP address'
  const labels = host.split('.')
  if (labels.some((l) => l === '')) return 'url must use a public host name'
  if (labels.length < 2) return 'url must use a public host name'
  if (PRIVATE_SUFFIXES.includes(labels[labels.length - 1] as string)) return 'url must use a public host name'
  const path = u.pathname.toLowerCase()
  if (!path.endsWith('.ics') && !FEED_PATHS.some((re) => re.test(path))) return 'url must be a calendar feed (.ics)'
  return u
}

/** Reads a body up to `max` bytes, or fails with 413; gives up when `signal` aborts. */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number, signal: AbortSignal): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  aborted.catch(() => undefined)
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      total += value.length
      if (total > max) throw new HttpError(413, 'the calendar is larger than 2 MB')
      chunks.push(value)
    }
  } catch (e) {
    void reader.cancel().catch(() => undefined)
    throw e
  }
  const bytes = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    bytes.set(c, o)
    o += c.length
  }
  return new TextDecoder().decode(bytes)
}

/** The rate-limit key: an IPv4 address as is, an IPv6 address as its /64 (one subscriber holds a whole /64). */
export function rateKey(ip: string): string {
  if (!ip.includes(':') || ip.includes('.')) return ip
  const [head = '', tail] = ip.split('::')
  const a = head === '' ? [] : head.split(':')
  const b = tail === undefined || tail === '' ? [] : tail.split(':')
  const groups = tail === undefined ? a : [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b]
  if (groups.length !== 8) return ip
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

export interface FeedDeps {
  fetch: typeof fetch
  timeoutMs: number
  limiter: RateLimit | undefined
}

/** The feed as text/calendar. `clientKey` is the caller's IP, the rate-limit key. */
export async function fetchFeed(body: unknown, clientKey: string, deps: FeedDeps): Promise<Response> {
  // Fail closed: without the binding there is no rate limit, so the route is off.
  if (!deps.limiter) throw new HttpError(503, 'calendar sync is not available')
  if (!(await deps.limiter.limit({ key: rateKey(clientKey) })).success) throw new HttpError(429, 'too many calendar requests, try again in a minute')

  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some((k) => k !== 'url')) throw new HttpError(400, 'body must be {url}')
  const first = checkFeedUrl(b.url)
  if (typeof first === 'string') throw new HttpError(400, first)

  const signal = AbortSignal.timeout(deps.timeoutMs)
  try {
    let url = first
    for (let hop = 0; ; hop++) {
      const res = await deps.fetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal,
        // Nothing from the caller is forwarded (no cookies, no headers).
        headers: { accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1', 'user-agent': 'KilnCalendarSync/1.0' },
      })
      if (res.status >= 300 && res.status < 400) {
        void res.body?.cancel().catch(() => undefined)
        const loc = res.headers.get('location')
        if (!loc) throw new HttpError(502, 'the calendar server sent a redirect without a location')
        if (hop >= MAX_REDIRECTS) throw new HttpError(502, 'the calendar server redirected too many times')
        let next: URL | string
        try {
          next = checkFeedUrl(new URL(loc, url).href)
        } catch {
          next = 'url is not a valid URL'
        }
        if (typeof next === 'string') throw new HttpError(502, `the calendar server redirected to a refused address (${next})`)
        url = next
        continue
      }
      if (!res.ok) {
        void res.body?.cancel().catch(() => undefined)
        throw new HttpError(502, `the calendar server answered ${res.status}`)
      }
      const declared = Number(res.headers.get('content-length') ?? '0')
      if (declared > MAX_FEED_BYTES) {
        void res.body?.cancel().catch(() => undefined)
        throw new HttpError(413, 'the calendar is larger than 2 MB')
      }
      const text = await readCapped(res.body, MAX_FEED_BYTES, signal)
      const start = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
      if (!/^\s*BEGIN:VCALENDAR/i.test(start)) throw new HttpError(422, 'the link did not return a calendar file')
      return new Response(start, { status: 200, headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } })
    }
  } catch (e) {
    if (e instanceof HttpError) throw e
    // Never pass the error on: fetch errors can name the URL.
    if (signal.aborted) throw new HttpError(504, 'the calendar server took longer than 10 seconds')
    throw new HttpError(502, 'could not reach the calendar server')
  }
}
