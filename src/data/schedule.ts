// Adapter between the database and the pure scheduler (src/domain/scheduler).
import { normalizeTopic } from '../domain/plan-format'
import { schedule, BACKLOG, type SchedPlan, type SchedTask, type ScheduleInput, type ScheduleOutput } from '../domain/scheduler'
import { addDaysISO } from '../lib/date'
import type { KilnDB } from './db'
import { reviewsDue } from './mastery'
import { planWeight, practiceConfig } from './plan-settings'
import { persistPractice } from './practice'
import { hasStudyPlan, persistStudy } from './study'
import { getDeviceId, getSettings, stampAfter, isPlanComplete, listModules, listPlans, listTasks } from './repo'
import type { TaskRecord } from './types'

const REVIEW_HORIZON_DAYS = 3 * 365 // the scheduler's own horizon

export interface ScheduleAllOptions {
  /** 'initial' places every open task without a date; 'reschedule' also moves overdue ones. Default 'initial'. */
  mode?: ScheduleInput['mode']
  skipOptional?: boolean
  /** Spaced reviews due per date. Default: the stored review cards (mastery.reviewsDue) from today for three years. */
  reviewsDue?: ScheduleInput['reviewsDue']
  /**
   * Place open, unpinned tasks dated after today again, as if they had no date. Used when study time plans change
   * how much of each day is free: without it the tasks keep their dates and those days simply run over.
   */
  replanFuture?: boolean
}

/**
 * Reads plans, tasks and settings, runs the scheduler for `today` ("yyyy-mm-dd") and writes the
 * results in one transaction: `scheduledDate` for placed tasks, `backlog: true` (and no date) for
 * deferred ones. Plans with missing parts are left out. Returns the scheduler's output.
 * Generated daily problems are returned and also stored (practice.ts persistPractice), so they stay stable;
 * so are study time plans' sessions (study.ts persistStudy).
 */
export async function scheduleAll(db: KilnDB, today: string, opts: ScheduleAllOptions = {}): Promise<ScheduleOutput> {
  const deviceId = await getDeviceId(db)
  // Read outside the transaction: it only touches review cards and tasks, which the transaction does not lock.
  opts = { ...opts, reviewsDue: opts.reviewsDue ?? (await reviewsDue(db, today, addDaysISO(today, REVIEW_HORIZON_DAYS))) }
  // The callback must itself be an async function: Dexie only keeps the transaction alive across native
  // awaits when it can see that, and an arrow returning run()'s promise commits after the first await.
  return db.transaction('rw', [db.plans, db.modules, db.tasks, db.practiceLog, db.practiceItems, db.settings, db.personalTodos, db.studyItems], async () => run(db, deviceId, today, opts))
}

async function run(db: KilnDB, deviceId: string, today: string, opts: ScheduleAllOptions): Promise<ScheduleOutput> {
  const settings = await getSettings(db)
  const plans = (await listPlans(db)).filter(isPlanComplete)
  const schedPlans: SchedPlan[] = []
  const records: TaskRecord[] = []
  const schedTasks: SchedTask[] = []
  for (const plan of plans) {
    const modules = new Map((await listModules(db, plan.id)).map((m) => [m.id, m]))
    const practice = practiceConfig(plan)
    schedPlans.push({
      id: plan.id,
      weight: planWeight(plan),
      startDate: plan.startDate,
      deadline: plan.deadline,
      skipOptional: plan.skipOptional,
      studyMinutesPerWeek: plan.studyMinutesPerWeek,
      dailyPractice: practice && {
        source: practice.source,
        perDay: practice.perDay ?? 1,
        startDifficulty: practice.startDifficulty ?? 'easy',
        topicFollowsLessons: practice.topicFollowsLessons ?? true,
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
        scheduledDate: opts.replanFuture && t.status === 'open' && !t.pinnedDate && t.scheduledDate && t.scheduledDate > today ? undefined : t.scheduledDate,
        inBacklog: t.backlog,
        topics: t.topics,
        practice: t.practice?.provider === 'leetcode' && t.practice.slug ? { slug: t.practice.slug, difficulty: t.practice.difficulty } : undefined,
      })
    }
  }

  const solved = (await db.practiceLog.toArray())
    .filter((r) => !r.deleted)
    .map((r) => ({ slug: r.slug, difficulty: r.difficulty, topic: r.topic === undefined ? undefined : normalizeTopic(r.topic), rating: r.rating }))

  // Dated personal to-dos with minutes take time from their day, done or not (like a done task's day).
  const fixedMinutes: Record<string, number> = {}
  for (const t of await db.personalTodos.toArray()) {
    if (!t.deleted && t.date && t.minutes) fixedMinutes[t.date] = (fixedMinutes[t.date] ?? 0) + t.minutes
  }

  const studyDone = (await db.studyItems.toArray()).filter((r) => !r.deleted && r.status === 'done').map((r) => ({ planId: r.planId, date: r.date, minutes: r.minutes }))

  const out = schedule({
    plans: schedPlans,
    tasks: schedTasks,
    minutesPerWeekday: settings.minutesPerWeekday,
    blackoutDates: settings.blackoutDates,
    reviewCapPercent: settings.reviewCapPercent,
    fixedMinutes,
    today,
    mode: opts.mode ?? 'initial',
    skipOptional: opts.skipOptional,
    reviewsDue: opts.reviewsDue,
    solved,
    weekStartsOn: settings.weekStartsOn,
    studyDone,
  })

  const changed: TaskRecord[] = []
  for (const t of records) {
    const target = out.assignments[t.id]
    if (target === undefined) continue
    const backlog = target === BACKLOG
    const next = backlog ? { ...t, scheduledDate: undefined, backlog: true } : { ...t, scheduledDate: target, backlog: undefined }
    if (next.scheduledDate !== t.scheduledDate || next.backlog !== t.backlog) changed.push({ ...next, updatedAt: stampAfter(t.updatedAt), deviceId })
  }
  await db.tasks.bulkPut(changed)
  await persistPractice(db, deviceId, today, out.practice, plans.map((p) => ({ id: p.id, generates: practiceConfig(p)?.source === 'neetcode' })), opts.mode === 'reschedule')
  await persistStudy(db, deviceId, today, out.study, plans)
  return out
}

/** Runs the scheduler when a study time plan exists, so its sessions follow a changed budget. */
export async function refreshStudy(db: KilnDB, today: string): Promise<void> {
  if (await hasStudyPlan(db)) await scheduleAll(db, today, { replanFuture: true })
}

const META_TOP_UP = 'studyTopUp'

/**
 * The scheduler only runs after writes, so a new day would have no study session. Once a day (per device), when a
 * study time plan exists, run it ('initial' never moves dated tasks) so today's session is there. Returns whether it ran.
 */
export async function topUpStudy(db: KilnDB, today: string): Promise<boolean> {
  if ((await db.meta.get(META_TOP_UP))?.value === today) return false
  if (!(await hasStudyPlan(db))) return false
  await scheduleAll(db, today)
  await db.meta.put({ key: META_TOP_UP, value: today })
  return true
}
