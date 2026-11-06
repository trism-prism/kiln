// JSON backup: every synced table including tombstones. The device-local meta table is left out.
import { z } from 'zod'
import type { KilnDB } from './db'
import { TABLE_NAMES, type Base, type TableName } from './types'
import type { Table } from 'dexie'

const BACKUP_APP = 'kiln'

const base = { id: z.string().min(1), updatedAt: z.number(), deleted: z.boolean(), deviceId: z.string() }
// Loose objects: the base fields and each table's key fields are checked, the rest passes through.
const rows = (shape: z.ZodRawShape = {}) => z.array(z.looseObject({ ...base, ...shape })).default([])

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  tables: z.object({
    plans: rows({ key: z.string(), title: z.string(), weight: z.number(), startDate: z.string(), partTotal: z.number(), partsIn: z.array(z.number()) }),
    modules: rows({ planId: z.string(), key: z.string(), order: z.number() }),
    tasks: rows({ planId: z.string(), moduleId: z.string(), key: z.string(), status: z.enum(['open', 'done', 'skipped']) }),
    reviewCards: rows({ planId: z.string(), due: z.number() }),
    reviewLogs: rows({ cardId: z.string(), rating: z.number() }),
    practiceLog: rows({ date: z.string(), slug: z.string() }),
    settings: rows({ minutesPerWeekday: z.array(z.number()).length(7) }),
  }),
})

export async function exportBackup(db: KilnDB): Promise<string> {
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray()
  return JSON.stringify({ app: BACKUP_APP, schemaVersion: db.verno, exportedAt: new Date().toISOString(), tables })
}

export interface BackupResult {
  /** Per table: records new to this database, records replaced by a newer one, records kept. */
  [table: string]: { added: number; replaced: number; kept: number }
}

/**
 * Merges a backup into the database by id: a record is taken when it is new or its updatedAt is
 * larger than the stored one (ties keep the stored record). Throws before writing anything if the
 * text is not a valid Kiln backup.
 */
export async function importBackup(db: KilnDB, text: string): Promise<BackupResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Not a Kiln backup: the file is not valid JSON')
  }
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`Not a valid Kiln backup: ${first?.path.join('.') || 'file'} ${first?.message ?? ''}`.trim())
  }
  const backup = parsed.data
  if (backup.schemaVersion > db.verno) {
    throw new Error(`This backup is from a newer Kiln (schema ${backup.schemaVersion}); update the app first`)
  }

  const result: BackupResult = {}
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) {
      const t = db.table(name) as Table<Base, string>
      const incoming = backup.tables[name as TableName] as Base[]
      const stored = await t.bulkGet(incoming.map((r) => r.id))
      const take: Base[] = []
      let added = 0
      let replaced = 0
      incoming.forEach((r, i) => {
        const old = stored[i]
        if (!old) added++
        else if (r.updatedAt > old.updatedAt) replaced++
        else return
        take.push(r)
      })
      await t.bulkPut(take)
      result[name] = { added, replaced, kept: incoming.length - added - replaced }
    }
  })
  return result
}
