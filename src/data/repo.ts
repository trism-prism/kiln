// Repository functions: plain async functions that take the database. No React.
// Every write bumps updatedAt and sets deviceId; every read hides tombstones.
import type { Table } from 'dexie'
import type { Plan } from '../domain/plan-format'
import type { KilnDB } from './db'
import type { Base, ModuleRecord, PlanRecord, Records, SettingsRecord, TableName, TaskRecord, TaskStatus } from './types'
import { uuidv7 } from './uuid'

export const SETTINGS_ID = 'settings'

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: SETTINGS_ID,
  // updatedAt 0: never wins a sync merge against a record the user actually saved.
  updatedAt: 0,
  deleted: false,
  deviceId: '',
  minutesPerWeekday: [120, 120, 120, 120, 120, 180, 180],
  weekStartsOn: 'monday',
  reminderTime: '08:00',
  nudgeEnabled: false,
  nudgeTime: '20:00',
  theme: 'system',
  reviewCapPercent: 25,
  blackoutDates: [],
}

const deviceIds = new WeakMap<KilnDB, Promise<string>>()

/** This device's id: generated once, kept in the local-only meta table. */
export function getDeviceId(db: KilnDB): Promise<string> {
  let p = deviceIds.get(db)
  if (!p) {
    p = db
      .transaction('rw', db.meta, async () => {
        const found = await db.meta.get('deviceId')
        if (found) return found.value
        const value = uuidv7()
        await db.meta.put({ key: 'deviceId', value })
        return value
      })
      .catch((e: unknown) => {
        deviceIds.delete(db) // do not cache a failure; the next call retries
        throw e
      })
    deviceIds.set(db, p)
  }
  return p
}

const table = <N extends TableName>(db: KilnDB, name: N) => db.table(name) as Table<Records[N], string>
const live = <T extends Base>(rows: T[]): T[] => rows.filter((r) => !r.deleted)

// ---- generic writes and reads ----

/** Adds a record with a new UUIDv7 id. */
export async function insertRecord<N extends Exclude<TableName, 'settings'>>(
  db: KilnDB,
  name: N,
  fields: Omit<Records[N], keyof Base>,
): Promise<Records[N]> {
  const deviceId = await getDeviceId(db)
  const rec = { ...fields, id: uuidv7(), updatedAt: Date.now(), deleted: false, deviceId } as Records[N]
  await table(db, name).add(rec)
  return rec
}

/** Changes fields of a record. Returns the new record, or undefined (nothing written) if the record is missing or deleted. */
export async function updateRecord<N extends TableName>(
  db: KilnDB,
  name: N,
  id: string,
  patch: Partial<Omit<Records[N], keyof Base>>,
): Promise<Records[N] | undefined> {
  const deviceId = await getDeviceId(db)
  const t = table(db, name)
  return db.transaction('rw', t, async () => {
    const old = await t.get(id)
    if (!old || old.deleted) return undefined
    const next = { ...old, ...patch, updatedAt: Date.now(), deviceId }
    await t.put(next)
    return next
  })
}

/** Sets the tombstone. Does nothing to related records; see softDeletePlan. */
export async function softDelete(db: KilnDB, name: TableName, id: string): Promise<void> {
  await updateRecord(db, name, id, { deleted: true } as Partial<Records[typeof name]>)
}

/** Tombstones a plan with its modules, tasks, review cards and logs, its practice log rows and its generated daily problems. */
export async function softDeletePlan(db: KilnDB, planId: string): Promise<void> {
  const deviceId = await getDeviceId(db)
  const now = Date.now()
  const tomb = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted).map((r) => ({ ...r, deleted: true, updatedAt: now, deviceId }))
  await db.transaction('rw', [db.plans, db.modules, db.tasks, db.reviewCards, db.reviewLogs, db.practiceLog, db.practiceItems], async () => {
    const plan = await db.plans.get(planId)
    if (plan) await db.plans.put({ ...plan, deleted: true, updatedAt: now, deviceId })
    await db.modules.bulkPut(tomb(await db.modules.where('planId').equals(planId).toArray()))
    await db.tasks.bulkPut(tomb(await db.tasks.where('planId').equals(planId).toArray()))
    const cards = await db.reviewCards.where('planId').equals(planId).toArray()
    await db.reviewCards.bulkPut(tomb(cards))
    await db.reviewLogs.bulkPut(tomb(await db.reviewLogs.where('cardId').anyOf(cards.map((c) => c.id)).toArray()))
    // ponytail: practiceLog has no planId index; a scan is fine at one row per study day.
    await db.practiceLog.bulkPut(tomb(await db.practiceLog.filter((r) => r.planId === planId).toArray()))
    await db.practiceItems.bulkPut(tomb(await db.practiceItems.where('planId').equals(planId).toArray()))
  })
}

/**
 * Undo for a multi-record write: puts the earlier copies back (with a fresh updatedAt, so the undo
 * also wins a sync) and tombstones the records the write created. All or nothing.
 */
export async function revertWrite(
  db: KilnDB,
  change: { restore?: [Exclude<TableName, 'settings'>, Base][]; remove?: [Exclude<TableName, 'settings'>, string][] },
): Promise<void> {
  const restore = change.restore ?? []
  const remove = change.remove ?? []
  const deviceId = await getDeviceId(db)
  const now = Date.now()
  const names = [...new Set([...restore, ...remove].map(([n]) => n))]
  await db.transaction('rw', names.map((n) => db.table(n)), async () => {
    for (const [n, rec] of restore) await db.table(n).put({ ...rec, updatedAt: now, deviceId })
    for (const [n, id] of remove) await softDelete(db, n, id)
  })
}

// ---- reads (tombstones excluded) ----

export async function listPlans(db: KilnDB): Promise<PlanRecord[]> {
  return live(await db.plans.toArray())
}

export async function getPlan(db: KilnDB, id: string): Promise<PlanRecord | undefined> {
  const p = await db.plans.get(id)
  return p && !p.deleted ? p : undefined
}

export async function getPlanByKey(db: KilnDB, key: string): Promise<PlanRecord | undefined> {
  // Two devices can each create a plan with the same key before they sync. Pick the smallest id so
  // every device picks the same one. Merging the duplicates is a later sync decision.
  return live(await db.plans.where('key').equals(key).toArray()).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
}

export async function listModules(db: KilnDB, planId: string): Promise<ModuleRecord[]> {
  return live(await db.modules.where('planId').equals(planId).toArray()).sort((a, b) => a.order - b.order)
}

export async function listTasks(db: KilnDB, planId: string): Promise<TaskRecord[]> {
  return live(await db.tasks.where('planId').equals(planId).toArray())
}

/** Tasks scheduled from `from` to `to` inclusive ("yyyy-mm-dd"). */
export async function tasksScheduledBetween(db: KilnDB, from: string, to: string): Promise<TaskRecord[]> {
  return live(await db.tasks.where('scheduledDate').between(from, to, true, true).toArray())
}

export async function tasksByStatus(db: KilnDB, status: TaskStatus): Promise<TaskRecord[]> {
  return live(await db.tasks.where('status').equals(status).toArray())
}

/** Sets a task's status; `completedAt` is set for done and cleared otherwise. */
export function setTaskStatus(db: KilnDB, id: string, status: TaskStatus) {
  return updateRecord(db, 'tasks', id, { status, completedAt: status === 'done' ? Date.now() : undefined })
}

/** True when every part of the plan has been imported. */
export function isPlanComplete(plan: Pick<PlanRecord, 'partTotal' | 'partsIn'>): boolean {
  return Array.from({ length: plan.partTotal }, (_, i) => i + 1).every((n) => plan.partsIn.includes(n))
}

// ---- settings ----

const liveSettings = async (db: KilnDB) => {
  const s = await db.settings.get(SETTINGS_ID)
  return s && !s.deleted ? s : undefined
}

/** The saved settings, or the defaults when nothing was saved yet (or the saved row is deleted). */
export async function getSettings(db: KilnDB): Promise<SettingsRecord> {
  return (await liveSettings(db)) ?? DEFAULT_SETTINGS
}

export async function updateSettings(db: KilnDB, patch: Partial<Omit<SettingsRecord, keyof Base>>): Promise<SettingsRecord> {
  const deviceId = await getDeviceId(db)
  return db.transaction('rw', db.settings, async () => {
    const next = { ...((await liveSettings(db)) ?? DEFAULT_SETTINGS), ...patch, updatedAt: Date.now(), deviceId }
    await db.settings.put(next)
    return next
  })
}

// ---- plan import ----

export interface ImportOptions {
  /** Day 1 of the plan. Used when the plan is created; ignored when updating. */
  startDate: string
  /** Overrides the plan file's deadline. */
  deadline?: string
  /** 1-5, default 3. Used when the plan is created. */
  weight?: number
}

export interface ImportResult {
  planId: string
  created: boolean
  modulesAdded: number
  tasksAdded: number
  tasksUpdated: number
  partsIn: number[]
  complete: boolean
}

const json = (v: unknown) => JSON.stringify(v)

/**
 * Adds a validated plan file. A new plan id creates the plan; an id that matches a live plan
 * updates it: modules and tasks are matched by their file id, matched ones take the file's content
 * and keep their app state, new ones are added, nothing is removed. Records the user deleted stay
 * deleted. Part 1 creates a split plan, later parts add to it.
 */
export async function importPlan(db: KilnDB, plan: Plan, opts: ImportOptions): Promise<ImportResult> {
  const deviceId = await getDeviceId(db)
  const now = Date.now()
  const part = plan.part ?? { index: 1, total: 1 }
  const stamp = { updatedAt: now, deviceId }

  return db.transaction('rw', db.plans, db.modules, db.tasks, async () => {
    const existing = await getPlanByKey(db, plan.id)
    if (!existing && part.index !== 1) throw new Error(`Part ${part.index} of "${plan.id}" needs part 1 imported first`)

    const content = {
      title: plan.title,
      description: plan.description,
      goal: plan.goal,
      subject: plan.subject,
      level: plan.level,
      audience: plan.audience,
      schedulingMode: plan.schedulingMode,
      sources: plan.sources,
      dailyPractice: plan.dailyPractice,
    }
    const partsIn = [...new Set([...(existing?.partsIn ?? []), part.index])].sort((a, b) => a - b)
    let planRec: PlanRecord
    if (existing) {
      // Plan-level fields come from part 1 only (docs/plan-format.md, "Parts").
      planRec = {
        ...existing,
        ...(part.index === 1 ? content : {}),
        ...(opts.deadline ? { deadline: opts.deadline } : {}),
        partTotal: part.total,
        partsIn,
        ...stamp,
      }
    } else {
      planRec = {
        ...content,
        id: uuidv7(),
        key: plan.id,
        weight: opts.weight ?? 3,
        startDate: opts.startDate,
        deadline: opts.deadline ?? plan.deadline,
        partTotal: part.total,
        partsIn,
        deleted: false,
        ...stamp,
      }
    }
    await db.plans.put(planRec)
    const planId = planRec.id

    // Modules
    const oldModules = new Map((await db.modules.where('planId').equals(planId).toArray()).map((m) => [m.key, m]))
    // Only live modules: tasks of a module the user deleted are skipped below.
    const moduleIds = new Map([...oldModules].filter(([, m]) => !m.deleted).map(([k, m]) => [k, m.id]))
    let modulesAdded = 0
    for (const m of plan.modules) {
      const old = oldModules.get(m.id)
      const fields = { key: m.id, title: m.title, order: m.order, summary: m.summary, notBeforeDay: m.notBeforeDay }
      if (!old) {
        const rec: ModuleRecord = { ...fields, planId, id: uuidv7(), deleted: false, ...stamp }
        await db.modules.add(rec)
        moduleIds.set(m.id, rec.id)
        modulesAdded++
      } else if (!old.deleted) {
        const next = { ...old, ...fields }
        if (json(next) !== json(old)) await db.modules.put({ ...next, ...stamp })
      }
    }

    // Tasks
    const oldTasks = new Map((await db.tasks.where('planId').equals(planId).toArray()).map((t) => [t.key, t]))
    let tasksAdded = 0
    let tasksUpdated = 0
    for (const t of plan.tasks) {
      const moduleId = moduleIds.get(t.moduleId)
      if (!moduleId && oldModules.get(t.moduleId)?.deleted) continue
      if (!moduleId) throw new Error(`Task "${t.id}" is in module "${t.moduleId}", which is not in the plan`)
      const old = oldTasks.get(t.id)
      // Optional fields the file leaves out are cleared, not kept.
      const fields = { description: undefined, practice: undefined, notBeforeDay: undefined, fixedDate: undefined, deadline: undefined, ...t, key: t.id, moduleId } as Partial<TaskRecord>
      if (!old) {
        const rec = { ...fields, id: uuidv7(), planId, status: 'open', pinnedDate: t.fixedDate, deleted: false, ...stamp } as TaskRecord
        await db.tasks.add(rec)
        tasksAdded++
      } else if (!old.deleted) {
        const next = { ...old, ...fields, id: old.id } as TaskRecord
        if (t.fixedDate && t.fixedDate !== old.fixedDate) next.pinnedDate = t.fixedDate
        if (json(next) !== json(old)) {
          await db.tasks.put({ ...next, ...stamp })
          tasksUpdated++
        }
      }
    }

    return { planId, created: !existing, modulesAdded, tasksAdded, tasksUpdated, partsIn, complete: isPlanComplete(planRec) }
  })
}
