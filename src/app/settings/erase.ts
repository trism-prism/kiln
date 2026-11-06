// "Reset local data" when sync may be on. The theme choice lives in localStorage and is left alone.
import { resetLocalData, tombstoneAll, type KilnDB } from '../../data'
import { disableSync, type SyncSummary } from '../../sync'

export type EraseMode = 'device' | 'everywhere'

/**
 * 'device': turn sync off here (the key and cursors in meta go too), then clear this device. Other
 * devices and the server keep their data.
 * 'everywhere': mark every row deleted, run a sync so the deletions reach the server and other
 * devices, then clear this device. If the sync fails this throws and nothing is cleared: the rows
 * stay on this device marked deleted, and running the reset again retries the sync.
 * Without sync, call with 'device'.
 */
export async function erase(db: KilnDB, mode: EraseMode, sync: () => Promise<SyncSummary>): Promise<void> {
  if (mode === 'device') {
    await disableSync(db)
    await resetLocalData(db)
    return
  }
  await tombstoneAll(db)
  const summary = await sync()
  if (summary.error) {
    throw new Error(
      `Sync failed (${summary.error.message}). Your data is marked deleted on this device but not on your other devices yet. Try again when you are online.`,
    )
  }
  if (summary.tooLarge.length > 0) {
    throw new Error(`${summary.tooLarge.length} items are too large to upload their deletion, so other devices would keep them. Nothing was cleared.`)
  }
  await resetLocalData(db)
}
