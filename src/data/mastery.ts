// Mastery in the database: completing a task creates or rates its review card; queries for the
// due list, mastery % and brush-up. FSRS maths lives in domain/mastery.
import {
  brushUp as brushUpCards,
  cardMinutes,
  endOfLocalDay,
  masteryByPlan as planMastery,
  masteryByTopic as topicMastery,
  newCard,
  rate,
  reviewsDue as bucketReviews,
  type BrushUpItem,
  type MasteryStat,
  type RatingName,
  type ReviewsDue,
  type SchedulerOptions,
} from '../domain/mastery'
import type { KilnDB } from './db'
import { practiceLanguage, practiceOn, reviewsOn } from './plan-settings'
import { getDeviceId, insertRecord, revertWrite, setTaskStatus, updateRecord } from './repo'
import type { ReviewCardRecord, ReviewLogRecord, TaskRecord } from './types'

/** The app spreads review dates with fuzz; tests pass `{ fuzz: false }`. */
const APP_OPTS: SchedulerOptions = { fuzz: true }

/** The task's card. If two devices each made one before syncing, the smallest id wins everywhere. */
export async function liveCardForTask(db: KilnDB, taskId: string): Promise<ReviewCardRecord | undefined> {
  return (await db.reviewCards.where('taskId').equals(taskId).toArray()).filter((c) => !c.deleted).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
}

async function logReview(db: KilnDB, cardId: string, log: ReturnType<typeof rate>['log']): Promise<ReviewLogRecord> {
  return insertRecord(db, 'reviewLogs', { cardId, ...log })
}

export interface CompleteResult {
  task: TaskRecord
  /** Undefined when the task type gets no review card (see cardMinutes). */
  card?: ReviewCardRecord
  log?: ReviewLogRecord
  /** Puts everything back as it was before this call (task state, card, review log). False, and nothing changes, if a record was changed since. */
  undo: () => Promise<boolean>
}

/**
 * Marks the task done and records how well it went. First completion of a task that gets a card
 * (cardMinutes) creates the card and rates it; completing again rates the existing card. Tasks
 * without a card (reviews, projects, milestones) are only marked done and the rating is ignored.
 * Cards are made whatever the plan's reviews setting: with reviews off they stay hidden (liveCards)
 * and appear when reviews are switched on, so finished lessons are never lost.
 * Everything runs in one transaction, so it is all-or-nothing and two overlapping calls for one new
 * task produce exactly one card. A suspended card (skipped task) is resumed.
 */
export async function completeTask(
  db: KilnDB,
  taskId: string,
  rating: RatingName,
  now: number,
  opts: SchedulerOptions = APP_OPTS,
): Promise<CompleteResult> {
  await getDeviceId(db) // resolve before the transaction opens; the writes below reuse it
  // The callback must be an async function: Dexie keeps the transaction open across native awaits only then.
  return db.transaction('rw', db.tasks, db.reviewCards, db.reviewLogs, async () => {
    const before = await db.tasks.get(taskId)
    const task = await setTaskStatus(db, taskId, 'done')
    if (!task || !before) throw new Error(`Task ${taskId} not found`)
    const restoreTask: ['tasks', TaskRecord, number] = ['tasks', before, task.updatedAt]
    const minutes = cardMinutes(task)
    if (minutes === undefined) return { task, undo: () => revertWrite(db, { restore: [restoreTask] }) }

    const existing = await liveCardForTask(db, taskId)
    const { card, log } = rate(existing ?? newCard(now), rating, now, opts)
    let rec: ReviewCardRecord
    if (existing) {
      rec = (await updateRecord(db, 'reviewCards', existing.id, { ...card, suspended: false }))!
    } else {
      rec = await insertRecord(db, 'reviewCards', {
        ...card,
        planId: task.planId,
        taskId,
        slug: task.practice?.provider === 'leetcode' ? task.practice.slug : undefined,
        topics: task.topics,
        minutes,
      })
    }
    const logRec = await logReview(db, rec.id, log)
    const undo = () =>
      revertWrite(db, {
        restore: existing ? [restoreTask, ['reviewCards', existing, rec.updatedAt]] : [restoreTask],
        remove: existing ? [['reviewLogs', logRec.id]] : [['reviewLogs', logRec.id], ['reviewCards', rec.id]],
      })
    return { task, card: rec, log: logRec, undo }
  })
}

/** Rates a review of an existing card (a due review, or a brush-up). Atomic. */
export async function reviewCard(
  db: KilnDB,
  cardId: string,
  rating: RatingName,
  now: number,
  opts: SchedulerOptions = APP_OPTS,
): Promise<{ card: ReviewCardRecord; log: ReviewLogRecord; undo: () => Promise<boolean> }> {
  await getDeviceId(db)
  return db.transaction('rw', db.plans, db.reviewCards, db.reviewLogs, async () => {
    const old = await db.reviewCards.get(cardId)
    if (!old || old.deleted) throw new Error(`Review card ${cardId} not found`)
    // A list drawn before reviews were switched off can still offer this card.
    const plan = await db.plans.get(old.planId)
    if (!plan || plan.deleted || !reviewsOn(plan)) throw new Error('Reviews are off for this plan')
    const { card, log } = rate(old, rating, now, opts)
    const rec = (await updateRecord(db, 'reviewCards', cardId, card))!
    const logRec = await logReview(db, cardId, log)
    return { card: rec, log: logRec, undo: () => revertWrite(db, { restore: [['reviewCards', old, rec.updatedAt]], remove: [['reviewLogs', logRec.id]] }) }
  })
}

/**
 * Skips a task and suspends its card, so it is no longer due and drops out of the due list,
 * reviewsDue and brush-up. Reopening it (unskipTask) or completing it again resumes the card.
 */
export async function skipTask(db: KilnDB, taskId: string): Promise<TaskRecord> {
  return setSkipped(db, taskId, true)
}

/** Reopens a skipped task and resumes its card. A task that had been completed goes back to done (completedAt kept), any other to open. */
export async function unskipTask(db: KilnDB, taskId: string): Promise<TaskRecord> {
  return setSkipped(db, taskId, false)
}

async function setSkipped(db: KilnDB, taskId: string, skipped: boolean): Promise<TaskRecord> {
  await getDeviceId(db)
  return db.transaction('rw', db.tasks, db.reviewCards, async () => {
    const old = await db.tasks.get(taskId)
    if (!old || old.deleted) throw new Error(`Task ${taskId} not found`)
    const card = await liveCardForTask(db, taskId)
    // Not setTaskStatus: it clears completedAt for anything but done.
    const status = skipped ? 'skipped' : card || old.completedAt ? 'done' : 'open'
    const task = (await updateRecord(db, 'tasks', taskId, { status }))!
    if (card && !!card.suspended !== skipped) await updateRecord(db, 'reviewCards', card.id, { suspended: skipped })
    return task
  })
}

// ---- queries (tombstones and suspended cards excluded; cards of deleted tasks are ignored) ----

async function liveTasks(db: KilnDB): Promise<Map<string, TaskRecord>> {
  return new Map((await db.tasks.toArray()).filter((t) => !t.deleted).map((t) => [t.id, t]))
}

/**
 * The cards every query uses: not deleted, task alive, one per task (the smallest id, because two
 * devices can each create a card before they sync), then not suspended. Rows synced from a version 1
 * device may lack `minutes` and `learningSteps`; minutes are filled from the task.
 */
async function liveCards(db: KilnDB, tasks: Map<string, TaskRecord>): Promise<ReviewCardRecord[]> {
  // Cards for generated daily problems (a slug, no task) belong to a plan's daily practice: none while it is off.
  const plans = (await db.plans.toArray()).filter((p) => !p.deleted)
  const practicePlans = new Set(plans.filter(practiceOn).map((p) => p.id))
  // Cards of plans with reviews off are kept in the database but ignored everywhere; switching reviews on resumes them.
  const reviewPlans = new Set(plans.filter(reviewsOn).map((p) => p.id))
  const byTask = new Map<string, ReviewCardRecord>()
  const out: ReviewCardRecord[] = []
  for (const c of (await db.reviewCards.toArray()).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (c.deleted || !reviewPlans.has(c.planId)) continue
    const task = c.taskId ? tasks.get(c.taskId) : undefined
    if (c.taskId && !task) continue
    if (!c.taskId && !practicePlans.has(c.planId)) continue
    if (c.taskId) {
      if (byTask.has(c.taskId)) continue
      byTask.set(c.taskId, c)
    }
    if (!c.suspended) out.push({ ...c, learningSteps: c.learningSteps ?? 0, minutes: c.minutes ?? ((task && cardMinutes(task)) || 10) })
  }
  return out
}

/** Cards due on `date` ("yyyy-mm-dd", local) or earlier, earliest first. */
export async function dueCards(db: KilnDB, date: string): Promise<ReviewCardRecord[]> {
  const tasks = await liveTasks(db)
  const end = endOfLocalDay(date)
  return (await liveCards(db, tasks)).filter((c) => c.due <= end).sort((a, b) => a.due - b.due)
}

/** The scheduler's `reviewsDue` input for `fromDate`..`toDate` (see domain/mastery reviewsDue). */
export async function reviewsDue(db: KilnDB, fromDate: string, toDate: string): Promise<ReviewsDue> {
  return bucketReviews(await liveCards(db, await liveTasks(db)), fromDate, toDate)
}

/** Tasks that count toward mastery: they get a card and their plan has reviews on. */
async function planned(db: KilnDB, tasks: Map<string, TaskRecord>) {
  const on = new Set((await db.plans.toArray()).filter((p) => !p.deleted && reviewsOn(p)).map((p) => p.id))
  return [...tasks.values()].filter((t) => on.has(t.planId) && t.status !== 'skipped' && cardMinutes(t) !== undefined)
}

/** Mastery per topic over every live plan; see domain/mastery MasteryStat. */
export async function masteryByTopic(db: KilnDB, now: number): Promise<Record<string, MasteryStat>> {
  const tasks = await liveTasks(db)
  return topicMastery(await planned(db, tasks), await liveCards(db, tasks), now)
}

/** Mastery per plan id. */
export async function masteryByPlan(db: KilnDB, now: number): Promise<Record<string, MasteryStat>> {
  const tasks = await liveTasks(db)
  return planMastery(await planned(db, tasks), await liveCards(db, tasks), now)
}

export interface BrushUpEntry extends BrushUpItem<ReviewCardRecord> {
  /** Title of the task (or problem) to revisit. */
  title: string
  /** Language for the "Solve in" link: the card's plan's. */
  language: string
}

/** The brush-up list: cards due or with recall under 85%, weakest first. */
export async function brushUp(db: KilnDB, now: number): Promise<BrushUpEntry[]> {
  const tasks = await liveTasks(db)
  // Cards for generated daily problems have no task: their title comes from the problem record.
  const problems = new Map((await db.practiceItems.toArray()).filter((p) => !p.deleted).map((p) => [p.slug, p.title]))
  const plans = new Map((await db.plans.toArray()).map((p) => [p.id, p]))
  return brushUpCards(await liveCards(db, tasks), now).map((i) => ({
    ...i,
    language: practiceLanguage(plans.get(i.card.planId) ?? {}),
    title: (i.card.taskId && tasks.get(i.card.taskId)?.title) || (i.card.slug && (problems.get(i.card.slug) ?? i.card.slug)) || '',
  }))
}
