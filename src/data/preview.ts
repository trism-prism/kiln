// Dry run of an import for the preview step: the real importPlan and scheduleAll run inside one
// transaction that is rolled back, so nothing is written and the preview cannot drift from the import.
import type { Plan } from '../domain/plan-format'
import type { ScheduleOutput } from '../domain/scheduler'
import type { KilnDB } from './db'
import { getDeviceId, importPlan, listTasks, type ImportOptions, type ImportResult } from './repo'
import { scheduleAll } from './schedule'
import type { TaskRecord } from './types'

class Rollback extends Error {}

export interface ImportPreview {
  result: ImportResult
  /** The scheduler's output for every plan, as it would be after the import. */
  output: ScheduleOutput
  /** The plan's tasks with the dates they would get (`scheduledDate`, or `backlog`). */
  tasks: TaskRecord[]
}

/** What importPlan + scheduleAll would do, without writing. Throws what importPlan would throw. */
export async function previewImport(db: KilnDB, plan: Plan, opts: ImportOptions, today: string): Promise<ImportPreview> {
  // Create the device id outside the transaction: inside it, a rollback would lose it while the cache kept it.
  await getDeviceId(db)
  const box: { value?: ImportPreview } = {}
  try {
    await db.transaction('rw', db.tables, async () => {
      const result = await importPlan(db, plan, opts)
      const output = await scheduleAll(db, today)
      box.value = { result, output, tasks: await listTasks(db, result.planId) }
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  if (!box.value) throw new Error('preview failed')
  return box.value
}
