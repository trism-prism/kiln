// The scheduler: a pure, deterministic function. See docs/plan-format.md ("How the scheduler uses a plan").
// Rules this file adds where the spec is silent are marked "Rule:" and covered by tests.
import { addDaysISO, weekdayIndex } from '../../lib/date'
import { NEETCODE_TOPICS, normalizeTopic } from '../plan-format'
import { NEETCODE_POOL, PRACTICE_MINUTES, pickProblem, roadmapTopic, targetDifficulty, type Solved } from '../practice'
import { studySessions } from './study'
import {
  BACKLOG,
  type DayLoad,
  type GeneratedPractice,
  type GeneratedStudy,
  type SchedPlan,
  type SchedTask,
  type ScheduleInput,
  type ScheduleOutput,
  type Violation,
} from './types'

/** Rule: scheduling gives up this many days after the first day. */
const HORIZON_DAYS = 3 * 365
const FINAL_DAYS = 14

interface Ctx {
  input: ScheduleInput
  plans: SchedPlan[]
  tasks: SchedTask[]
  byKey: Map<string, SchedTask>
  /** Position in plan order (module order, then task order) within the plan. */
  orderIndex: Map<string, number>
  /** First date a task may be placed: plan start or its notBeforeDay, whichever is later. */
  earliest: Map<string, string>
  /** Open tasks that keep a date: pinned, or already scheduled. */
  fixed: Map<string, string>
  /** Open tasks that start in the backlog. */
  baseBacklog: Set<string>
  /** Open tasks this run places. */
  pending: SchedTask[]
  blackout: Set<string>
  start: string
  /** Study sessions (study.ts), computed once: the deadline search runs place() many times. */
  study: GeneratedStudy[]
}

const keyOf = (planId: string, key: string) => `${planId}|${key}`

function buildCtx(input: ScheduleInput): Ctx {
  const planIds = new Set(input.plans.map((p) => p.id))
  const plans = [...input.plans].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const tasks = input.tasks.filter((t) => planIds.has(t.planId))
  const byKey = new Map(tasks.map((t) => [keyOf(t.planId, t.key), t]))
  const planStart = new Map(plans.map((p) => [p.id, p.startDate]))

  const orderIndex = new Map<string, number>()
  for (const p of plans) {
    tasks
      .filter((t) => t.planId === p.id)
      .sort((a, b) => a.moduleOrder - b.moduleOrder || a.taskOrder - b.taskOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .forEach((t, i) => orderIndex.set(t.id, i))
  }

  const earliest = new Map<string, string>()
  for (const t of tasks) {
    const start = planStart.get(t.planId) as string
    earliest.set(t.id, t.notBeforeDay && t.notBeforeDay > 1 ? addDaysISO(start, t.notBeforeDay - 1) : start)
  }

  const fixed = new Map<string, string>()
  const baseBacklog = new Set<string>()
  const skipPlans = new Set(input.plans.filter((p) => p.skipOptional).map((p) => p.id))
  const pending: SchedTask[] = []
  for (const t of tasks) {
    if (t.status !== 'open') continue
    const overdue = input.mode === 'reschedule' && t.scheduledDate !== undefined && t.scheduledDate < input.today
    if ((input.skipOptional || skipPlans.has(t.planId)) && t.priority === 'optional' && !t.pinnedDate) baseBacklog.add(t.id)
    else if (t.pinnedDate) fixed.set(t.id, t.pinnedDate)
    else if (t.inBacklog && input.mode === 'reschedule') baseBacklog.add(t.id)
    else if (t.scheduledDate && !overdue) fixed.set(t.id, t.scheduledDate)
    else pending.push(t)
  }
  pending.sort((a, b) => a.planId.localeCompare(b.planId) || (orderIndex.get(a.id) as number) - (orderIndex.get(b.id) as number))

  // Rule: the first day is the later of today and the earliest start date of a plan that has work to place.
  const planStarts = pending.map((t) => planStart.get(t.planId) as string).sort()
  const first = planStarts[0] ?? input.today
  const start = first > input.today ? first : input.today
  return { input, plans, tasks, byKey, orderIndex, earliest, fixed, baseBacklog, pending, blackout: new Set(input.blackoutDates), start, study: studySessions(input) }
}

const budgetOn = (ctx: Ctx, date: string) => (ctx.blackout.has(date) ? 0 : (ctx.input.minutesPerWeekday[weekdayIndex(date)] ?? 0))

interface DayAcc {
  review: number
  practice: number
  tasks: number
  taskCount: number
  /** Study sessions of study time plans (not tasks: they do not count for the first-task rule). */
  study: number
  /** Practice problems already on the day, per plan (counts toward perDay). */
  practiceCount: Map<string, number>
}

interface Result {
  date: Map<string, string>
  backlog: Set<string>
  placed: Set<string>
  practice: GeneratedPractice[]
  acc: Map<string, DayAcc>
  stuck: SchedTask[]
  left: SchedTask[]
}

/** The first NeetCode topic among a task's topics. */
function neetcodeTopic(topics: string[]): string | undefined {
  return topics.map(normalizeTopic).find((t) => (NEETCODE_TOPICS as readonly string[]).includes(t))
}

/** One placement pass. `deferred` are tasks already sent to the backlog by the deadline step. */
function place(ctx: Ctx, deferred: ReadonlySet<string>): Result {
  const { input } = ctx
  const pool = input.pool ?? NEETCODE_POOL
  const capPercent = input.reviewCapPercent ?? 25
  const date = new Map(ctx.fixed)
  const backlog = new Set([...ctx.baseBacklog, ...deferred])
  const acc = new Map<string, DayAcc>()
  const getAcc = (d: string): DayAcc => {
    let a = acc.get(d)
    if (!a) acc.set(d, (a = { review: 0, practice: 0, tasks: 0, taskCount: 0, study: 0, practiceCount: new Map() }))
    return a
  }

  // Load that is already there: tasks that keep a date, and work done today or later.
  const preload = (t: SchedTask, d: string) => {
    if (d < input.today) return
    const a = getAcc(d)
    a.tasks += t.estimatedMinutes
    a.taskCount++
    if (t.practice) a.practiceCount.set(t.planId, (a.practiceCount.get(t.planId) ?? 0) + 1)
  }
  for (const t of ctx.tasks) {
    if (t.status === 'open') {
      const d = ctx.fixed.get(t.id)
      if (d) preload(t, d)
    } else if (t.status === 'done' && t.scheduledDate) preload(t, t.scheduledDate)
  }
  // Personal to-dos with a date and minutes: fixed load, like a pinned task.
  for (const [d, minutes] of Object.entries(input.fixedMinutes ?? {})) {
    if (d < input.today || minutes <= 0) continue
    const a = getAcc(d)
    a.tasks += minutes
    a.taskCount++
  }
  // Study sessions are reserved first on their day. Rule: they leave taskCount alone, so the day's first task
  // still always fits (a day full of study would otherwise keep a long task out for good).
  for (const s of ctx.study) if (s.date >= input.today) getAcc(s.date).study += s.minutes

  const openDeps = (t: SchedTask) =>
    t.dependsOn.map((k) => ctx.byKey.get(keyOf(t.planId, k))).filter((d): d is SchedTask => d !== undefined && d.status === 'open')

  // Rule: a non-core task that depends on a backlog task goes to the backlog with it.
  let pend = ctx.pending.filter((t) => !backlog.has(t.id))
  for (let changed = true; changed; ) {
    changed = false
    for (const t of pend) {
      if (!backlog.has(t.id) && t.priority !== 'core' && openDeps(t).some((d) => backlog.has(d.id))) {
        backlog.add(t.id)
        changed = true
      }
    }
  }
  pend = pend.filter((t) => !backlog.has(t.id))
  // Tasks whose dependencies can never be met (a core task behind a backlog task, a cycle) are stuck.
  const resolved = new Set(ctx.fixed.keys())
  for (let changed = true; changed; ) {
    changed = false
    for (const t of pend) {
      if (!resolved.has(t.id) && openDeps(t).every((d) => resolved.has(d.id))) {
        resolved.add(t.id)
        changed = true
      }
    }
  }
  const stuck = pend.filter((t) => !resolved.has(t.id))
  pend = pend.filter((t) => resolved.has(t.id))

  // Tasks that cannot start within the horizon are unplaceable at once; looping to the end would not help.
  const end = addDaysISO(ctx.start, HORIZON_DAYS)
  const beyond = pend.filter((t) => (ctx.earliest.get(t.id) as string) > end)
  pend = pend.filter((t) => (ctx.earliest.get(t.id) as string) <= end)

  const queue = new Map<string, SchedTask[]>(ctx.plans.map((p) => [p.id, pend.filter((t) => t.planId === p.id)]))
  const planLeft = new Map<string, number>(ctx.plans.map((p) => [p.id, (queue.get(p.id) as SchedTask[]).length]))
  const placed = new Set<string>()
  const generated: GeneratedPractice[] = []
  const minutesPlaced = new Map<string, number>(ctx.plans.map((p) => [p.id, 0]))
  let remaining = pend.length

  // The ramp assumes every problem scheduled in this run gets rated Good.
  const solved: Solved[] = [...(input.solved ?? [])]
  const excluded = new Set<string>(solved.map((s) => s.slug))
  for (const t of ctx.tasks) if (t.practice) excluded.add(t.practice.slug)

  // Rule: "the most recent scheduled lesson" is the latest-dated lesson that has been reached, counting
  // lessons that keep a date and lessons placed earlier in this run. Only NeetCode topics count.
  const lessonTopic = new Map<string, string>()
  const fixedLessons = new Map<string, { date: string; order: number; topic: string }[]>()
  for (const t of ctx.tasks) {
    const d = t.status === 'open' ? ctx.fixed.get(t.id) : t.status === 'done' ? t.scheduledDate : undefined
    const topic = neetcodeTopic(t.topics)
    if (t.type === 'lesson' && d && topic) fixedLessons.set(t.planId, [...(fixedLessons.get(t.planId) ?? []), { date: d, order: ctx.orderIndex.get(t.id) as number, topic }])
  }
  for (const list of fixedLessons.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))
  const lessonPtr = new Map<string, number>()

  for (let d = ctx.start; d <= end && remaining > 0; d = addDaysISO(d, 1)) {
    for (const p of ctx.plans) {
      const list = fixedLessons.get(p.id) ?? []
      let i = lessonPtr.get(p.id) ?? 0
      while (i < list.length && (list[i] as { date: string }).date <= d) lessonTopic.set(p.id, (list[i++] as { topic: string }).topic)
      lessonPtr.set(p.id, i)
    }
    const budget = budgetOn(ctx, d)
    if (budget === 0) continue
    const a = getAcc(d)
    let room = budget - a.tasks - a.study

    // Spaced reviews, capped. Stage 5 supplies the due minutes.
    const due = input.reviewsDue?.[d]?.minutes ?? 0
    a.review = Math.max(0, Math.min(due, Math.floor((budget * capPercent) / 100), room))
    room -= a.review

    // Tasks whose dependencies are met on an earlier day and whose notBeforeDay is reached, in plan order.
    const depsMet = (t: SchedTask) =>
      t.dependsOn.every((k) => {
        const dep = ctx.byKey.get(keyOf(t.planId, k))
        if (!dep || dep.status !== 'open') return true
        const when = date.get(dep.id)
        return when !== undefined && when < d
      })
    const ready = new Map<string, SchedTask[]>()
    for (const p of ctx.plans) {
      ready.set(p.id, (queue.get(p.id) as SchedTask[]).filter((t) => d >= (ctx.earliest.get(t.id) as string) && depsMet(t)))
    }
    const taken = new Set<string>()
    /** Per plan: where the scan for the next task stands, and the module of the first task that did not fit. */
    const cursor = new Map<string, { i: number; blocked?: number }>(ctx.plans.map((p) => [p.id, { i: 0 }]))

    const put = (t: SchedTask) => {
      date.set(t.id, d)
      placed.add(t.id)
      remaining--
      planLeft.set(t.planId, (planLeft.get(t.planId) as number) - 1)
      a.tasks += t.estimatedMinutes
      a.taskCount++
      room -= t.estimatedMinutes
      minutesPlaced.set(t.planId, (minutesPlaced.get(t.planId) ?? 0) + t.estimatedMinutes)
      taken.add(t.id)
      const topic = neetcodeTopic(t.topics)
      if (t.type === 'lesson' && topic) lessonTopic.set(t.planId, topic)
      if (t.practice) solved.push({ slug: t.practice.slug, difficulty: t.practice.difficulty, topic, rating: 3 })
    }

    // Rule: a task fits if it fits the room left. The first task of a day always fits, whatever its size: the
    // budget is a target, and without this a long task (a 150-minute mock interview) would wait forever behind
    // reviews and the practice slot. A day can therefore run over its budget; the overrun is that first task.
    const fits = (t: SchedTask) => t.estimatedMinutes === 0 || t.estimatedMinutes <= room || a.taskCount === 0

    // Daily practice slot: the plan's own problems first, then generated NeetCode ones.
    for (const p of ctx.plans) {
      const dp = p.dailyPractice
      if (!dp || d < p.startDate) continue
      let need = dp.perDay - (a.practiceCount.get(p.id) ?? 0)
      // Rule: the slot obeys the same module block as step 4 below: once a ready task does not fit the room,
      // plan problems of later modules cannot jump past it.
      let blocked: number | undefined
      for (const t of ready.get(p.id) as SchedTask[]) {
        if (need === 0 || taken.has(t.id)) continue
        if (blocked !== undefined && t.moduleOrder !== blocked) break
        if (t.practice && t.estimatedMinutes <= room) {
          put(t)
          need--
        } else if (!fits(t)) blocked ??= t.moduleOrder
      }
      // Rule: no generated problems after the plan's deadline, or once the plan has nothing left to place.
      while (dp.source === 'neetcode' && need > 0 && (planLeft.get(p.id) as number) > 0 && (p.deadline === undefined || d <= p.deadline)) {
        const follow = dp.topicFollowsLessons ? lessonTopic.get(p.id) : undefined
        const topic = follow ?? roadmapTopic(pool, excluded)
        const inFinalDays = p.deadline !== undefined && d >= addDaysISO(p.deadline, 1 - FINAL_DAYS)
        const target = targetDifficulty({ startDifficulty: dp.startDifficulty, solved, topic, inFinalDays })
        const prob = pickProblem(pool, excluded, topic, target)
        if (!prob || PRACTICE_MINUTES[prob.difficulty] > room) break
        const minutes = PRACTICE_MINUTES[prob.difficulty]
        generated.push({ date: d, planId: p.id, slug: prob.slug, title: prob.title, difficulty: prob.difficulty, topic: prob.topic, minutes })
        a.practice += minutes
        room -= minutes
        excluded.add(prob.slug)
        solved.push({ slug: prob.slug, difficulty: prob.difficulty, topic: prob.topic, rating: 3 })
        need--
      }
    }

    // Ready tasks in plan order, plans interleaved by weight.
    // Rule: when a plan's next task does not fit, later ready tasks of the same module may fill the room
    // in plan order, but tasks of later modules never jump past it.
    // Room only shrinks during a day, so a task that did not fit never will: the cursor never goes back.
    const next = (p: SchedPlan): SchedTask | undefined => {
      const list = ready.get(p.id) as SchedTask[]
      const c = cursor.get(p.id) as { i: number; blocked?: number }
      for (; c.i < list.length; c.i++) {
        const t = list[c.i] as SchedTask
        if (taken.has(t.id)) continue
        if (c.blocked !== undefined && t.moduleOrder !== c.blocked) {
          c.i = list.length
          return undefined
        }
        if (fits(t)) return t
        c.blocked ??= t.moduleOrder
      }
      return undefined
    }
    // Rule: the plan with the fewest placed minutes per weight goes next; ties go to the lower plan id.
    for (;;) {
      let best: { p: SchedPlan; t: SchedTask } | undefined
      for (const p of ctx.plans) {
        const t = next(p)
        if (!t) continue
        if (!best || (minutesPlaced.get(p.id) as number) * best.p.weight < (minutesPlaced.get(best.p.id) as number) * p.weight) best = { p, t }
      }
      if (!best) break
      put(best.t)
    }
    for (const p of ctx.plans) queue.set(p.id, (queue.get(p.id) as SchedTask[]).filter((t) => !placed.has(t.id)))
  }

  const left = [...pend.filter((t) => !placed.has(t.id)), ...beyond]
  return { date, backlog, placed, practice: generated, acc, stuck, left }
}

function violationsOf(ctx: Ctx, r: Result): Violation[] {
  const out: Violation[] = []
  const finish = new Map<string, string>()
  for (const t of ctx.tasks) {
    const d = t.status === 'open' ? r.date.get(t.id) : undefined
    if (!d) continue
    if (d > (finish.get(t.planId) ?? '')) finish.set(t.planId, d)
    if (t.deadline && d > t.deadline) out.push({ kind: 'task-deadline', planId: t.planId, taskId: t.id, deadline: t.deadline, date: d })
    // Pinned and kept tasks are not placed after their dependencies, so check them.
    if (ctx.fixed.has(t.id)) {
      for (const k of t.dependsOn) {
        const dep = ctx.byKey.get(keyOf(t.planId, k))
        if (!dep || dep.status !== 'open') continue
        const when = r.date.get(dep.id)
        const reason = r.backlog.has(dep.id) ? 'backlog' : when === undefined ? 'unscheduled' : when >= d ? 'not-earlier' : undefined
        if (reason) out.push({ kind: 'dependency', planId: t.planId, taskId: t.id, dependsOnId: dep.id, reason })
      }
    }
  }
  for (const p of ctx.plans) {
    const f = finish.get(p.id)
    if (p.deadline && f && f > p.deadline) out.push({ kind: 'plan-deadline', planId: p.id, deadline: p.deadline, projectedFinish: f })
  }
  return out
}

/**
 * Deadline step. For each plan that misses a deadline, send tasks to the backlog until it is met: optional
 * tasks first, then recommended, latest in plan order first, never core. Rule: the number of tasks to defer
 * is found by binary search, which assumes deferring more never finishes later. The cut it finds is valid
 * but, because placement interacts with dependencies and fill, not guaranteed to be the smallest. A plan
 * that cannot be fixed this way (or where deferring would strand a core task) keeps all its tasks and the
 * miss is reported. Rule: when only task deadlines
 * are missed, only tasks up to the latest missed task in plan order are candidates, since later ones
 * cannot help.
 */
function withDeferral(ctx: Ctx): Result {
  const deferred = new Set<string>()
  let res = place(ctx, deferred)
  const stuckBefore = new Set(res.stuck.map((t) => t.id))
  for (let round = 0; round <= ctx.plans.length; round++) {
    let progressed = false
    for (const p of ctx.plans) {
      const missed = violationsOf(ctx, res).filter((v) => v.planId === p.id && v.kind !== 'dependency')
      if (missed.length === 0) continue
      const planMissed = missed.some((v) => v.kind === 'plan-deadline')
      const lastMissed = Math.max(...missed.flatMap((v) => (v.kind === 'task-deadline' ? [ctx.orderIndex.get(v.taskId) as number] : [])))
      const deferrable = ctx.tasks
        .filter((t) => t.planId === p.id && res.placed.has(t.id) && t.priority !== 'core' && (planMissed || (ctx.orderIndex.get(t.id) as number) <= lastMissed))
        .sort((a, b) => Number(b.priority === 'optional') - Number(a.priority === 'optional') || (ctx.orderIndex.get(b.id) as number) - (ctx.orderIndex.get(a.id) as number))
      const fixedBy = (k: number) => {
        const r = place(ctx, new Set([...deferred, ...deferrable.slice(0, k).map((t) => t.id)]))
        // Deferring must not strand a core task of the plan behind a deferred one.
        if (r.stuck.some((t) => t.planId === p.id && t.priority === 'core' && !stuckBefore.has(t.id))) return false
        return violationsOf(ctx, r).every((v) => v.planId !== p.id || v.kind === 'dependency')
      }
      if (deferrable.length === 0 || !fixedBy(deferrable.length)) continue
      let lo = 1
      let hi = deferrable.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (fixedBy(mid)) hi = mid
        else lo = mid + 1
      }
      deferrable.slice(0, lo).forEach((t) => deferred.add(t.id))
      res = place(ctx, deferred)
      progressed = true
    }
    if (!progressed) break
  }
  return res
}

/** Places open tasks on days. Pure and deterministic: the same input gives the same output. */
export function schedule(input: ScheduleInput): ScheduleOutput {
  const ctx = buildCtx(input)
  const res = withDeferral(ctx)

  const assignments: Record<string, string> = {}
  for (const t of ctx.tasks) {
    if (t.status !== 'open') continue
    const d = res.date.get(t.id)
    if (res.backlog.has(t.id)) assignments[t.id] = BACKLOG
    else if (d) assignments[t.id] = d
  }
  const projectedFinish: Record<string, string> = {}
  for (const t of ctx.tasks) {
    const d = t.status === 'open' ? res.date.get(t.id) : undefined
    if (d && !res.backlog.has(t.id) && d > (projectedFinish[t.planId] ?? '')) projectedFinish[t.planId] = d
  }
  const days: DayLoad[] = [...res.acc.entries()]
    .filter(([, a]) => a.review + a.practice + a.tasks + a.study > 0)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([d, a]) => ({ date: d, budget: budgetOn(ctx, d), reviewMinutes: a.review, practiceMinutes: a.practice, taskMinutes: a.tasks, studyMinutes: a.study }))
  return {
    assignments,
    practice: res.practice,
    study: ctx.study,
    days,
    projectedFinish,
    violations: violationsOf(ctx, res),
    unplaceable: [
      ...res.stuck.map((t) => ({ taskId: t.id, reason: 'blocked' as const })),
      ...res.left.map((t) => ({ taskId: t.id, reason: 'no-capacity' as const })),
    ],
  }
}
