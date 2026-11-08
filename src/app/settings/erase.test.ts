import { describe, expect, it, vi } from 'vitest'
import { newDb } from '../../data/test-db'
import { importPlan, listPlans, getDeviceId } from '../../data'
import { fixtureTexts, validateParts } from '../../data/fixtures'
import { enableSyncKey, generateSyncKey, getSyncStatus, type SyncSummary } from '../../sync'
import { erase } from './erase'

const ok: SyncSummary = { pulled: 0, applied: 0, pushed: 5, rejectedStale: 0, invalid: 0, retrying: 0, tooLarge: [] }

async function seeded() {
  const db = newDb()
  await importPlan(db, validateParts([fixtureTexts.sd]).plans[0]!, { startDate: '2026-11-09' })
  return db
}

describe('erase', () => {
  it('device: turns sync off, clears the data, keeps the device id', async () => {
    const db = await seeded()
    await enableSyncKey(db, generateSyncKey())
    const id = await getDeviceId(db)
    const sync = vi.fn()
    await erase(db, 'device', sync)
    expect(sync).not.toHaveBeenCalled()
    expect((await getSyncStatus(db)).enabled).toBe(false)
    expect(await db.meta.get('syncKey')).toBeUndefined()
    expect(await db.plans.count()).toBe(0)
    expect(await getDeviceId(db)).toBe(id)
  })

  it('turns reminders off too, so the server stops sending to an empty app', async () => {
    const db = await seeded()
    await db.meta.bulkPut([
      { key: 'pushOn', value: '1' },
      { key: 'pushSent', value: '{}' },
    ])
    await erase(db, 'device', vi.fn())
    expect(await db.meta.get('pushOn')).toBeUndefined()
    expect(await db.meta.get('pushSent')).toBeUndefined()
  })

  it('everywhere: marks every row deleted before syncing, then clears', async () => {
    const db = await seeded()
    const tasks = await db.tasks.count()
    expect(tasks).toBeGreaterThan(0)
    let seen: { plans: number; liveTasks: number; allDeleted: boolean } | undefined
    await erase(db, 'everywhere', async () => {
      const rows = await db.tasks.toArray()
      seen = { plans: await db.plans.count(), liveTasks: rows.filter((r) => !r.deleted).length, allDeleted: rows.every((r) => r.deleted && r.updatedAt > 0) }
      return ok
    })
    expect(seen).toEqual({ plans: 1, liveTasks: 0, allDeleted: true })
    expect(await db.plans.count()).toBe(0)
    expect(await db.tasks.count()).toBe(0)
  })

  it('everywhere: a failed sync stops, says so and keeps the tombstones for a retry', async () => {
    const db = await seeded()
    const failed: SyncSummary = { ...ok, pushed: 0, error: { kind: 'network', message: 'offline' } }
    await expect(erase(db, 'everywhere', async () => failed)).rejects.toThrow(/Sync failed \(offline\)/)
    expect(await db.plans.count()).toBe(1)
    expect(await listPlans(db)).toEqual([]) // tombstoned: hidden from the app
    // The retry works.
    await erase(db, 'everywhere', async () => ok)
    expect(await db.plans.count()).toBe(0)
  })

  it('everywhere: rows too large to upload stop the erase too', async () => {
    const db = await seeded()
    await expect(erase(db, 'everywhere', async () => ({ ...ok, tooLarge: [{ table: 'tasks', id: 'x' }] }))).rejects.toThrow(/too large/)
    expect(await db.plans.count()).toBe(1)
  })
})
