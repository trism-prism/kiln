// JSON backup: every synced table including tombstones. The device-local meta table is left out.
import type { Table } from 'dexie'
import { z } from 'zod'
import { planSchema } from '../domain/plan-format'
import type { KilnDB } from './db'
import { TABLE_NAMES, type Base, type TableName } from './types'

const BACKUP_APP = 'kiln'
const DAY_MS = 86_400_000

const ps = planSchema.shape
// Plan task content (title, type, minutes, resources...) is the plan format's own task schema.
const taskContent = ps.tasks.element.omit({ id: true, moduleId: true })

const str = z.string()
const int = z.number().int()
const num = z.number().finite()
const day = z.iso.date()
const fsrsState = int.min(0).max(3)
const rating = int.min(1).max(4)

/**
 * One Zod object per synced table (a single row). Built per call so "not in the future" is
 * measured at parse time. Shared by backup import and sync.
 */
export function rowSchemas(now: number) {
  const base = {
    id: str.min(1),
    // A far-future updatedAt would win every later merge, so it is bounded (one day of clock skew).
    updatedAt: int.min(0).max(now + DAY_MS),
    deleted: z.boolean(),
    deviceId: str,
  }
  // z.object strips unknown fields, so only checked fields are ever written.
  const rows = <T extends z.ZodRawShape>(shape: T) => z.object({ ...base, ...shape })

  return {
      plans: rows({
        key: str,
        title: ps.title,
        description: ps.description,
        goal: ps.goal,
        subject: ps.subject,
        level: ps.level,
        audience: ps.audience,
        schedulingMode: ps.schedulingMode,
        sources: ps.sources,
        dailyPractice: ps.dailyPractice,
        weight: int.min(1).max(5),
        startDate: day,
        deadline: day.optional(),
        partTotal: int.min(1).max(20),
        partsIn: z.array(int.min(1).max(20)),
      }),
      modules: rows({
        planId: str,
        key: str,
        title: ps.modules.element.shape.title,
        order: int,
        summary: str.optional(),
        notBeforeDay: int.optional(),
      }),
      tasks: rows({
        ...taskContent.shape,
        planId: str,
        key: str,
        moduleId: str,
        scheduledDate: day.optional(),
        pinnedDate: day.optional(),
        status: z.enum(['open', 'done', 'skipped']),
        completedAt: num.optional(),
        backlog: z.boolean().optional(),
      }),
      reviewCards: rows({
        planId: str,
        taskId: str.optional(),
        slug: str.optional(),
        topics: z.array(str),
        due: num,
        stability: num,
        difficulty: num,
        scheduledDays: num,
        // Added in schema 2; older backups lack them.
        learningSteps: int.default(0),
        reps: int,
        lapses: int,
        state: fsrsState,
        lastReview: num.optional(),
        minutes: num.default(10),
        suspended: z.boolean().optional(),
      }),
      reviewLogs: rows({
        cardId: str,
        rating,
        state: fsrsState,
        due: num,
        stability: num,
        difficulty: num,
        scheduledDays: num,
        learningSteps: int.default(0),
        reviewedAt: num,
      }),
      practiceLog: rows({
        date: day,
        planId: str.optional(),
        taskId: str.optional(),
        slug: str,
        title: str,
        difficulty: z.enum(['easy', 'medium', 'hard']),
        topic: str.optional(),
        rating: rating.optional(),
        completedAt: num,
      }),
      settings: rows({
        minutesPerWeekday: z.array(int.min(0).max(1440)).length(7),
        weekStartsOn: z.enum(['monday', 'sunday']),
        reminderTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        nudgeEnabled: z.boolean(),
        nudgeTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        theme: z.enum(['system', 'light', 'dark']),
        reviewCapPercent: num.min(0).max(100),
        blackoutDates: z.array(day),
      }),
  } satisfies Record<TableName, z.ZodType>
}

function backupSchema(now: number) {
  const r = rowSchemas(now)
  const list = <T extends z.ZodType>(row: T) => z.array(row).default([])
  return z.object({
    app: z.literal(BACKUP_APP),
    schemaVersion: int.min(1),
    exportedAt: str,
    tables: z.object({
      plans: list(r.plans),
      modules: list(r.modules),
      tasks: list(r.tasks),
      reviewCards: list(r.reviewCards),
      reviewLogs: list(r.reviewLogs),
      practiceLog: list(r.practiceLog),
      settings: list(r.settings),
    }),
  })
}

/**
 * Last-write-wins merge of rows into one table, by id: a row is taken when it is new or its
 * updatedAt is larger than the stored one (ties keep the stored row). If an id appears twice, the
 * copy with the larger updatedAt counts. Call inside a read-write transaction on the table.
 */
export async function mergeRows(t: Table<Base, string>, rows: Base[]): Promise<{ added: number; replaced: number; kept: number }> {
  const byId = new Map<string, Base>()
  for (const r of rows) {
    const dup = byId.get(r.id)
    if (!dup || r.updatedAt > dup.updatedAt) byId.set(r.id, r)
  }
  const incoming = [...byId.values()]
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
  return { added, replaced, kept: incoming.length - added - replaced }
}

export async function exportBackup(db: KilnDB): Promise<string> {
  const tables: Record<string, unknown[]> = {}
  // One read transaction, so the export is a consistent snapshot.
  await db.transaction('r', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray()
  })
  return JSON.stringify({ app: BACKUP_APP, schemaVersion: db.verno, exportedAt: new Date().toISOString(), tables })
}

export interface BackupResult {
  /** Per table, counting distinct ids in the backup: new to this database, replaced by a newer one, kept. */
  [table: string]: { added: number; replaced: number; kept: number }
}

/**
 * Merges a backup into the database by id: a record is taken when it is new or its updatedAt is
 * larger than the stored one (ties keep the stored record). If an id appears twice in the backup,
 * the copy with the larger updatedAt counts. Throws before writing anything if any row is invalid.
 */
export async function importBackup(db: KilnDB, text: string): Promise<BackupResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Not a Kiln backup: the file is not valid JSON')
  }
  const parsed = backupSchema(Date.now()).safeParse(raw)
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
      result[name] = await mergeRows(db.table(name) as Table<Base, string>, backup.tables[name as TableName] as Base[])
    }
  })
  return result
}
