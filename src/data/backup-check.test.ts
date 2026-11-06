import { describe, expect, it } from 'vitest'
import { applyBackup, checkBackup, exportBackup, MAX_BACKUP_CHARS } from './backup'
import { fixtureTexts, validateParts } from './fixtures'
import { importPlan, listTasks, setTaskStatus } from './repo'
import { newDb } from './test-db'
import { tombstoneAll } from './reset'

const sd = validateParts([fixtureTexts.sd]).plans[0]!

describe('checkBackup and applyBackup', () => {
  it('counts added, replaced and stale rows without writing, then applies', async () => {
    const source = newDb()
    const { planId } = await importPlan(source, sd, { startDate: '2026-11-09' })
    const text = await exportBackup(source)
    const total = (await listTasks(source, planId)).length

    const target = newDb()
    const check = await checkBackup(target, text)
    expect(check.counts.tasks).toEqual({ added: total, replaced: 0, kept: 0 })
    expect(await target.tasks.count()).toBe(0) // nothing written yet

    const result = await applyBackup(target, check)
    expect(result.tasks).toEqual({ added: total, replaced: 0, kept: 0 })

    // The same file again: everything is already here and equal, so all stale.
    expect((await checkBackup(target, text)).counts.tasks).toEqual({ added: 0, replaced: 0, kept: total })
    // A newer local edit makes that row stale; an older local row would be replaced.
    const first = (await listTasks(target, planId))[0]!
    await setTaskStatus(target, first.id, 'done')
    expect((await checkBackup(target, text)).counts.tasks).toEqual({ added: 0, replaced: 0, kept: total })
    await target.tasks.update(first.id, { updatedAt: 1 })
    expect((await checkBackup(target, text)).counts.tasks).toEqual({ added: 0, replaced: 1, kept: total - 1 })
  })

  it('validates before anything else: bad files and the size cap throw', async () => {
    const db = newDb()
    await expect(checkBackup(db, 'x'.repeat(MAX_BACKUP_CHARS + 1))).rejects.toThrow(/25 MB/)
    await expect(checkBackup(db, '{')).rejects.toThrow(/JSON/)
    await expect(checkBackup(db, JSON.stringify({ app: 'other' }))).rejects.toThrow(/valid Kiln backup/)
  })
})

describe('tombstoneAll', () => {
  it('marks every live row deleted with a newer updatedAt and keeps the rows', async () => {
    const db = newDb()
    const { planId } = await importPlan(db, sd, { startDate: '2026-11-09' })
    const before = await db.tasks.toArray()
    const marked = await tombstoneAll(db)
    expect(marked).toBeGreaterThan(before.length)
    const after = await db.tasks.toArray()
    expect(after).toHaveLength(before.length)
    expect(after.every((t) => t.deleted && t.updatedAt >= Math.max(...before.map((b) => b.updatedAt)))).toBe(true)
    expect(await listTasks(db, planId)).toEqual([])
    // A second call has nothing live left to mark.
    expect(await tombstoneAll(db)).toBe(0)
  })
})
