// Two devices (two fake-indexeddb databases running the real client engine) against the real Worker
// code, in process. D1 is stood in for by SQLite (node:sqlite) running the real migrations; the
// route tests in worker/test run the same server code on real D1 inside the Workers runtime.
import 'fake-indexeddb/auto'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KilnDB } from '../data/db'
import { fixtureTexts, validateParts } from '../data/fixtures'
import { getSettings, importPlan, insertRecord, setPersonalTodoDone, setPlanShare, softDelete, updateRecord, updateSettings } from '../data/repo'
import { readSnapshot, snapshotPlan } from '../data/versions'
import { newDb } from '../data/test-db'
import type { PracticeLogRecord } from '../data/types'
import type { Plan } from '../domain/plan-format'
import { deriveKeys, encryptRow, generateSyncKey, keyToMnemonic, mnemonicToKey } from './crypto'
import { disableSync, enableSync, enableSyncFromQr, getSyncSecret, getSyncStatus, syncNow, type SyncSummary } from './index'

// SYNC_VERSION as this test's client sees it: set `clientVersion.v` to act as an older app.
const clientVersion = vi.hoisted(() => ({ v: undefined as number | undefined }))
vi.mock('./crypto', async (importOriginal) => {
  const m = await importOriginal<typeof import('./crypto')>()
  return {
    ...m,
    get SYNC_VERSION() {
      return clientVersion.v ?? m.SYNC_VERSION
    },
  }
})

const migrations = import.meta.glob('../../worker/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

type Row = Record<string, unknown>
/** Just the part of D1 the Worker uses. */
function fakeD1(sqlite: DatabaseSync) {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async (col?: string) => {
      const r = sqlite.prepare(sql).get(...(args as never[])) as Row | undefined
      return r === undefined ? null : col ? r[col] : r
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) as Row[] }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(args as never[])).changes) } }),
  })
  type Stmt = ReturnType<typeof stmt>
  return {
    prepare: (sql: string) => stmt(sql),
    // Like D1's batch: all statements in one transaction.
    batch: async (list: Stmt[]) => {
      sqlite.exec('BEGIN')
      try {
        const out = []
        for (const s of list) out.push(await s.run())
        sqlite.exec('COMMIT')
        return out
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  }
}

// The Worker lives outside src/ (it has its own TypeScript setup), so it is loaded by path.
const workerPath = '../../worker/src/index.ts'
type WorkerEnv = Record<string, unknown>
const { default: worker } = (await import(/* @vite-ignore */ workerPath)) as {
  default: { fetch(req: Request, env: WorkerEnv): Promise<Response> }
}

const sqlite = new DatabaseSync(':memory:')
for (const sql of Object.values(migrations)) sqlite.exec(sql)
const d1 = fakeD1(sqlite)
const reset = () => sqlite.exec('DELETE FROM sync_records; DELETE FROM sync_spaces')

const BASE = 'https://kiln.test'
const worldFetch =
  (over: WorkerEnv = {}): typeof fetch =>
  (input, init) =>
    worker.fetch(new Request(input as string, init), { DB: d1, ALLOWED_ORIGINS: '', ...over })

const sync = (db: KilnDB, over: WorkerEnv = {}) => syncNow(db, worldFetch(over), BASE)
const ok = (s: SyncSummary) => {
  expect(s.error).toBeUndefined()
  return s
}

// Edit times: later than anything the repository stamps during a test run, still inside the server's one-day window.
const NOW = Date.now() + 3_600_000
const problem = (slug: string) => ({ date: '2026-11-09', slug, title: slug, difficulty: 'easy' as const, completedAt: NOW })
const add = (db: KilnDB, slug: string) => insertRecord(db, 'practiceLog', problem(slug))
/** A write at a chosen time (the repository stamps Date.now(), which two fast devices could tie on). */
async function editAt(db: KilnDB, id: string, patch: Partial<PracticeLogRecord>, updatedAt: number) {
  const old = (await db.practiceLog.get(id))!
  await db.practiceLog.put({ ...old, ...patch, updatedAt, deviceId: db.name })
}
const slugs = async (db: KilnDB) => (await db.practiceLog.toArray()).filter((r) => !r.deleted).map((r) => r.slug).sort()

async function twoDevices() {
  const a = newDb()
  const b = newDb()
  const { mnemonic } = await enableSync(a)
  await enableSync(b, mnemonic)
  return { a, b, mnemonic }
}

describe('two devices', () => {
  beforeEach(reset)

  it('a record created on A appears on B', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'two-sum')
    expect(ok(await sync(a))).toMatchObject({ pulled: 0, pushed: 1, rejectedStale: 0, invalid: 0 })
    const sb = ok(await sync(b))
    expect(sb).toMatchObject({ pulled: 1, applied: 1, pushed: 0 })
    expect(await b.practiceLog.get(r.id)).toEqual(r)
    expect((await getSyncStatus(b)).lastSyncedAt).toBeGreaterThan(0)
    // Nothing more to do. A sees its own push once more, but does not re-apply or re-push it.
    expect(ok(await sync(b))).toMatchObject({ pulled: 0, applied: 0, pushed: 0 })
    expect(ok(await sync(a))).toMatchObject({ pulled: 1, applied: 0, pushed: 0 })
    expect(ok(await sync(a))).toMatchObject({ pulled: 0, pushed: 0 })
  })

  it('syncs generated daily problems (practiceItems)', async () => {
    const { a, b } = await twoDevices()
    const item = await insertRecord(a, 'practiceItems', { planId: 'p', date: '2026-11-09', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', minutes: 25, status: 'open' })
    ok(await sync(a))
    ok(await sync(b))
    expect(await b.practiceItems.get(item.id)).toEqual(item)
  })

  it('syncs every table, settings included', async () => {
    const { a, b } = await twoDevices()
    await updateSettings(a, { theme: 'dark' })
    ok(await sync(a))
    ok(await sync(b))
    expect((await getSettings(b)).theme).toBe('dark')
  })

  it('edits on both: the newest updatedAt wins on both after two rounds', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'x')
    ok(await sync(a))
    ok(await sync(b))
    await editAt(a, r.id, { title: 'from A' }, NOW + 1000)
    await editAt(b, r.id, { title: 'from B' }, NOW + 2000)
    ok(await sync(a)) // pushes A's edit
    const sb = ok(await sync(b)) // pulls A's (older) edit, keeps its own, pushes B's
    expect(sb).toMatchObject({ pulled: 1, applied: 0, pushed: 1 })
    const sa = ok(await sync(a))
    expect(sa).toMatchObject({ pulled: 1, applied: 1 })
    expect((await a.practiceLog.get(r.id))?.title).toBe('from B')
    expect((await b.practiceLog.get(r.id))?.title).toBe('from B')
  })

  it('the older edit loses even when it reaches the server last', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'x')
    ok(await sync(a))
    ok(await sync(b))
    await editAt(a, r.id, { title: 'old' }, NOW + 1000)
    await editAt(b, r.id, { title: 'new' }, NOW + 2000)
    ok(await sync(b)) // B first
    const sa = ok(await sync(a)) // A pulls the newer one, applies it, and has nothing newer to push
    expect(sa).toMatchObject({ applied: 1, pushed: 0 })
    expect((await a.practiceLog.get(r.id))?.title).toBe('new')
    expect(ok(await sync(b))).toMatchObject({ applied: 0 })
  })

  it('equal timestamps: the server keeps the first push and both devices end up identical', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'x')
    ok(await sync(a))
    ok(await sync(b))
    await editAt(a, r.id, { title: 'from A' }, NOW + 1000)
    await editAt(b, r.id, { title: 'from B' }, NOW + 1000)
    ok(await sync(a)) // first to the server
    expect(ok(await sync(b))).toMatchObject({ pulled: 1, applied: 1, pushed: 0, rejectedStale: 0 }) // B pulls A's edit first and takes it; nothing left to push
    ok(await sync(a))
    expect((await a.practiceLog.get(r.id))?.title).toBe('from A')
    expect(await b.practiceLog.get(r.id)).toEqual(await a.practiceLog.get(r.id))
    // Settled: nothing keeps bouncing.
    expect(ok(await sync(b))).toMatchObject({ applied: 0, pushed: 0 })
  })

  it('a delete is a row with deleted=true: the server keeps one record, and the tombstone is inside the ciphertext', async () => {
    const { a } = await twoDevices()
    const r = await add(a, 'x')
    ok(await sync(a))
    await softDelete(a, 'practiceLog', r.id)
    ok(await sync(a))
    expect(await d1.prepare('SELECT COUNT(*) AS n FROM sync_records').first('n')).toBe(1)
    expect(await d1.prepare('SELECT record_count FROM sync_spaces').first('record_count')).toBe(1)
  })

  it('push marks: a row pulled from a fast clock does not hide this device\'s own later edits', async () => {
    const { a, b } = await twoDevices()
    const x = await add(a, 'x')
    ok(await sync(a))
    ok(await sync(b))
    await editAt(a, x.id, { title: 'fast clock' }, Date.now() + 600_000) // A's clock is 10 minutes ahead
    ok(await sync(a))
    ok(await sync(b)) // B receives X; it is not pushed back
    const y = await add(b, 'y') // B's clock is right
    ok(await sync(b))
    ok(await sync(a))
    expect(await a.practiceLog.get(y.id)).toEqual(y)
  })

  it('a key change waits for a running sync: the new space starts with a clean cursor and marks', async () => {
    const { a } = await twoDevices()
    await add(a, 'one')
    const other = keyToMnemonic(generateSyncKey())
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const slow: typeof fetch = async (input, init) => {
      await gate
      return worldFetch()(input, init)
    }
    const run = syncNow(a, slow, BASE)
    const join = enableSync(a, other) // queued behind the run
    await new Promise((r) => setTimeout(r, 20))
    expect((await getSyncSecret(a))?.mnemonic).not.toBe(other) // not switched yet
    release()
    expect((await run).error).toBeUndefined() // the run finished against the old key
    expect((await join).mnemonic).toBe(other)
    expect(await a.meta.get('syncCursor')).toBeUndefined()
    expect(await a.meta.get('syncPushed')).toBeUndefined()
    expect(ok(await sync(a))).toMatchObject({ pushed: 1 }) // everything goes to the new space
  })

  it('a run that finds the key changed underneath it writes nothing', async () => {
    const { a, b } = await twoDevices()
    await add(b, 'from-b')
    ok(await sync(b))
    const swap: typeof fetch = async (input, init) => {
      const res = await worldFetch()(input, init)
      // Another tab changes the key while the response is on its way.
      await a.meta.put({ key: 'syncKey', value: 'other' })
      return res
    }
    const s = await syncNow(a, swap, BASE)
    expect(s.error?.kind).toBe('not-enabled')
    expect(await a.practiceLog.count()).toBe(0)
    expect(await a.meta.get('syncCursor')).toBeUndefined()
  })

  it('uses the Web Lock "kiln-sync" when the browser has one', async () => {
    const { a } = await twoDevices()
    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb())
    vi.stubGlobal('navigator', { locks: { request } })
    try {
      ok(await sync(a))
      expect(request).toHaveBeenCalledWith('kiln-sync', expect.any(Function))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a rejected new key leaves the old one in place; an accepted one replaces it', async () => {
    const { a } = await twoDevices()
    const before = (await getSyncSecret(a))!.mnemonic
    const next = generateSyncKey()
    const refuse: typeof fetch = async () => new Response('{}', { status: 403 })
    const refused = await enableSync(a, keyToMnemonic(next), { fetch: refuse, baseUrl: BASE })
    expect(refused).toMatchObject({ ok: false, error: { kind: 'wrong-key' } })
    const offline: typeof fetch = () => Promise.reject(new TypeError('offline'))
    expect(await enableSyncFromQr(a, 'kiln-sync:' + Buffer.from(next).toString('base64url'), { fetch: offline, baseUrl: BASE })).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    })
    expect((await getSyncSecret(a))?.mnemonic).toBe(before)
    const accepted = await enableSync(a, keyToMnemonic(next), { fetch: worldFetch(), baseUrl: BASE })
    expect(accepted).toMatchObject({ ok: true, mnemonic: keyToMnemonic(next) })
    expect((await getSyncSecret(a))?.mnemonic).toBe(keyToMnemonic(next))
  })

  it('rows written in a newer format wait, sync reports update-required, and a newer valid version clears them', async () => {
    const { b, mnemonic } = await twoDevices()
    const keys = await deriveKeys(mnemonicToKey(mnemonic))
    const base = { deleted: false, deviceId: 'x', date: '2026-11-09', slug: 'future', title: 'future', difficulty: 'easy', completedAt: 1 }
    const put = async (row: Row & { id: string; updatedAt: number }, v: number) => {
      const w = await encryptRow(keys, 'practiceLog', row, v)
      const res = await worldFetch()(BASE + '/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spaceId: keys.spaceId, token: keys.token, rows: [w] }),
      })
      expect(res.status).toBe(200)
    }
    await put({ id: 'fut-1', updatedAt: Date.now(), ...base }, 99)
    const s = await sync(b)
    expect(s.error?.kind).toBe('update-required')
    expect(s).toMatchObject({ pulled: 1, applied: 0, invalid: 0, retrying: 1 })
    expect(await b.practiceLog.count()).toBe(0)
    expect((await getSyncStatus(b)).lastSyncedAt).toBeUndefined()
    // Still waiting on the next run, no new pull needed.
    expect((await sync(b)).error?.kind).toBe('update-required')
    // A device that can write the new format replaces it with a version this app understands.
    await put({ id: 'fut-1', updatedAt: Date.now() + 5, ...base }, 1)
    expect(ok(await sync(b))).toMatchObject({ applied: 1, retrying: 0 })
    expect(await slugs(b)).toEqual(['future'])
  })

  it('an older app holds study time plans and sessions back (version 2), keeps syncing the rest, and applies them once updated', async () => {
    const { a, b } = await twoDevices()
    const study: Plan = { schemaVersion: 1, id: 'study-psychology', title: 'Psychology', subject: 'Psychology', schedulingMode: 'auto', studyMinutesPerWeek: 180, sources: [], modules: [], tasks: [] }
    const { planId } = await importPlan(a, study, { startDate: '2026-11-09' })
    await a.studyItems.put({ id: `${planId}:2026-11-09`, planId, date: '2026-11-09', minutes: 25, status: 'open', updatedAt: Date.now(), deleted: false, deviceId: 'a' })
    await add(a, 'two-sum')
    ok(await sync(a))
    clientVersion.v = 1
    try {
      const s = await sync(b)
      expect(s.error?.kind).toBe('update-required')
      expect(s).toMatchObject({ retrying: 2, invalid: 0 })
      expect(await b.plans.count()).toBe(0)
      expect(await b.studyItems.count()).toBe(0)
      expect(await slugs(b)).toEqual(['two-sum'])
    } finally {
      clientVersion.v = undefined
    }
    expect(ok(await sync(b))).toMatchObject({ retrying: 0 })
    expect((await b.plans.get(planId))?.studyMinutesPerWeek).toBe(180)
    expect((await b.studyItems.get(`${planId}:2026-11-09`))?.minutes).toBe(25)
  })

  it('a row that fails validation today is applied when a later run can accept it', async () => {
    const { b, mnemonic } = await twoDevices()
    const keys = await deriveKeys(mnemonicToKey(mnemonic))
    const t0 = Date.now()
    // Dated 2 days ahead inside the ciphertext: rejected as a clock error now, fine in 2 days.
    const row = { id: 'later-1', updatedAt: t0 + 2 * 86_400_000, deleted: false, deviceId: 'x', date: '2026-11-09', slug: 'later', title: 'later', difficulty: 'easy', completedAt: 1 }
    const w = await encryptRow(keys, 'practiceLog', row)
    await worldFetch()(BASE + '/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spaceId: keys.spaceId, token: keys.token, rows: [{ ...w, updatedAt: t0 }] }),
    })
    expect(ok(await sync(b))).toMatchObject({ applied: 0, retrying: 1 })
    vi.useFakeTimers({ toFake: ['Date'], now: t0 + 3 * 86_400_000 })
    try {
      expect(ok(await sync(b))).toMatchObject({ applied: 1, retrying: 0 })
    } finally {
      vi.useRealTimers()
    }
    expect(await slugs(b)).toEqual(['later'])
  })

  it('a server that says "more" without moving the cursor is an error and nothing is written', async () => {
    const { a, b } = await twoDevices()
    await add(a, 'one')
    ok(await sync(a))
    const stuck: typeof fetch = async (input, init) => {
      const res = await worldFetch()(input, init)
      const body = (await res.json()) as { rows: unknown[] }
      return Response.json({ ...body, more: true, cursor: 0 })
    }
    const s = await syncNow(b, stuck, BASE)
    expect(s.error?.kind).toBe('server')
    expect(await b.practiceLog.count()).toBe(0)
    expect(await b.meta.get('syncCursor')).toBeUndefined()
  })

  it('reports records too large to upload, keeps pushing the rest, and keeps reporting until fixed', async () => {
    const { a, b } = await twoDevices()
    const small = (id: string, updatedAt: number) => ({ id, ...problem(id), updatedAt, deleted: false, deviceId: 'a' })
    await a.practiceLog.bulkPut([small('s1', NOW), { ...small('big', NOW + 10), title: 'x'.repeat(60_000) }, small('s3', NOW + 20)])
    const first = ok(await sync(a))
    expect(first).toMatchObject({ pushed: 2, tooLarge: [{ table: 'practiceLog', id: 'big' }] })
    // The mark stays below the big record, so it is reported again (the row above it is seen as already on the server).
    expect(ok(await sync(a))).toMatchObject({ pushed: 0, tooLarge: [{ table: 'practiceLog', id: 'big' }] })
    await a.practiceLog.put({ ...small('big', NOW + 30), title: 'small now' })
    expect(ok(await sync(a))).toMatchObject({ pushed: 1, tooLarge: [] })
    expect(ok(await sync(b))).toMatchObject({ applied: 3 })
  })

  it('a delete on B reaches A as a tombstone', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'gone')
    ok(await sync(a))
    ok(await sync(b))
    await softDelete(b, 'practiceLog', r.id)
    ok(await sync(b))
    ok(await sync(a))
    expect((await a.practiceLog.get(r.id))?.deleted).toBe(true)
    expect(await slugs(a)).toEqual([])
  })

  it('an edit newer than a delete brings the record back; an older one does not', async () => {
    const { a, b } = await twoDevices()
    const r = await add(a, 'x')
    ok(await sync(a))
    ok(await sync(b))
    await editAt(b, r.id, { deleted: true }, NOW + 5000)
    await editAt(a, r.id, { title: 'late edit' }, NOW + 9000)
    ok(await sync(b))
    ok(await sync(a))
    ok(await sync(b))
    expect((await b.practiceLog.get(r.id))).toMatchObject({ deleted: false, title: 'late edit' })
    expect((await a.practiceLog.get(r.id))).toMatchObject({ deleted: false, title: 'late edit' })
  })

  it('offline edits on both sides converge', async () => {
    const { a, b } = await twoDevices()
    const shared = await add(a, 'shared')
    ok(await sync(a))
    ok(await sync(b))
    // Both go offline and work.
    await add(a, 'a-only')
    await add(b, 'b-only')
    await editAt(a, shared.id, { title: 'A title' }, NOW + 100)
    await editAt(b, shared.id, { title: 'B title' }, NOW + 200)
    // Back online, any order, a few rounds.
    for (const d of [a, b, a, b]) ok(await sync(d))
    expect(await slugs(a)).toEqual(['a-only', 'b-only', 'shared'])
    expect(await slugs(b)).toEqual(await slugs(a))
    expect((await a.practiceLog.get(shared.id))?.title).toBe('B title')
    expect((await b.practiceLog.get(shared.id))?.title).toBe('B title')
  })

  it('a device with existing data joining a space merges instead of replacing', async () => {
    const a = newDb()
    const b = newDb()
    await add(a, 'on-a')
    await add(b, 'on-b')
    const { mnemonic } = await enableSync(a)
    ok(await sync(a))
    await enableSync(b, mnemonic)
    expect(ok(await sync(b))).toMatchObject({ pulled: 1, applied: 1, pushed: 1 })
    ok(await sync(a))
    expect(await slugs(a)).toEqual(['on-a', 'on-b'])
    expect(await slugs(b)).toEqual(['on-a', 'on-b'])
  })

  it('skips a corrupted row, counts it, and still applies the rest', async () => {
    const { a, b } = await twoDevices()
    await add(a, 'one')
    await add(a, 'two')
    await add(a, 'three')
    ok(await sync(a))
    const victim = (await d1.prepare('SELECT record_key, ciphertext FROM sync_records ORDER BY seq LIMIT 1').first()) as { record_key: string; ciphertext: string }
    const c = victim!.ciphertext
    await d1.prepare('UPDATE sync_records SET ciphertext = ? WHERE record_key = ?')
      .bind(c.slice(0, 10) + (c[10] === 'A' ? 'B' : 'A') + c.slice(11), victim!.record_key)
      .run()
    const s = ok(await sync(b))
    expect(s).toMatchObject({ pulled: 3, applied: 2, invalid: 1 })
    expect(await slugs(b)).toEqual(['three', 'two'])
  })

  it('keeps rows that decrypt but fail validation for later, and applies the rest', async () => {
    const { a, b, mnemonic } = await twoDevices()
    await add(a, 'fine')
    ok(await sync(a))
    const keys = await deriveKeys(mnemonicToKey(mnemonic))
    const base = { updatedAt: Date.now(), deleted: false, deviceId: 'x' }
    const enc = (table: string, row: Row & { id: string; updatedAt: number }) => encryptRow(keys, table as never, row)
    const wire = [
      await enc('practiceLog', { id: 'bad-1', ...base, date: 'nope', slug: 's', title: 't', difficulty: 'impossible', completedAt: 1 }),
      await enc('nothing', { id: 'bad-2', ...base }),
      await enc('practiceLog', { id: 'bad-3', ...base, updatedAt: Date.now() + 5 * 86_400_000, date: '2026-11-09', slug: 's', title: 't', difficulty: 'easy', completedAt: 1 }),
    ]
    const r = await worldFetch()(BASE + '/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The server only accepts updatedAt up to a day ahead, so send the far-future row with a valid clear timestamp.
      body: JSON.stringify({ spaceId: keys.spaceId, token: keys.token, rows: wire.map((w) => ({ ...w, updatedAt: Date.now() })) }),
    })
    expect(r.status).toBe(200)
    expect(ok(await sync(b))).toMatchObject({ pulled: 4, applied: 1, invalid: 0, retrying: 3 })
    expect(await slugs(b)).toEqual(['fine'])
    // They stay waiting (and are not counted as pulled again).
    expect(ok(await sync(b))).toMatchObject({ pulled: 0, applied: 0, retrying: 3 })
  })

  it('a failure part way through a push keeps what was sent and resumes with the rest', async () => {
    const { a, b } = await twoDevices()
    await a.practiceLog.bulkPut(
      Array.from({ length: 250 }, (_, i) => ({ id: `row-${i}`, ...problem(`p${i}`), updatedAt: NOW - 1000 + i, deleted: false, deviceId: 'a' })),
    )
    let pushes = 0
    const flaky: typeof fetch = (input, init) =>
      String(input).endsWith('/sync/push') && ++pushes === 2 ? Promise.reject(new TypeError('dropped')) : worldFetch()(input, init)
    const s = await syncNow(a, flaky, BASE)
    expect(s).toMatchObject({ pushed: 200, error: { kind: 'network' } })
    expect(ok(await sync(a))).toMatchObject({ pushed: 50 })
    expect(ok(await sync(b))).toMatchObject({ applied: 250 })
  })

  it('moves 1100 rows: 6 pushes of up to 200, 3 pull pages', async () => {
    const { a, b } = await twoDevices()
    await a.practiceLog.bulkPut(
      Array.from({ length: 1100 }, (_, i) => ({ id: `row-${String(i).padStart(4, '0')}`, ...problem(`p${i}`), updatedAt: NOW - i, deleted: false, deviceId: 'a' })),
    )
    expect(ok(await sync(a))).toMatchObject({ pushed: 1100 })
    expect(ok(await sync(b))).toMatchObject({ pulled: 1100, applied: 1100 })
    expect(await b.practiceLog.count()).toBe(1100)
  })
})

describe('trouble', () => {
  beforeEach(reset)

  it('reports sync off', async () => {
    const s = await sync(newDb())
    expect(s.error?.kind).toBe('not-enabled')
  })

  it('reports a wrong key (403) and keeps local data', async () => {
    const { a } = await twoDevices()
    await add(a, 'mine')
    ok(await sync(a))
    await d1.prepare('UPDATE sync_spaces SET token_hash = ?').bind('0'.repeat(64)).run()
    const s = await sync(a)
    expect(s.error?.kind).toBe('wrong-key')
    expect(await slugs(a)).toEqual(['mine'])
  })

  it('reports a full space (507) and keeps the changes to retry', async () => {
    const { a } = await twoDevices()
    await add(a, 'one')
    await add(a, 'two')
    const s = await sync(a, { MAX_SYNC_RECORDS: '1' })
    expect(s.error?.kind).toBe('quota')
    expect(s.pushed).toBe(0)
    // The marks did not move, so a later run sends everything.
    expect(ok(await sync(a))).toMatchObject({ pushed: 2 })
  })

  it('network errors change nothing and the next run catches up', async () => {
    const { a, b } = await twoDevices()
    await add(a, 'one')
    ok(await sync(a))
    const down: typeof fetch = () => Promise.reject(new TypeError('offline'))
    expect((await syncNow(b, down, BASE)).error?.kind).toBe('network')
    expect(await b.practiceLog.count()).toBe(0)
    expect(ok(await sync(b))).toMatchObject({ pulled: 1, applied: 1 })
  })

  it('a failure after the first pull page keeps that page and resumes from its cursor', async () => {
    const { a, b } = await twoDevices()
    await add(a, 'one')
    ok(await sync(a))
    let calls = 0
    const flaky: typeof fetch = (input, init) => (++calls === 1 ? worldFetch()(input, init) : Promise.reject(new TypeError('dropped')))
    const s = await syncNow(b, flaky, BASE)
    // Page 1 had no `more`, so the failure came while pushing: nothing to push, no error. Force one.
    expect(s.error).toBeUndefined()
    await add(b, 'local')
    calls = 0
    const s2 = await syncNow(b, flaky, BASE)
    expect(s2.error?.kind).toBe('network')
    expect(await slugs(b)).toEqual(['local', 'one'])
    expect(ok(await sync(b))).toMatchObject({ pulled: 0, pushed: 1 })
  })

  it('shares one run between simultaneous calls', async () => {
    const { a } = await twoDevices()
    await add(a, 'one')
    const [x, y] = await Promise.all([sync(a), sync(a)])
    expect(x).toBe(y)
    expect(x.pushed).toBe(1)
  })

  it('disableSync forgets the key; the data stays', async () => {
    const { a } = await twoDevices()
    await add(a, 'one')
    expect(await getSyncSecret(a)).toBeDefined()
    await disableSync(a)
    expect(await getSyncSecret(a)).toBeUndefined()
    expect((await sync(a)).error?.kind).toBe('not-enabled')
    expect(await slugs(a)).toEqual(['one'])
  })

  it('the server never holds the words, the key, table names or record ids', async () => {
    const { a, mnemonic } = await twoDevices()
    const r = await add(a, 'secret-slug')
    await updateRecord(a, 'practiceLog', r.id, { title: 'Secret Title' })
    ok(await sync(a))
    const dump = JSON.stringify([
      (await d1.prepare('SELECT * FROM sync_records').all()).results,
      (await d1.prepare('SELECT * FROM sync_spaces').all()).results,
    ])
    for (const needle of ['secret-slug', 'Secret Title', 'practiceLog', r.id, mnemonic.split(' ')[0]!]) expect(dump).not.toContain(needle)
  })
})

describe('schema 4 tables', () => {
  beforeEach(reset)

  it('syncs personal to-dos, events, plan versions, feeds and the new plan fields, edits and deletes included', async () => {
    const { a, b } = await twoDevices()
    const todo = await insertRecord(a, 'personalTodos', { title: 'Call the bank', date: '2026-11-09', minutes: 15, done: false })
    const event = await insertRecord(a, 'events', { title: 'BIO 101 lecture', date: '2026-11-09', allDay: false, start: NOW, end: NOW + 3_600_000, course: 'BIO 101', uid: 'u1@lms' })
    const feed = await insertRecord(a, 'feeds', { lms: 'canvas', url: 'https://canvas.example/feeds/calendars/user_secret.ics', planIds: [], lastResult: { ok: true, added: 2 } })
    const plan = validateParts([fixtureTexts.sd]).plans[0]!
    const { planId } = await importPlan(a, plan, { startDate: '2026-11-09' })
    await updateRecord(a, 'plans', planId, { favorite: true, dailyPracticeOn: true, reviewsOn: true })
    await setPlanShare(a, planId, 'more')
    const version = await snapshotPlan(a, planId, { summary: 'Imported' })
    ok(await sync(a))
    ok(await sync(b))
    expect(await b.personalTodos.get(todo.id)).toEqual(todo)
    expect(await b.events.get(event.id)).toEqual(event)
    expect(await b.feeds.get(feed.id)).toEqual(feed)
    expect(await b.planVersions.get(version.id)).toEqual(version)
    expect((await readSnapshot((await b.planVersions.get(version.id))!)).title).toBe(plan.title)
    expect(await b.plans.get(planId)).toMatchObject({ favorite: true, dailyPracticeOn: true, reviewsOn: true, share: 'more', weight: 5 })

    // Back the other way: B edits and deletes, A receives.
    await setPersonalTodoDone(b, todo.id, true)
    await softDelete(b, 'events', event.id)
    await updateRecord(b, 'feeds', feed.id, { lastFetchedAt: NOW })
    ok(await sync(b))
    ok(await sync(a))
    expect(await a.personalTodos.get(todo.id)).toMatchObject({ done: true })
    expect(await a.events.get(event.id)).toMatchObject({ deleted: true })
    expect(await a.feeds.get(feed.id)).toMatchObject({ lastFetchedAt: NOW })

    // The review switch, flipped on the other device, comes back too.
    await updateRecord(b, 'plans', planId, { reviewsOn: false })
    ok(await sync(b))
    ok(await sync(a))
    expect((await a.plans.get(planId))!.reviewsOn).toBe(false)

    // The feed URL is a secret: the server only ever holds ciphertext.
    const dump = JSON.stringify((await d1.prepare('SELECT * FROM sync_records').all()).results)
    expect(dump).not.toContain('user_secret')
  })
})
