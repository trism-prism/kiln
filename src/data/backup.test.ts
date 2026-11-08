import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { fixtureTexts, validateParts } from './fixtures'
import { importPlan, insertRecord, listTasks, setTaskStatus, softDelete, updateSettings } from './repo'
import { newDb } from './test-db'
import type { Plan } from '../domain/plan-format'

const sd = validateParts([fixtureTexts.sd]).plans[0]!

async function seeded() {
  const db = newDb()
  const { planId } = await importPlan(db, sd, { startDate: '2026-11-09' })
  const tasks = await listTasks(db, planId)
  await setTaskStatus(db, tasks[0]!.id, 'done')
  await softDelete(db, 'tasks', tasks[1]!.id)
  await updateSettings(db, { theme: 'light' })
  return { db, planId, tasks }
}

describe('backup', () => {
  it('leaves feed links out of the file and restores the feeds as needing their link', async () => {
    const db = newDb()
    const url = 'https://canvas.example.edu/feeds/calendars/user_secret_token.ics'
    const feed = await insertRecord(db, 'feeds', { lms: 'canvas', url, planIds: ['p1'], lastFetchedAt: 5 })
    const text = await exportBackup(db)
    expect(text).not.toContain('user_secret_token')
    expect(text).not.toContain(url)
    expect(JSON.parse(text).tables.feeds[0]).toMatchObject({ id: feed.id, url: '', needsLink: true })

    const other = newDb()
    await importBackup(other, text)
    expect(await other.feeds.get(feed.id)).toMatchObject({ url: '', needsLink: true, planIds: ['p1'] })

    // Restoring over a device that has the link keeps the link.
    await db.feeds.update(feed.id, { updatedAt: Date.now() - 1000 })
    await importBackup(db, text)
    expect((await db.feeds.get(feed.id))?.url).toBe(url)
  })

  it('round-trips every table, tombstones included, into an empty database', async () => {
    const { db } = await seeded()
    const text = await exportBackup(db)
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ app: 'kiln', schemaVersion: 5 })
    expect(parsed.tables.meta).toBeUndefined()

    const other = newDb()
    await importBackup(other, text)
    for (const name of ['plans', 'modules', 'tasks', 'settings'] as const) {
      const a = await db.table(name).orderBy('id').toArray()
      const b = await other.table(name).orderBy('id').toArray()
      expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)))
    }
    expect(await other.tasks.filter((t) => t.deleted).count()).toBe(1)
  })

  it('round-trips a study time plan and its sessions; a backup from before schema 5 (no studyItems) still reads', async () => {
    const db = newDb()
    const plan: Plan = { schemaVersion: 1, id: 'study-psychology', title: 'Psychology', subject: 'Psychology', schedulingMode: 'auto', studyMinutesPerWeek: 180, sources: [], modules: [], tasks: [] }
    const { planId } = await importPlan(db, plan, { startDate: '2026-11-09' })
    await db.studyItems.bulkPut([
      { id: `${planId}:2026-11-09`, planId, date: '2026-11-09', minutes: 25, status: 'done', completedAt: 5, updatedAt: 7, deleted: false, deviceId: 'd' },
      { id: `${planId}:2026-11-10`, planId, date: '2026-11-10', minutes: 30, status: 'open', updatedAt: 7, deleted: true, deviceId: 'd' },
    ])
    const text = await exportBackup(db)
    const other = newDb()
    expect((await importBackup(other, text)).studyItems).toMatchObject({ added: 2 })
    expect((await other.plans.get(planId))?.studyMinutesPerWeek).toBe(180)
    expect(await other.studyItems.orderBy('id').toArray()).toEqual(await db.studyItems.orderBy('id').toArray())

    const old = JSON.parse(text)
    delete old.tables.studyItems
    old.schemaVersion = 4
    const third = newDb()
    expect((await importBackup(third, JSON.stringify(old))).studyItems).toEqual({ added: 0, replaced: 0, kept: 0 })
  })

  it('merges last-write-wins on updatedAt', async () => {
    const { db, tasks } = await seeded()
    const doc = JSON.parse(await exportBackup(db))
    const [done, deleted, third] = [tasks[0]!.id, tasks[1]!.id, tasks[2]!.id]
    const row = (id: string) => doc.tables.tasks.find((t: { id: string }) => t.id === id)
    row(third).status = 'skipped' // newer in backup
    row(third).updatedAt += 1000
    row(done).status = 'open' // older in backup: must lose
    row(done).updatedAt -= 1000
    doc.tables.tasks.splice(doc.tables.tasks.indexOf(row(deleted)), 1)

    const result = await importBackup(db, JSON.stringify(doc))
    expect(result.tasks).toMatchObject({ added: 0, replaced: 1 })
    expect((await db.tasks.get(third))!.status).toBe('skipped')
    expect((await db.tasks.get(done))!.status).toBe('done')
    expect((await db.tasks.get(deleted))!.deleted).toBe(true)
  })

  describe('validation', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rejects = async (mutate: (doc: any) => void, pattern: RegExp) => {
      const { db } = await seeded()
      const doc = JSON.parse(await exportBackup(db))
      mutate(doc)
      const other = newDb()
      await expect(importBackup(other, JSON.stringify(doc))).rejects.toThrow(pattern)
      for (const name of ['plans', 'modules', 'tasks', 'settings'] as const) expect(await other.table(name).count()).toBe(0)
    }

    it('rejects an updatedAt in the far future, negative, or fractional', async () => {
      await rejects((d) => (d.tables.tasks[0].updatedAt = Date.now() + 2 * 86_400_000), /updatedAt/)
      await rejects((d) => (d.tables.tasks[0].updatedAt = -1), /updatedAt/)
      await rejects((d) => (d.tables.plans[0].updatedAt = 1.5), /updatedAt/)
    })

    it('rejects bad values in fields the app reads, even when the base fields are fine', async () => {
      await rejects((d) => (d.tables.tasks[0].estimatedMinutes = -5), /estimatedMinutes/)
      await rejects((d) => (d.tables.tasks[0].scheduledDate = 'tomorrow'), /scheduledDate/)
      await rejects((d) => (d.tables.plans[0].weight = 9), /weight/)
      await rejects((d) => (d.tables.settings[0].minutesPerWeekday = [1, 2, 3]), /minutesPerWeekday/)
      await rejects((d) => (d.tables.modules[0].order = 'first'), /order/)
    })

    it('drops fields it does not know', async () => {
      const { db } = await seeded()
      const doc = JSON.parse(await exportBackup(db))
      doc.tables.tasks[0].injected = 'x'
      const other = newDb()
      await importBackup(other, JSON.stringify(doc))
      expect(await other.tasks.get(doc.tables.tasks[0].id)).not.toHaveProperty('injected')
    })
  })

  it('dedupes rows with the same id, keeping the largest updatedAt, with correct counts', async () => {
    const { db } = await seeded()
    const doc = JSON.parse(await exportBackup(db))
    const row = doc.tables.tasks[2]
    const older = { ...row, status: 'skipped', updatedAt: row.updatedAt - 500 }
    const newer = { ...row, status: 'done', updatedAt: row.updatedAt + 500 }
    doc.tables.tasks = [newer, older, ...doc.tables.tasks.slice(0, 2), older]
    doc.tables.tasks.push({ ...row, id: 'fresh-id', status: 'open', updatedAt: 5 }, { ...row, id: 'fresh-id', status: 'done', updatedAt: 9 })
    const other = newDb()
    const result = await importBackup(other, JSON.stringify(doc))
    expect(result.tasks).toEqual({ added: 4, replaced: 0, kept: 0 })
    expect((await other.tasks.get(row.id))!.status).toBe('done')
    expect((await other.tasks.get('fresh-id'))!.status).toBe('done')
    const again = await importBackup(other, JSON.stringify(doc))
    expect(again.tasks).toEqual({ added: 0, replaced: 0, kept: 4 })
  })

  it('exports a consistent snapshot while writes are in flight', async () => {
    const { db, planId } = await seeded()
    // Many writes racing the export: each write bumps a task and its plan together in one transaction.
    const bump = (n: number) =>
      db.transaction('rw', db.plans, db.tasks, async () => {
        const plan = (await db.plans.get(planId))!
        const task = (await db.tasks.where('planId').equals(planId).first())!
        await db.plans.put({ ...plan, partTotal: 1, updatedAt: n })
        await db.tasks.put({ ...task, updatedAt: n })
      })
    const writes = Array.from({ length: 20 }, (_, i) => bump(1000 + i))
    const doc = JSON.parse(await exportBackup(db))
    await Promise.all(writes)
    const plan = doc.tables.plans[0]
    const first = doc.tables.tasks.find((t: { planId: string; updatedAt: number }) => t.planId === planId && t.updatedAt === plan.updatedAt)
    expect(plan.updatedAt < 1000 || first !== undefined).toBe(true)
  })

  it('rejects bad input without writing', async () => {
    const db = newDb()
    await expect(importBackup(db, 'nope')).rejects.toThrow(/JSON/)
    await expect(importBackup(db, JSON.stringify({ app: 'other' }))).rejects.toThrow(/valid Kiln backup/)
    const bad = { app: 'kiln', schemaVersion: 1, exportedAt: 'x', tables: { tasks: [{ id: 'a', updatedAt: 1, deleted: false, deviceId: 'd' }] } }
    await expect(importBackup(db, JSON.stringify(bad))).rejects.toThrow(/tasks/)
    await expect(importBackup(db, JSON.stringify({ ...bad, schemaVersion: 99, tables: {} }))).rejects.toThrow(/newer/)
    expect(await db.tasks.count()).toBe(0)
  })
})
