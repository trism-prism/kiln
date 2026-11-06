import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { importCalendar, readCalendar } from '../data/calendar'
import { newDb } from '../data/test-db'
import { checkFeedsIfDue, FEED_CHECK_MS, feedNotice, feedUrl, fetchFeedText } from './feeds'

const CANVAS = readFileSync(new URL('../../fixtures/calendars/canvas.ics', import.meta.url), 'utf8')
const API = 'https://api.kiln.test'
const URL_ = 'https://canvas.example.edu/feeds/calendars/user_abc.ics'

function worker(answer: () => Response) {
  const bodies: unknown[] = []
  const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
    expect(String(u)).toBe(`${API}/feed/fetch`)
    bodies.push(JSON.parse(String(init?.body)))
    return answer()
  }) as typeof fetch
  return { f, bodies }
}

async function imported() {
  const db = newDb()
  const { items, rows } = readCalendar(CANVAS)
  await importCalendar(db, { items, rows, courses: ['MATH-221-001'], startDate: '2030-01-07', feed: { lms: 'canvas', url: URL_ } })
  const [feed] = await db.feeds.toArray()
  return { db, feed: feed! }
}

describe('feed helpers', () => {
  it('turns webcal links into https and refuses http', () => {
    expect(feedUrl(' webcal://canvas.example.edu/feeds/x.ics ')).toBe('https://canvas.example.edu/feeds/x.ics')
    expect(feedUrl('https://canvas.example.edu/feeds/x.ics')).toBe('https://canvas.example.edu/feeds/x.ics')
    expect(feedUrl('http://canvas.example.edu/feeds/x.ics')).toBeUndefined()
    expect(feedUrl('not a link')).toBeUndefined()
  })

  it('words the notice', () => {
    expect(feedNotice(3, 1)).toBe('3 new assignments, 1 due date changed')
    expect(feedNotice(1, 0)).toBe('1 new assignment')
    expect(feedNotice(0, 2)).toBe('2 due dates changed')
  })

  it('posts {url} to the Worker and passes its error on', async () => {
    const ok = worker(() => new Response('BEGIN:VCALENDAR'))
    expect(await fetchFeedText(ok.f, API, URL_)).toBe('BEGIN:VCALENDAR')
    expect(ok.bodies).toEqual([{ url: URL_ }])
    const bad = worker(() => Response.json({ error: 'the calendar server answered 404' }, { status: 502 }))
    await expect(fetchFeedText(bad.f, API, URL_)).rejects.toThrow('Could not read the calendar: the calendar server answered 404.')
    await expect(fetchFeedText(ok.f, '', URL_)).rejects.toThrow(/upload it instead/)
  })
})

describe('checkFeedsIfDue', () => {
  const changed = CANVAS.replace(/20300212T045900Z/g, '20300214T045900Z').replace(
    'END:VCALENDAR',
    'BEGIN:VEVENT\nDTSTART:20300301T235900Z\nDTEND:20300301T235900Z\nSUMMARY:Homework 5 [MATH-221-001]\nUID:event-assignment-1010\nEND:VEVENT\n' +
      'BEGIN:VEVENT\nDTSTART:20300301T235900Z\nDTEND:20300301T235900Z\nSUMMARY:Homework 9 [HIST-110]\nUID:event-assignment-1011\nEND:VEVENT\nEND:VCALENDAR',
  )

  it('counts new assignments and changed due dates of the courses of the feed only, and records the result', async () => {
    const { db, feed } = await imported()
    const now = feed.lastFetchedAt! + FEED_CHECK_MS
    const w = worker(() => new Response(changed))
    const out = await checkFeedsIfDue(db, w.f, API, now, '2030-01-07')
    expect(out.map((c) => [c.feed.id, c.added, c.changed])).toEqual([[feed.id, 1, 1]])
    expect(await db.feeds.get(feed.id)).toMatchObject({ lastFetchedAt: now, lastResult: { ok: true, added: 1, changed: 1 } })
    // Nothing was imported.
    expect((await db.tasks.toArray()).map((t) => t.title)).not.toContain('Homework 5')
  })

  it('checks at most every 6 hours, and not at all without a server', async () => {
    const { db, feed } = await imported()
    const w = worker(() => new Response(changed))
    expect(await checkFeedsIfDue(db, w.f, API, feed.lastFetchedAt! + FEED_CHECK_MS - 1, '2030-01-07')).toEqual([])
    expect(await checkFeedsIfDue(db, w.f, '', feed.lastFetchedAt! + 10 * FEED_CHECK_MS, '2030-01-07')).toEqual([])
    expect(w.bodies).toHaveLength(0)
  })

  it('stores a failure on the feed and reports nothing', async () => {
    const { db, feed } = await imported()
    const now = feed.lastFetchedAt! + FEED_CHECK_MS
    const w = worker(() => Response.json({ error: 'the calendar server answered 403' }, { status: 502 }))
    expect(await checkFeedsIfDue(db, w.f, API, now, '2030-01-07')).toEqual([])
    expect((await db.feeds.get(feed.id))?.lastResult).toEqual({ ok: false, error: 'Could not read the calendar: the calendar server answered 403.' })
  })

  it('reports nothing when the feed is unchanged', async () => {
    const { db, feed } = await imported()
    const w = worker(() => new Response(CANVAS))
    expect(await checkFeedsIfDue(db, w.f, API, feed.lastFetchedAt! + FEED_CHECK_MS, '2030-01-07')).toEqual([])
  })
})
