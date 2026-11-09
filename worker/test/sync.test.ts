import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { b64uEncode } from '../src/b64'
import worker, { type Env } from '../src/index'
import { cleanupSyncSpaces } from '../src/sync'

const id = () => b64uEncode(crypto.getRandomValues(new Uint8Array(32)))
const ORIGIN = 'http://localhost:5173'

interface Row {
  recordKey: string
  updatedAt: number
  iv: string
  ciphertext: string
}
const row = (recordKey: string, updatedAt: number, fill = 'A', len = 40): Row => ({
  recordKey,
  updatedAt,
  iv: b64uEncode(new Uint8Array(12)),
  ciphertext: fill.repeat(len),
})

function call(path: string, body: unknown, headers: Record<string, string> = {}, over: Partial<Env> = {}, method = 'POST') {
  return worker.fetch(
    new Request(`https://kiln.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { ...env, ...over } as Env,
  )
}

function space() {
  const spaceId = id()
  const token = id()
  return {
    spaceId,
    token,
    push: (rows: unknown[], over: Partial<Env> = {}) => call('/sync/push', { spaceId, token, rows }, {}, over),
    pull: (cursor = 0, limit = 500) => call('/sync/pull', { spaceId, token, cursor, limit }),
  }
}

type Pulled = { rows: Row[]; cursor: number; more: boolean }
const count = (table: string) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n')

describe('POST /sync/push', () => {
  it('creates the space at the first push and stores rows', async () => {
    const s = space()
    const r = await s.push([row(id(), 100), row(id(), 200)])
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ accepted: 2, stale: 0 })
    const sp = await env.DB.prepare('SELECT * FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first<Record<string, unknown>>()
    expect(sp).toMatchObject({ seq: 2, record_count: 2, bytes: 80 })
    // The server keeps a hash of the token, never the token.
    expect(JSON.stringify(sp)).not.toContain(s.token)
  })

  it('requires the first token for push and for pull (403 otherwise)', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    const bad = { spaceId: s.spaceId, token: id() }
    expect((await call('/sync/push', { ...bad, rows: [row(id(), 1)] })).status).toBe(403)
    expect((await call('/sync/pull', { ...bad, cursor: 0, limit: 10 })).status).toBe(403)
    expect((await s.pull()).status).toBe(200)
  })

  it('pull of an unknown space is empty', async () => {
    const r = await space().pull(7)
    expect(await r.json()).toEqual({ rows: [], cursor: 7, more: false })
  })

  it('keeps only the newest version: stale and tied pushes are rejected', async () => {
    const s = space()
    const k = id()
    await s.push([row(k, 100, 'A')])
    expect(await (await s.push([row(k, 50, 'B')])).json()).toEqual({ accepted: 0, stale: 1 })
    expect(await (await s.push([row(k, 100, 'C')])).json()).toEqual({ accepted: 0, stale: 1 })
    expect(await (await s.push([row(k, 150, 'D')])).json()).toEqual({ accepted: 1, stale: 0 })
    const got = (await (await s.pull()).json()) as Pulled
    expect(got.rows).toHaveLength(1)
    expect(got.rows[0]).toMatchObject({ recordKey: k, updatedAt: 150, ciphertext: 'D'.repeat(40) })
  })

  it('keeps the newest of duplicate keys inside one request', async () => {
    const s = space()
    const k = id()
    const r = await s.push([row(k, 10, 'A'), row(k, 30, 'B'), row(k, 20, 'C')])
    expect(await r.json()).toEqual({ accepted: 1, stale: 2 })
    const got = (await (await s.pull()).json()) as Pulled
    expect(got.rows[0]!.ciphertext).toBe('B'.repeat(40))
  })

  it('assigns increasing seq: an updated record moves to the end of the pull order', async () => {
    const s = space()
    const [a, b, c] = [id(), id(), id()]
    await s.push([row(a, 1), row(b, 1)])
    await s.push([row(c, 1)])
    await s.push([row(a, 2)])
    const got = (await (await s.pull()).json()) as Pulled
    expect(got.rows.map((r) => r.recordKey)).toEqual([b, c, a])
    expect(got.cursor).toBe(4)
    const sp = await env.DB.prepare('SELECT seq, record_count FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first()
    expect(sp).toMatchObject({ seq: 4, record_count: 3 })
  })

  it('validates input', async () => {
    const s = space()
    const bad = [
      { ...row(id(), 1), recordKey: 'short' },
      { ...row(id(), 1), updatedAt: -1 },
      { ...row(id(), 1), updatedAt: 1.5 },
      { ...row(id(), 1), updatedAt: Date.now() + 2 * 86_400_000 },
      { ...row(id(), 1), iv: 'AAAA' },
      { ...row(id(), 1), ciphertext: 'not base64!!!!!!!!!!!!!!!!' },
      { ...row(id(), 1), ciphertext: 'A'.repeat(65_537) },
      { ...row(id(), 1), extra: 1 },
    ]
    for (const r of bad) expect((await s.push([r])).status, JSON.stringify(r).slice(0, 80)).toBe(400)
    expect((await s.push([])).status).toBe(400)
    expect((await s.push(Array.from({ length: 201 }, () => row(id(), 1)))).status).toBe(400)
    expect((await call('/sync/push', { spaceId: 'x', token: s.token, rows: [row(id(), 1)] })).status).toBe(400)
    expect((await call('/sync/push', { spaceId: s.spaceId, token: s.token, rows: [row(id(), 1)], more: 1 })).status).toBe(400)
    expect((await call('/sync/pull', { spaceId: s.spaceId, token: s.token, cursor: -1, limit: 10 })).status).toBe(400)
    expect((await s.pull(0, 501)).status).toBe(400)
    expect((await s.pull(0, 0)).status).toBe(400)
    expect(await count('sync_records')).toBe(0)
  })

  it('accepts 200 rows in one push', async () => {
    const s = space()
    const r = await s.push(Array.from({ length: 200 }, (_, i) => row(id(), i + 1, 'Q', 2000)))
    expect(await r.json()).toEqual({ accepted: 200, stale: 0 })
  })
})

describe('POST /sync/pull', () => {
  it('paginates by cursor', async () => {
    const s = space()
    const keys = Array.from({ length: 7 }, () => id())
    await s.push(keys.map((k, i) => row(k, i + 1)))
    const seen: string[] = []
    let cursor = 0
    let pages = 0
    for (;;) {
      const p = (await (await s.pull(cursor, 3)).json()) as Pulled
      pages++
      seen.push(...p.rows.map((r) => r.recordKey))
      cursor = p.cursor
      if (!p.more) break
    }
    expect(pages).toBe(3)
    expect(seen).toEqual(keys)
    const again = (await (await s.pull(cursor, 3)).json()) as Pulled
    expect(again).toEqual({ rows: [], cursor, more: false })
  })

  it('cuts a page at the byte budget but always sends at least one row', async () => {
    const s = space()
    await s.push(Array.from({ length: 16 }, (_, i) => row(id(), i + 1, 'Z', 60_000)))
    const p = (await (await s.pull(0, 500)).json()) as Pulled
    expect(p.rows.length).toBeGreaterThan(0)
    expect(p.rows.length).toBeLessThan(16)
    expect(p.more).toBe(true)
  })

  it('a cursor ahead of the space starts over', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    const p = (await (await s.pull(999)).json()) as Pulled
    expect(p.rows).toHaveLength(1)
  })

  it('spaces are isolated', async () => {
    const a = space()
    const b = space()
    await a.push([row(id(), 1)])
    await b.push([row(id(), 1), row(id(), 2)])
    expect(((await (await a.pull()).json()) as Pulled).rows).toHaveLength(1)
    expect(((await (await b.pull()).json()) as Pulled).rows).toHaveLength(2)
  })
})

describe('quotas', () => {
  it('507 when the record cap is reached; updates still work', async () => {
    const s = space()
    const [a, b] = [id(), id()]
    await s.push([row(a, 1), row(b, 1)], { MAX_SYNC_RECORDS: '2' })
    const r = await s.push([row(id(), 1)], { MAX_SYNC_RECORDS: '2' })
    expect(r.status).toBe(507)
    expect((await s.push([row(a, 2)], { MAX_SYNC_RECORDS: '2' })).status).toBe(200)
    expect(await count('sync_records')).toBe(2)
  })

  it('507 when the byte cap is reached; shrinking still works', async () => {
    const s = space()
    const a = id()
    const over = { MAX_SYNC_BYTES: '100' }
    expect((await s.push([row(a, 1, 'A', 60)], over)).status).toBe(200)
    expect((await s.push([row(id(), 1, 'A', 60)], over)).status).toBe(507)
    expect((await s.push([row(a, 2, 'A', 30)], over)).status).toBe(200)
    expect(await env.DB.prepare('SELECT bytes FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first('bytes')).toBe(30)
  })

  it('a rejected push writes nothing', async () => {
    const s = space()
    await s.push([row(id(), 1)], { MAX_SYNC_RECORDS: '1' })
    expect((await s.push([row(id(), 1), row(id(), 2)], { MAX_SYNC_RECORDS: '1' })).status).toBe(507)
    expect(await count('sync_records')).toBe(1)
  })

  it('503 when the space cap is reached', async () => {
    await space().push([row(id(), 1)], { MAX_SYNC_SPACES: '1' })
    expect((await space().push([row(id(), 1)], { MAX_SYNC_SPACES: '1' })).status).toBe(503)
  })
})

describe('quota enforcement inside the batch', () => {
  it('two simultaneous pushes cannot both take the last slot', async () => {
    const s = space()
    const over = { MAX_SYNC_RECORDS: '1' }
    const [x, y] = await Promise.all([s.push([row(id(), 1)], over), s.push([row(id(), 1)], over)])
    expect([x.status, y.status].sort()).toEqual([200, 507])
    expect(await count('sync_records')).toBe(1)
    expect(await env.DB.prepare('SELECT record_count FROM sync_spaces').first('record_count')).toBe(1)
  })

  it('counts only accepted rows: stale and replaced rows do not add records, replacements add the size change', async () => {
    const s = space()
    const k = id()
    await s.push([row(k, 10, 'A', 50)])
    await s.push([row(k, 5, 'B', 90)]) // stale: nothing counted
    await s.push([row(k, 20, 'C', 70)]) // replaced: +20 bytes, no new record
    expect(await env.DB.prepare('SELECT record_count, bytes FROM sync_spaces').first()).toMatchObject({ record_count: 1, bytes: 70 })
  })

  it('a push over the cap changes no counter and no seq', async () => {
    const s = space()
    await s.push([row(id(), 1, 'A', 60)], { MAX_SYNC_BYTES: '100' })
    expect((await s.push([row(id(), 1, 'A', 60)], { MAX_SYNC_BYTES: '100' })).status).toBe(507)
    expect(await env.DB.prepare('SELECT seq, record_count, bytes FROM sync_spaces').first()).toMatchObject({ seq: 1, record_count: 1, bytes: 60 })
  })
})

describe('storage rules', () => {
  it('(space_id, seq) is unique', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    const insert = () =>
      env.DB.prepare('INSERT INTO sync_records (space_id, record_key, updated_at, seq, iv, ciphertext) VALUES (?, ?, 1, 1, ?, ?)')
        .bind(s.spaceId, id(), 'a', 'b')
        .run()
    await expect(insert()).rejects.toThrow()
  })

  it('a delete is an ordinary update of the same record: the server keeps the row and its size', async () => {
    const s = space()
    const k = id()
    await s.push([row(k, 1, 'A', 100)])
    await s.push([row(k, 2, 'T', 100)]) // the tombstone is ciphertext like any other version
    expect(await count('sync_records')).toBe(1)
    expect(await env.DB.prepare('SELECT record_count, bytes FROM sync_spaces').first()).toMatchObject({ record_count: 1, bytes: 100 })
  })

  it('cron removes empty spaces older than a day, and nothing else', async () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const fresh = new Date().toISOString()
    const mk = (spaceId: string, n: number, at: string) =>
      env.DB.prepare('INSERT INTO sync_spaces (space_id, token_hash, record_count, created_at) VALUES (?, ?, ?, ?)').bind(spaceId, 'h', n, at).run()
    const [oldEmpty, freshEmpty, oldUsed] = [id(), id(), id()]
    await mk(oldEmpty, 0, old)
    await mk(freshEmpty, 0, fresh)
    await mk(oldUsed, 3, old)
    expect(await cleanupSyncSpaces(env.DB, new Date())).toBe(1)
    const left = (await env.DB.prepare('SELECT space_id FROM sync_spaces').all<{ space_id: string }>()).results.map((r) => r.space_id).sort()
    expect(left).toEqual([freshEmpty, oldUsed].sort())
  })
})

describe('http', () => {
  it('rejects bodies over 1 MB by counting bytes, even without Content-Length', async () => {
    const big = new Uint8Array(1_048_577).fill(32)
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(big)
        c.close()
      },
    })
    const req = new Request('https://kiln.test/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect((await worker.fetch(req, env as Env)).status).toBe(413)
  })

  it('accepts a body well over the 4 KB push limit', async () => {
    const s = space()
    expect((await s.push(Array.from({ length: 20 }, () => row(id(), 1, 'A', 1000)))).status).toBe(200)
  })

  it('needs JSON, POST, and answers CORS', async () => {
    const s = space()
    expect((await call('/sync/push', 'x', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await call('/sync/pull', {}, {}, {}, 'GET')).status).toBe(405)
    const pre = await worker.fetch(new Request('https://kiln.test/sync/push', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env as Env)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const ok = await call('/sync/push', { spaceId: s.spaceId, token: s.token, rows: [row(id(), 1)] }, { origin: ORIGIN })
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const evil = await call('/sync/push', { spaceId: s.spaceId, token: s.token, rows: [row(id(), 1)] }, { origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
  })
})

describe('POST /sync/close', () => {
  const allow = { limit: async () => ({ success: true }) } as unknown as RateLimit
  const close = (spaceId: string, token: string, over: Partial<Env> = { PAIR_LIMITER: allow }) => call('/sync/close', { spaceId, token }, {}, over)

  it('deletes the records, closes the space and keeps only hash and counters', async () => {
    const s = space()
    await s.push([row(id(), 1), row(id(), 2)])
    const other = space()
    await other.push([row(id(), 1)])
    const r = await close(s.spaceId, s.token)
    expect(r.status).toBe(204)
    expect(await count('sync_records')).toBe(1)
    const sp = await env.DB.prepare('SELECT * FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first<Record<string, unknown>>()
    expect(sp).toMatchObject({ record_count: 0, bytes: 0 })
    expect(sp!.closed_at).toEqual(expect.any(String))
    expect(JSON.stringify(sp)).not.toContain(s.token)
    // The other space is untouched.
    expect((await other.pull()).status).toBe(200)
  })

  it('is idempotent and keeps the first closing time', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    await close(s.spaceId, s.token)
    const first = await env.DB.prepare('SELECT closed_at FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first('closed_at')
    expect((await close(s.spaceId, s.token)).status).toBe(204)
    expect(await env.DB.prepare('SELECT closed_at FROM sync_spaces WHERE space_id = ?').bind(s.spaceId).first('closed_at')).toBe(first)
  })

  it('refuses a wrong token (403) and changes nothing', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    expect((await close(s.spaceId, id())).status).toBe(403)
    expect(await count('sync_records')).toBe(1)
    expect((await s.pull()).status).toBe(200)
  })

  it('push and pull of a closed space answer 410, with the right token only', async () => {
    const s = space()
    await s.push([row(id(), 1)])
    await close(s.spaceId, s.token)
    expect((await s.pull()).status).toBe(410)
    const push = await s.push([row(id(), 5)])
    expect(push.status).toBe(410)
    expect(await push.json()).toEqual({ error: 'sync was disconnected' })
    expect(await count('sync_records')).toBe(0)
    expect((await call('/sync/pull', { spaceId: s.spaceId, token: id(), cursor: 0, limit: 10 })).status).toBe(403)
  })

  it('closing a space nobody pushed to still gives 410 later (an offline device learns of it)', async () => {
    const s = space()
    expect((await close(s.spaceId, s.token)).status).toBe(204)
    expect((await s.pull()).status).toBe(410)
    expect((await s.push([row(id(), 1)])).status).toBe(410)
    // The row keeps the closer's token: someone else cannot reopen or probe it.
    expect((await close(s.spaceId, id())).status).toBe(403)
  })

  it('validates the body (400) and needs POST', async () => {
    expect((await call('/sync/close', { spaceId: 'x', token: id() }, {}, { PAIR_LIMITER: allow })).status).toBe(400)
    expect((await call('/sync/close', { spaceId: id(), token: 'x' }, {}, { PAIR_LIMITER: allow })).status).toBe(400)
    expect((await call('/sync/close', { spaceId: id(), token: id(), extra: 1 }, {}, { PAIR_LIMITER: allow })).status).toBe(400)
    expect((await call('/sync/close', {}, {}, {}, 'GET')).status).toBe(405)
  })

  it('is rate limited like pairing: 503 without the limiter, 429 over the limit, nothing written', async () => {
    const s = space()
    const deny = { limit: async () => ({ success: false }) } as unknown as RateLimit
    expect((await close(s.spaceId, s.token, { PAIR_LIMITER: undefined })).status).toBe(503)
    expect((await close(s.spaceId, s.token, { PAIR_LIMITER: deny })).status).toBe(429)
    expect(await count('sync_spaces')).toBe(0)
  })

  it('cleanup keeps closed rows, and closed rows do not count toward the space cap', async () => {
    const s = space()
    await close(s.spaceId, s.token)
    // Make the closed row old and empty: the cleanup must still keep it.
    await env.DB.prepare('UPDATE sync_spaces SET created_at = ? WHERE space_id = ?')
      .bind(new Date(Date.now() - 3 * 86_400_000).toISOString(), s.spaceId)
      .run()
    expect(await cleanupSyncSpaces(env.DB, new Date())).toBe(0)
    expect((await s.pull()).status).toBe(410)
    expect((await space().push([row(id(), 1)], { MAX_SYNC_SPACES: '1' })).status).toBe(200)
    expect((await space().push([row(id(), 1)], { MAX_SYNC_SPACES: '1' })).status).toBe(503)
  })
})
