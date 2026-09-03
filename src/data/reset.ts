import type { Table } from 'dexie'
import type { KilnDB } from './db'
import { getDeviceId, stampAfter } from './repo'
import { TABLE_NAMES, type Base } from './types'

/** Erases every plan, task, review, log and setting on this device. The device id (meta) stays. */
export async function resetLocalData(db: KilnDB): Promise<void> {
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear()
  })
}

/**
 * Marks every live row of every synced table deleted (a tombstone with a new updatedAt and this
 * device's id), the same write softDeletePlan does, so a sync carries the deletion to other devices.
 * Returns how many rows were marked.
 */
export async function tombstoneAll(db: KilnDB): Promise<number> {
  const deviceId = await getDeviceId(db)
  let count = 0
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) {
      const t = db.table(name) as Table<Base, string>
      const live = (await t.toArray()).filter((r) => !r.deleted)
      await t.bulkPut(live.map((r) => ({ ...r, deleted: true, updatedAt: stampAfter(r.updatedAt), deviceId })))
      count += live.length
    }
  })
  return count
}
