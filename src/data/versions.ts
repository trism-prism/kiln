// Plan version history (schema 4): a snapshot of a plan's content after each edit, newest 20 kept per plan.
import { planSchema, type Plan } from '../domain/plan-format'
import { b64uDecode, b64uEncode } from '../sync/crypto'
import type { KilnDB } from './db'
import { getDeviceId, getPlan, importPlan, listModules, listTasks, stampAfter, updateRecord } from './repo'
import type { ModuleRecord, PlanRecord, PlanVersionRecord, TaskRecord } from './types'
import { uuidv7 } from './uuid'

/** Live versions kept per plan. */
export const MAX_VERSIONS = 20

/** App state on a task record that is not plan content. */
const TASK_STATE = ['id', 'key', 'planId', 'moduleId', 'scheduledDate', 'pinnedDate', 'backlog', 'status', 'completedAt', 'updatedAt', 'deleted', 'deviceId'] as const

/**
 * The plan's content as a plan file (ids are the records' keys), without app state (dates placed by
 * the scheduler, pins, status) or plan settings (share, deadline, favorite). Pass live modules and tasks.
 * Import it with importPlan to apply it by key, keeping progress.
 */
export function planFromRecords(plan: PlanRecord, modules: ModuleRecord[], tasks: TaskRecord[]): Plan {
  const moduleKey = new Map(modules.map((m) => [m.id, m.key]))
  return {
    schemaVersion: 1,
    id: plan.key,
    title: plan.title,
    description: plan.description,
    goal: plan.goal,
    subject: plan.subject,
    level: plan.level,
    audience: plan.audience,
    schedulingMode: plan.schedulingMode,
    startDate: plan.schedulingMode === 'fixed' ? plan.startDate : undefined,
    sources: plan.sources,
    dailyPractice: plan.dailyPractice,
    modules: [...modules].sort((a, b) => a.order - b.order).map((m) => ({ id: m.key, title: m.title, order: m.order, summary: m.summary, notBeforeDay: m.notBeforeDay })),
    tasks: tasks
      .filter((t) => moduleKey.has(t.moduleId))
      .map((t) => {
        const content: Record<string, unknown> = { ...t }
        for (const k of TASK_STATE) delete content[k]
        return { ...content, id: t.key, moduleId: moduleKey.get(t.moduleId) } as Plan['tasks'][number]
      }),
  }
}

async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return b64uEncode(new Uint8Array(await new Response(stream).arrayBuffer()))
}

async function gunzip(data: string): Promise<string> {
  const bytes = data ? b64uDecode(data) : null // empty: a pruned or deleted version
  if (!bytes) throw new Error('This version is damaged or no longer available')
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

/**
 * Saves the plan's current content as a new version and tombstones the oldest beyond MAX_VERSIONS
 * (emptying their snapshot so the tombstone stays small). Call after an edit has been written.
 */
// ponytail: a whole-plan snapshot per version. Compressed it fits the 64 KB sync limit for plans of a
// few hundred tasks; a much larger plan's versions stay on this device (sync lists them as tooLarge).
export async function snapshotPlan(db: KilnDB, planId: string, info: { summary: string; label?: string }): Promise<PlanVersionRecord> {
  const plan = await getPlan(db, planId)
  if (!plan) throw new Error('The plan is missing or deleted')
  const [modules, tasks] = await Promise.all([listModules(db, planId), listTasks(db, planId)])
  // Compression and the device id come before the transaction: Dexie commits across a non-Dexie await.
  const snapshot = await gzip(JSON.stringify(planFromRecords(plan, modules, tasks)))
  const deviceId = await getDeviceId(db)
  return db.transaction('rw', db.planVersions, async () => {
    const rec: PlanVersionRecord = {
      id: uuidv7(),
      planId,
      createdAt: Date.now(),
      summary: info.summary,
      ...(info.label ? { label: info.label } : {}),
      snapshot,
      updatedAt: stampAfter(),
      deleted: false,
      deviceId,
    }
    await db.planVersions.add(rec)
    const old = newestFirst(await db.planVersions.where('planId').equals(planId).toArray()).slice(MAX_VERSIONS)
    await db.planVersions.bulkPut(old.map((v) => ({ ...v, snapshot: '', deleted: true, updatedAt: stampAfter(v.updatedAt), deviceId })))
    return rec
  })
}

const newestFirst = (rows: PlanVersionRecord[]) =>
  rows.filter((v) => !v.deleted).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))

/** The plan's live versions, newest first. */
export async function listPlanVersions(db: KilnDB, planId: string): Promise<PlanVersionRecord[]> {
  return newestFirst(await db.planVersions.where('planId').equals(planId).toArray())
}

/** The plan file stored in a version. Throws if the snapshot is damaged or no longer valid. */
export async function readSnapshot(version: Pick<PlanVersionRecord, 'snapshot'>): Promise<Plan> {
  return planSchema.parse(JSON.parse(await gunzip(version.snapshot)))
}

// Key order differs between records and parsed snapshots, so keys are sorted before comparing.
const json = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** "renamed 2 tasks, added 1, reordered tasks" for one kind of item, or nothing when unchanged. */
function itemChanges<T extends { id: string; title: string; order: number }>(noun: string, before: T[], after: T[]): string[] {
  // Everything but the id, title and position, which are counted separately.
  const content = (t: T) => ({ ...t, id: undefined, title: undefined, order: undefined })
  const old = new Map(before.map((t) => [t.id, t]))
  const now = new Set(after.map((t) => t.id))
  const kept = after.filter((t) => old.has(t.id))
  const counts: [string, number][] = [
    ['renamed', kept.filter((t) => t.title !== old.get(t.id)!.title).length],
    ['added', after.length - kept.length],
    ['removed', before.filter((t) => !now.has(t.id)).length],
    ['edited', kept.filter((t) => json(content(t)) !== json(content(old.get(t.id)!))).length],
  ]
  const out = counts.filter(([, n]) => n > 0).map(([verb, n], i) => (i === 0 ? `${verb} ${plural(n, noun)}` : `${verb} ${n}`))
  const sequence = (list: T[]) => list.filter((t) => old.has(t.id) && now.has(t.id)).map((t) => t.id)
  if (json(sequence(before)) !== json(sequence(after))) out.push(`reordered ${noun}s`)
  return out
}

/** Items in plan order: modules by order, tasks by their module's order, then their own. */
function inPlanOrder(plan: Plan) {
  const modules = [...plan.modules].sort((a, b) => a.order - b.order)
  const pos = new Map(modules.map((m, i) => [m.id, i]))
  const tasks = [...plan.tasks].sort((a, b) => (pos.get(a.moduleId) ?? 0) - (pos.get(b.moduleId) ?? 0) || a.order - b.order)
  return { modules, tasks }
}

/** A version's summary, e.g. "Renamed 2 tasks, added 1". Positions (order numbers) are compared as a sequence. */
export function describeChanges(before: Plan, after: Plan): string {
  const a = inPlanOrder(before)
  const b = inPlanOrder(after)
  const parts = [
    ...(before.title !== after.title ? ['renamed the plan'] : []),
    ...(before.goal !== after.goal || before.description !== after.description ? ["edited the plan's goal or description"] : []),
    ...itemChanges('module', a.modules, b.modules),
    ...itemChanges('task', a.tasks, b.tasks),
  ]
  const text = parts.join(', ')
  return text ? text[0]!.toUpperCase() + text.slice(1) : 'No changes'
}

async function currentPlan(db: KilnDB, planId: string): Promise<{ plan: PlanRecord; content: Plan }> {
  const plan = await getPlan(db, planId)
  if (!plan) throw new Error('The plan is missing or deleted')
  return { plan, content: planFromRecords(plan, await listModules(db, planId), await listTasks(db, planId)) }
}

/**
 * Saves an edit of the plan's content (a whole plan file with the plan's key as its id). Applied by
 * key with importPlan, so progress is kept; modules and tasks left out are deleted. `pins` sets or
 * clears (undefined) the pinned day of tasks by key. Snapshots the plan before its first edit and
 * after every edit.
 */
export async function savePlanEdit(db: KilnDB, planId: string, edited: Plan, pins: Record<string, string | undefined> = {}): Promise<PlanVersionRecord> {
  const { plan, content: before } = await currentPlan(db, planId)
  if (!(await listPlanVersions(db, planId)).length) await snapshotPlan(db, planId, { summary: 'Before your first edit' })
  await importPlan(db, { ...edited, id: plan.key }, { startDate: plan.startDate, replace: true })
  for (const t of await listTasks(db, planId)) {
    if (!(t.key in pins) || pins[t.key] === t.pinnedDate) continue
    const date = pins[t.key]
    await updateRecord(db, 'tasks', t.id, date ? { pinnedDate: date, scheduledDate: date, backlog: undefined } : { pinnedDate: undefined })
  }
  return snapshotPlan(db, planId, { summary: describeChanges(before, edited) })
}

/**
 * Applies a saved version as a new version: tasks and modules deleted since come back with their
 * progress, ones added since are deleted. Snapshots carry no part info, so the plan counts as whole.
 */
export async function restoreVersion(db: KilnDB, planId: string, version: Pick<PlanVersionRecord, 'snapshot'>): Promise<PlanVersionRecord> {
  const target = await readSnapshot(version)
  const { plan, content: before } = await currentPlan(db, planId)
  await importPlan(db, { ...target, id: plan.key }, { startDate: plan.startDate, replace: true })
  return snapshotPlan(db, planId, { summary: describeChanges(before, target), label: 'Restored' })
}
