import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { fixtureTexts, validateParts } from './fixtures'
import { importPlan, listTasks, setTaskStatus, softDelete, updateSettings } from './repo'
import { newDb } from './test-db'

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
  it('round-trips every table, tombstones included, into an empty database', async () => {
    const { db } = await seeded()
    const text = await exportBackup(db)
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ app: 'kiln', schemaVersion: 1 })
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
