// Adapter between the database and the pure scheduler (src/domain/scheduler).
import { normalizeTopic } from '../domain/plan-format'
import { schedule, BACKLOG, type SchedPlan, type SchedTask, type ScheduleInput, type ScheduleOutput } from '../domain/scheduler'
import { addDaysISO } from '../lib/date'
import type { KilnDB } from './db'
import { reviewsDue } from './mastery'
import { getDeviceId, getSettings, isPlanComplete, listModules, listPlans, listTasks } from './repo'
import type { TaskRecord } from './types'

const REVIEW_HORIZON_DAYS = 3 * 365 // the scheduler's own horizon

export interface ScheduleAllOptions {
  /** 'initial' places every open task without a date; 'reschedule' also moves overdue ones. Default 'initial'. */
  mode?: ScheduleInput['mode']
  skipOptional?: boolean
  /** Spaced reviews due per date. Default: the stored review cards (mastery.reviewsDue) from today for three years. */
  reviewsDue?: ScheduleInput['reviewsDue']
}

/**
 * Reads plans, tasks and settings, runs the scheduler for `today` ("yyyy-mm-dd") and writes the
 * results in one transaction: `scheduledDate` for placed tasks, `backlog: true` (and no date) for
 * deferred ones. Plans with missing parts are left out. Returns the scheduler's output.
 * Generated daily problems are returned, not stored.
 */
export async function scheduleAll(db: KilnDB, today: string, opts: ScheduleAllOptions = {}): Promise<ScheduleOutput> {
  const deviceId = await getDeviceId(db)
  // Read outside the transaction: it only touches review cards and tasks, which the transaction does not lock.
  opts = { ...opts, reviewsDue: opts.reviewsDue ?? (await reviewsDue(db, today, addDaysISO(today, REVIEW_HORIZON_DAYS))) }
  // The callback must itself be an async function: Dexie only keeps the transaction alive across native
  // awaits when it can see that, and an arrow returning run()'s promise commits after the first await.
  return db.transaction('rw', [db.plans, db.modules, db.tasks, db.practiceLog, db.settings], async () => run(db, deviceId, today, opts))
}

async function run(db: KilnDB, deviceId: string, today: string, opts: ScheduleAllOptions): Promise<ScheduleOutput> {
  const settings = await getSettings(db)
  const plans = (await listPlans(db)).filter(isPlanComplete)
  const schedPlans: SchedPlan[] = []
  const records: TaskRecord[] = []
  const schedTasks: SchedTask[] = []
  for (const plan of plans) {
    const modules = new Map((await listModules(db, plan.id)).map((m) => [m.id, m]))
    schedPlans.push({
      id: plan.id,
      weight: plan.weight,
      startDate: plan.startDate,
      deadline: plan.deadline,
      dailyPractice: plan.dailyPractice && {
        source: plan.dailyPractice.source,
        perDay: plan.dailyPractice.perDay ?? 1,
        startDifficulty: plan.dailyPractice.startDifficulty ?? 'easy',
        topicFollowsLessons: plan.dailyPractice.topicFollowsLessons ?? true,
      },
    })
    for (const t of await listTasks(db, plan.id)) {
      const mod = modules.get(t.moduleId)
      if (!mod) continue
      records.push(t)
      const notBefore = Math.max(t.notBeforeDay ?? 0, mod.notBeforeDay ?? 0)
      schedTasks.push({
        id: t.id,
        planId: plan.id,
        key: t.key,
        moduleOrder: mod.order,
        taskOrder: t.order,
        estimatedMinutes: t.estimatedMinutes,
        priority: t.priority,
        type: t.type,
        dependsOn: t.dependsOn,
        notBeforeDay: notBefore > 0 ? notBefore : undefined,
        pinnedDate: t.pinnedDate,
        deadline: t.deadline,
        status: t.status,
        scheduledDate: t.scheduledDate,
        inBacklog: t.backlog,
        topics: t.topics,
        practice: t.practice?.provider === 'leetcode' && t.practice.slug ? { slug: t.practice.slug, difficulty: t.practice.difficulty } : undefined,
      })
    }
  }

  const solved = (await db.practiceLog.toArray())
    .filter((r) => !r.deleted)
    .map((r) => ({ slug: r.slug, difficulty: r.difficulty, topic: r.topic === undefined ? undefined : normalizeTopic(r.topic), rating: r.rating }))

  const out = schedule({
    plans: schedPlans,
    tasks: schedTasks,
    minutesPerWeekday: settings.minutesPerWeekday,
    blackoutDates: settings.blackoutDates,
    reviewCapPercent: settings.reviewCapPercent,
    today,
    mode: opts.mode ?? 'initial',
    skipOptional: opts.skipOptional,
    reviewsDue: opts.reviewsDue,
    solved,
  })

  const now = Date.now()
  const changed: TaskRecord[] = []
  for (const t of records) {
    const target = out.assignments[t.id]
    if (target === undefined) continue
    const backlog = target === BACKLOG
    const next = backlog ? { ...t, scheduledDate: undefined, backlog: true } : { ...t, scheduledDate: target, backlog: undefined }
    if (next.scheduledDate !== t.scheduledDate || next.backlog !== t.backlog) changed.push({ ...next, updatedAt: now, deviceId })
  }
  await db.tasks.bulkPut(changed)
  return out
}
