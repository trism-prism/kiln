// Repository functions: plain async functions that take the database. No React.
// Every write bumps updatedAt and sets deviceId; every read hides tombstones.
import type { Table } from 'dexie'
import type { Plan } from '../domain/plan-format'
import type { KilnDB } from './db'
import { localDate } from '../domain/mastery'
import { SHARE_WEIGHT } from './plan-settings'
import type { Base, EventRecord, ModuleRecord, PersonalTodoRecord, PlanRecord, Records, SettingsRecord, Share, TableName, TaskRecord, TaskStatus } from './types'
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

/**
 * The updatedAt for a write to a record last written at `prev`: the clock, but always later than
 * `prev`. Two writes in the same millisecond (or a clock that stepped back) would otherwise tie, and
 * sync, undo guards and last-write-wins all need a record's updatedAt to rise on every local write.
 */
export const stampAfter = (prev?: number): number => Math.max(Date.now(), (prev ?? 0) + 1)

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
  const rec = { ...fields, id: uuidv7(), updatedAt: stampAfter(), deleted: false, deviceId } as Records[N]
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
    const next = { ...old, ...patch, updatedAt: stampAfter(old.updatedAt), deviceId }
    await t.put(next)
    return next
  })
}

/** Sets the tombstone. Does nothing to related records; see softDeletePlan. */
export async function softDelete(db: KilnDB, name: TableName, id: string): Promise<void> {
  await updateRecord(db, name, id, { deleted: true } as Partial<Records[typeof name]>)
}

/**
 * Tombstones a plan with its modules, tasks, review cards and logs, its practice log rows, its
 * generated daily problems, its study sessions, its events and its versions (whose snapshots are emptied).
 */
export async function softDeletePlan(db: KilnDB, planId: string): Promise<void> {
  const deviceId = await getDeviceId(db)
  const tomb = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted).map((r) => ({ ...r, deleted: true, updatedAt: stampAfter(r.updatedAt), deviceId }))
  const tables = [db.plans, db.modules, db.tasks, db.reviewCards, db.reviewLogs, db.practiceLog, db.practiceItems, db.studyItems, db.events, db.planVersions]
  await db.transaction('rw', tables, async () => {
    await db.events.bulkPut(tomb(await db.events.where('planId').equals(planId).toArray()))
    await db.planVersions.bulkPut(tomb(await db.planVersions.where('planId').equals(planId).toArray()).map((v) => ({ ...v, snapshot: '' })))
    const plan = await db.plans.get(planId)
    if (plan) await db.plans.put({ ...plan, deleted: true, updatedAt: stampAfter(plan.updatedAt), deviceId })
    await db.modules.bulkPut(tomb(await db.modules.where('planId').equals(planId).toArray()))
    await db.tasks.bulkPut(tomb(await db.tasks.where('planId').equals(planId).toArray()))
    const cards = await db.reviewCards.where('planId').equals(planId).toArray()
    await db.reviewCards.bulkPut(tomb(cards))
    await db.reviewLogs.bulkPut(tomb(await db.reviewLogs.where('cardId').anyOf(cards.map((c) => c.id)).toArray()))
    // ponytail: practiceLog has no planId index; a scan is fine at one row per study day.
    await db.practiceLog.bulkPut(tomb(await db.practiceLog.filter((r) => r.planId === planId).toArray()))
    await db.practiceItems.bulkPut(tomb(await db.practiceItems.where('planId').equals(planId).toArray()))
    await db.studyItems.bulkPut(tomb(await db.studyItems.where('planId').equals(planId).toArray()))
  })
}

/**
 * Undo for a multi-record write: puts the earlier copies back (with a fresh updatedAt, so the undo
 * also wins a sync) and tombstones the records the write created. All or nothing. Each restore names
 * the `updatedAt` the write left on the record; if the record changed since (another rating, a pin,
 * a sync), nothing is undone and this returns false, so an old undo cannot overwrite newer work. A removal
 * may name an `updatedAt` too, with the same check.
 */
export async function revertWrite(
  db: KilnDB,
  change: { restore?: [Exclude<TableName, 'settings'>, Base, number][]; remove?: [Exclude<TableName, 'settings'>, string, number?][] },
): Promise<boolean> {
  const restore = change.restore ?? []
  const remove = change.remove ?? []
  const deviceId = await getDeviceId(db)
  const names = [...new Set([...restore, ...remove].map(([n]) => n))]
  return db.transaction('rw', names.map((n) => db.table(n)), async () => {
    for (const [n, rec, after] of restore) {
      const cur = (await db.table(n).get(rec.id)) as Base | undefined
      if (!cur || cur.updatedAt !== after) return false
    }
    // A removal that names the updatedAt its write left is guarded the same way.
    for (const [n, id, after] of remove) {
      if (after === undefined) continue
      const cur = (await db.table(n).get(id)) as Base | undefined
      if (!cur || cur.updatedAt !== after) return false
    }
    for (const [n, rec, after] of restore) await db.table(n).put({ ...rec, updatedAt: stampAfter(after), deviceId })
    for (const [n, id] of remove) await softDelete(db, n, id)
    return true
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

/** Sets a plan's share of study time and the matching weight (so devices before schema 4 schedule the same). */
export function setPlanShare(db: KilnDB, planId: string, share: Share) {
  return updateRecord(db, 'plans', planId, { share, weight: SHARE_WEIGHT[share] })
}

// ---- personal to-dos and events (schema 4) ----
// Add with insertRecord(db, 'personalTodos' | 'events' | 'feeds', fields), edit with updateRecord, delete with softDelete.

/** Every live personal to-do, dated ones first by date, then undated. */
export async function listPersonalTodos(db: KilnDB): Promise<PersonalTodoRecord[]> {
  const day = (t: PersonalTodoRecord) => t.date ?? '9999-12-31'
  return live(await db.personalTodos.toArray()).sort((a, b) => day(a).localeCompare(day(b)) || a.id.localeCompare(b.id))
}

/**
 * Marks a personal to-do done (stamps `completedAt` now) or open again (clears it). A logged session (minutes,
 * and completed on its own day, as "Log study time" stamps it) keeps its `completedAt` through untick and
 * re-tick, so past study stays on its day in the streak and heatmap. Any other to-do restamps, so a session
 * really done today counts today.
 */
export async function setPersonalTodoDone(db: KilnDB, id: string, done: boolean) {
  await getDeviceId(db) // resolve before the transaction opens; updateRecord reuses it
  return db.transaction('rw', db.personalTodos, async () => {
    const old = await db.personalTodos.get(id)
    const logged = !!old && (old.minutes ?? 0) > 0 && old.completedAt !== undefined && localDate(old.completedAt) === old.date
    const keep = logged ? old.completedAt : undefined
    return updateRecord(db, 'personalTodos', id, { done, completedAt: done ? (keep ?? Date.now()) : keep })
  })
}

/** Live events shown from `from` to `to` inclusive ("yyyy-mm-dd"), including multi-day ones that started earlier, by date then start. */
export async function eventsBetween(db: KilnDB, from: string, to: string): Promise<EventRecord[]> {
  // ponytail: multi-day events are found by a scan of earlier rows; fine for a term's worth of classes.
  const rows = await db.events.where('date').belowOrEqual(to).toArray()
  return live(rows)
    .filter((e) => (e.endDate ?? e.date) >= from)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
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
    const prev = await db.settings.get(SETTINGS_ID) // also a deleted row: its updatedAt must still be beaten
    const next = { ...((await liveSettings(db)) ?? DEFAULT_SETTINGS), ...patch, updatedAt: stampAfter(prev?.updatedAt), deviceId }
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
  /** Share of study time, default even. Used when the plan is created. */
  share?: Share
  /** Spaced reviews on for a new plan (off when unset). An update or a later part keeps the plan's setting. */
  reviewsOn?: boolean
  /**
   * Make the plan's modules and tasks match the file exactly (plan edits and version restores):
   * deleted ones that are in the file come back with their progress, live ones not in it are deleted.
   */
  replace?: boolean
  /** With replace: delete only these keys (modules and tasks) when the file leaves them out; others left out stay. */
  onlyRemove?: ReadonlySet<string>
  /** Apply to this plan (by record id) instead of the live plan with the file's key; two devices can create duplicates of a key. */
  planId?: string
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
  const part = plan.part ?? { index: 1, total: 1 }
  const stamp = (prev?: number) => ({ updatedAt: stampAfter(prev), deviceId })

  return db.transaction('rw', db.plans, db.modules, db.tasks, async () => {
    const existing = opts.planId ? await getPlan(db, opts.planId) : await getPlanByKey(db, plan.id)
    if (opts.planId && !existing) throw new Error('The plan is missing or deleted')
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
      studyMinutesPerWeek: plan.studyMinutesPerWeek,
    }
    // An edit or restore of a split plan is not a part: it keeps the parts already in.
    const keepParts = !!(opts.replace && existing)
    const partsIn = keepParts ? existing.partsIn : [...new Set([...(existing?.partsIn ?? []), part.index])].sort((a, b) => a - b)
    let planRec: PlanRecord
    if (existing) {
      // Plan-level fields come from part 1 only (docs/plan-format.md, "Parts").
      planRec = {
        ...existing,
        ...(part.index === 1 ? content : {}),
        ...(opts.deadline ? { deadline: opts.deadline } : {}),
        partTotal: keepParts ? existing.partTotal : part.total,
        partsIn,
        ...stamp(existing.updatedAt),
      }
    } else {
      planRec = {
        ...content,
        id: uuidv7(),
        key: plan.id,
        share: opts.share ?? 'even',
        weight: SHARE_WEIGHT[opts.share ?? 'even'],
        ...(opts.reviewsOn ? { reviewsOn: true } : {}),
        startDate: opts.startDate,
        deadline: opts.deadline ?? plan.deadline,
        partTotal: part.total,
        partsIn,
        deleted: false,
        ...stamp(),
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
        const rec: ModuleRecord = { ...fields, planId, id: uuidv7(), deleted: false, ...stamp() }
        await db.modules.add(rec)
        moduleIds.set(m.id, rec.id)
        modulesAdded++
      } else if (!old.deleted || opts.replace) {
        const next = { ...old, ...fields, deleted: false }
        if (json(next) !== json(old)) await db.modules.put({ ...next, ...stamp(old.updatedAt) })
        moduleIds.set(m.id, old.id)
      }
    }
    const notIn = <T extends { key: string; deleted: boolean }>(rows: Iterable<T>, keys: Set<string>) => [...rows].filter((r) => !r.deleted && !keys.has(r.key))
    if (opts.replace) {
      for (const m of notIn(oldModules.values(), new Set(plan.modules.map((m) => m.id))).filter((m) => !opts.onlyRemove || opts.onlyRemove.has(m.key))) {
        await db.modules.put({ ...m, deleted: true, ...stamp(m.updatedAt) })
        moduleIds.delete(m.key)
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
        const rec = { ...fields, id: uuidv7(), planId, status: 'open', pinnedDate: t.fixedDate, deleted: false, ...stamp() } as TaskRecord
        await db.tasks.add(rec)
        tasksAdded++
      } else if (!old.deleted || opts.replace) {
        const next = { ...old, ...fields, id: old.id, deleted: false } as TaskRecord
        if (t.fixedDate && t.fixedDate !== old.fixedDate) next.pinnedDate = t.fixedDate
        if (json(next) !== json(old)) {
          await db.tasks.put({ ...next, ...stamp(old.updatedAt) })
          tasksUpdated++
        }
      }
    }
    if (opts.replace) {
      for (const t of notIn(oldTasks.values(), new Set(plan.tasks.map((t) => t.id))).filter((t) => !opts.onlyRemove || opts.onlyRemove.has(t.key))) await db.tasks.put({ ...t, deleted: true, ...stamp(t.updatedAt) })
    }

    return { planId, created: !existing, modulesAdded, tasksAdded, tasksUpdated, partsIn, complete: isPlanComplete(planRec) }
  })
}
