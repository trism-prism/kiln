import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { b64uEncode } from '../src/b64'
import worker, { type Env } from '../src/index'
import { cleanupPairings } from '../src/pair'

const rand = (n: number) => b64uEncode(crypto.getRandomValues(new Uint8Array(n)))
const id = () => rand(32)
const sidOf = () => rand(16)
const boxOf = () => rand(60)

const allow = { limit: async () => ({ success: true }) } as unknown as RateLimit
const deny = { limit: async () => ({ success: false }) } as unknown as RateLimit

function call(path: string, body: unknown, over: Partial<Env> = { PAIR_LIMITER: allow }, headers: Record<string, string> = {}, method = 'POST') {
  return worker.fetch(
    new Request(`https://kiln.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { ...env, ...over } as Env,
  )
}

/** One pairing as the host and guest devices drive it (opaque strings stand in for the CPace messages). */
async function start() {
  const p = { sid: sidOf(), hostToken: id(), guestToken: id(), msgA: id(), msgB: id(), tagB: id() }
  const r = await call('/pair/start', { sid: p.sid, hostToken: p.hostToken, msgA: p.msgA })
  expect(r.status).toBe(201)
  const { slot, expiresIn } = (await r.json()) as { slot: string; expiresIn: number }
  const join = () => call('/pair/join', { slot })
  const answer = (guestToken = p.guestToken) => call('/pair/answer', { sid: p.sid, guestToken, msgB: p.msgB, tagB: p.tagB })
  const poll = (hostToken = p.hostToken) => call('/pair/poll', { sid: p.sid, hostToken })
  const reply = (box: string | null, hostToken = p.hostToken) => call('/pair/reply', { sid: p.sid, hostToken, box })
  const fetchBox = (guestToken = p.guestToken) => call('/pair/fetch', { sid: p.sid, guestToken })
  const expire = () => env.DB.prepare('UPDATE sync_pairings SET expires_at = 1 WHERE sid = ?').bind(p.sid).run()
  const row = () => env.DB.prepare('SELECT * FROM sync_pairings WHERE sid = ?').bind(p.sid).first<Record<string, unknown>>()
  return { ...p, slot, expiresIn, join, answer, poll, reply, fetchBox, expire, row }
}

describe('pairing relay', () => {
  it('runs the happy path and hands the box out once', async () => {
    const t0 = Date.now()
    const a = await start()
    expect(a.slot).toMatch(/^\d{2}$/)
    expect(a.expiresIn).toBe(180)
    const row = await a.row()
    expect(row!.expires_at as number).toBeGreaterThanOrEqual(t0 + 180_000)
    expect(row!.expires_at as number).toBeLessThanOrEqual(Date.now() + 180_000)
    // Tokens are stored as hashes only.
    expect(JSON.stringify(row)).not.toContain(a.hostToken)

    const j = await a.join()
    expect(j.status).toBe(200)
    expect(await j.json()).toMatchObject({ sid: a.sid, msgA: a.msgA })
    expect(await (await a.poll()).json()).toEqual({ state: 'waiting', wrong: 0 })
    expect(await (await a.fetchBox()).status).toBe(403)

    expect((await a.answer()).status).toBe(202)
    expect(await (await a.fetchBox()).json()).toEqual({ state: 'waiting' })
    expect(await (await a.poll()).json()).toEqual({ state: 'answer', msgB: a.msgB, tagB: a.tagB, wrong: 0 })

    const box = boxOf()
    expect((await a.reply(box)).status).toBe(204)
    expect(await (await a.poll()).json()).toEqual({ state: 'delivered', wrong: 0 })
    // A delivered code is gone for new guests.
    expect((await a.join()).status).toBe(404)
    expect((await a.answer()).status).toBe(404)

    expect(await (await a.fetchBox()).json()).toEqual({ box })
    expect((await a.fetchBox()).status).toBe(404)
    expect((await a.row())!.box).toBeNull()
    expect(await (await a.poll()).json()).toEqual({ state: 'done', wrong: 0 })
  })

  it('a rejected answer counts a wrong try, frees the slot and tells the guest', async () => {
    const a = await start()
    await a.answer()
    expect((await a.reply(null)).status).toBe(204)
    expect(await (await a.poll()).json()).toEqual({ state: 'waiting', wrong: 1 })
    expect(await (await a.fetchBox()).json()).toEqual({ state: 'wrong', left: 2 })
    expect((await a.join()).status).toBe(200)
    // Nothing is waiting any more.
    expect((await a.reply(null)).status).toBe(409)
    expect((await a.answer()).status).toBe(202)
    expect((await a.reply(null)).status).toBe(204)
    expect(await (await a.fetchBox()).json()).toEqual({ state: 'wrong', left: 1 })
  })

  it('the third wrong try kills the code', async () => {
    const a = await start()
    for (let i = 0; i < 3; i++) {
      expect((await a.answer()).status).toBe(202)
      expect((await a.reply(null)).status).toBe(204)
    }
    expect(await (await a.poll()).json()).toEqual({ state: 'waiting', wrong: 3 })
    expect(await (await a.fetchBox()).json()).toEqual({ state: 'wrong', left: 0 })
    expect((await a.join()).status).toBe(404)
    expect((await a.answer()).status).toBe(404)
  })

  it('lets one guest answer at a time (202 then 409)', async () => {
    const a = await start()
    expect((await a.answer(id())).status).toBe(202)
    expect((await a.answer(id())).status).toBe(409)
  })

  it('expires after 180 seconds and keeps a delivered box for at least 60 more', async () => {
    const a = await start()
    await a.answer()
    await env.DB.prepare('UPDATE sync_pairings SET expires_at = ? WHERE sid = ?').bind(Date.now() + 5_000, a.sid).run()
    await a.reply(boxOf())
    expect(((await a.row())!.expires_at as number) - Date.now()).toBeGreaterThan(55_000)
    // A later expiry is not shortened.
    const b = await start()
    await b.answer()
    await b.reply(boxOf())
    expect(((await b.row())!.expires_at as number) - Date.now()).toBeGreaterThan(170_000)

    const c = await start()
    await c.expire()
    expect((await c.join()).status).toBe(404)
    expect((await c.answer()).status).toBe(404)
    expect((await c.poll()).status).toBe(404)
    expect((await c.reply(null)).status).toBe(404)
    expect((await c.fetchBox()).status).toBe(404)
  })

  it('refuses wrong tokens (403)', async () => {
    const a = await start()
    await a.answer()
    expect((await a.poll(id())).status).toBe(403)
    expect((await a.reply(boxOf(), id())).status).toBe(403)
    expect((await a.fetchBox(id())).status).toBe(403)
    // Nothing changed.
    expect(await (await a.poll()).json()).toMatchObject({ state: 'answer' })
  })

  it('validates bodies (400)', async () => {
    const good = { sid: sidOf(), hostToken: id(), msgA: id() }
    for (const bad of [
      { ...good, sid: id() },
      { ...good, sid: 'short' },
      { ...good, hostToken: 'x' },
      { ...good, msgA: sidOf() },
      { ...good, extra: 1 },
      { sid: good.sid },
      [],
      'no',
    ]) {
      expect((await call('/pair/start', bad)).status).toBe(400)
    }
    for (const slot of ['1', '123', 'ab', 5, null]) expect((await call('/pair/join', { slot })).status).toBe(400)
    expect((await call('/pair/join', { slot: '12', extra: 1 })).status).toBe(400)
    const s = sidOf()
    expect((await call('/pair/answer', { sid: s, guestToken: id(), msgB: id() })).status).toBe(400)
    expect((await call('/pair/poll', { sid: s, hostToken: 'x' })).status).toBe(400)
    expect((await call('/pair/reply', { sid: s, hostToken: id(), box: 'short' })).status).toBe(400)
    expect((await call('/pair/reply', { sid: s, hostToken: id(), box: boxOf() + 'A' })).status).toBe(400)
    expect((await call('/pair/reply', { sid: s, hostToken: id() })).status).toBe(400)
    expect((await call('/pair/fetch', { sid: s })).status).toBe(400)
    expect((await call('/pair/start', 'x'.repeat(5000))).status).toBe(413)
    expect((await call('/pair/nope', {})).status).toBe(404)
    expect((await call('/pair/start', {}, { PAIR_LIMITER: allow }, {}, 'GET')).status).toBe(405)
  })

  it('refuses a repeated sid', async () => {
    const a = await start()
    expect((await call('/pair/start', { sid: a.sid, hostToken: id(), msgA: id() })).status).toBe(409)
  })

  it('is off without the limiter (503) and answers 429 over the limit, on the three limited routes only', async () => {
    const a = await start()
    const bodies: [string, unknown][] = [
      ['/pair/start', { sid: sidOf(), hostToken: id(), msgA: id() }],
      ['/pair/join', { slot: a.slot }],
      ['/pair/answer', { sid: a.sid, guestToken: id(), msgB: id(), tagB: id() }],
    ]
    for (const [path, body] of bodies) {
      expect((await call(path, body, { PAIR_LIMITER: undefined })).status).toBe(503)
      expect((await call(path, body, { PAIR_LIMITER: deny })).status).toBe(429)
    }
    // Polling is not limited (it runs every 2 seconds).
    expect((await call('/pair/poll', { sid: a.sid, hostToken: a.hostToken }, { PAIR_LIMITER: deny })).status).toBe(200)
  })

  it('keys the limiter on the caller IP (IPv6 by /64)', async () => {
    const keys: string[] = []
    const spy = { limit: async (o: { key: string }) => (keys.push(o.key), { success: true }) } as unknown as RateLimit
    await call('/pair/join', { slot: '00' }, { PAIR_LIMITER: spy }, { 'cf-connecting-ip': '2001:db8:1:2:3:4:5:6' })
    await call('/pair/join', { slot: '00' }, { PAIR_LIMITER: spy }, { 'cf-connecting-ip': '192.0.2.7' })
    expect(keys).toEqual(['2001:db8:1:2::/64', '192.0.2.7'])
  })

  it('answers 503 when all 100 slots are taken, then frees them as codes expire', async () => {
    const now = Date.now()
    await env.DB.batch(
      Array.from({ length: 100 }, (_, i) =>
        env.DB.prepare('INSERT INTO sync_pairings (sid, slot, host_hash, msg_a, expires_at) VALUES (?, ?, ?, ?, ?)').bind(
          sidOf(),
          String(i).padStart(2, '0'),
          'h',
          'm',
          now + 100_000,
        ),
      ),
    )
    expect((await call('/pair/start', { sid: sidOf(), hostToken: id(), msgA: id() })).status).toBe(503)
    // One expired code is cleaned up by the next start and its slot is reused.
    await env.DB.prepare("UPDATE sync_pairings SET expires_at = 1 WHERE slot = '42'").run()
    const r = await call('/pair/start', { sid: sidOf(), hostToken: id(), msgA: id() })
    expect(r.status).toBe(201)
    expect(((await r.json()) as { slot: string }).slot).toBe('42')
  })

  it('spreads slots over all 100 values', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) seen.add((await start()).slot)
    expect(seen.size).toBe(60)
  })

  it('cleanupPairings deletes expired rows only', async () => {
    const live = await start()
    const old = await start()
    await old.expire()
    expect(await cleanupPairings(env.DB, Date.now())).toBe(1)
    expect(await live.row()).not.toBeNull()
    expect(await old.row()).toBeNull()
  })
})
