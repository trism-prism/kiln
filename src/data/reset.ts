import type { KilnDB } from './db'
import { TABLE_NAMES } from './types'

/** Erases every plan, task, review, log and setting on this device. The device id (meta) stays. */
export async function resetLocalData(db: KilnDB): Promise<void> {
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear()
  })
}
