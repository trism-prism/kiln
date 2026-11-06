// Plan version history (schema 4): a snapshot of a plan's content after each edit, newest 20 kept per plan.
import { planSchema, type Plan } from '../domain/plan-format'
import { b64uDecode, b64uEncode } from '../sync/crypto'
import type { KilnDB } from './db'
import { getDeviceId, getPlan, listModules, listTasks, stampAfter } from './repo'
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
  const bytes = b64uDecode(data)
  if (!bytes) throw new Error('This version is damaged')
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
