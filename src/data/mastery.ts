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
import { insertRecord, setTaskStatus, updateRecord } from './repo'
import type { ReviewCardRecord, ReviewLogRecord, TaskRecord } from './types'

/** The app spreads review dates with fuzz; tests pass `{ fuzz: false }`. */
const APP_OPTS: SchedulerOptions = { fuzz: true }

async function liveCardForTask(db: KilnDB, taskId: string): Promise<ReviewCardRecord | undefined> {
  return (await db.reviewCards.where('taskId').equals(taskId).toArray()).find((c) => !c.deleted)
}

async function logReview(db: KilnDB, cardId: string, log: ReturnType<typeof rate>['log']): Promise<ReviewLogRecord> {
  return insertRecord(db, 'reviewLogs', { cardId, ...log })
}

export interface CompleteResult {
  task: TaskRecord
  /** Undefined when the task type gets no review card (see cardMinutes). */
  card?: ReviewCardRecord
  log?: ReviewLogRecord
}

/**
 * Marks the task done and records how well it went. First completion of a task that gets a card
 * (cardMinutes) creates the card and rates it; completing again rates the existing card. Tasks
 * without a card (reviews, projects, milestones) are only marked done and the rating is ignored.
 * Skipping a task later does not retire its card. The three writes are separate (no transaction): a crash between them can leave a done task
 * without its card or log (the next completion repairs it), and two overlapping calls for one new
 * task could create two cards (the oldest is the one rated and read).
 */
export async function completeTask(
  db: KilnDB,
  taskId: string,
  rating: RatingName,
  now: number,
  opts: SchedulerOptions = APP_OPTS,
): Promise<CompleteResult> {
  const task = await setTaskStatus(db, taskId, 'done')
  if (!task) throw new Error(`Task ${taskId} not found`)
  const minutes = cardMinutes(task)
  if (minutes === undefined) return { task }

  const existing = await liveCardForTask(db, taskId)
  const { card, log } = rate(existing ?? newCard(now), rating, now, opts)
  let rec: ReviewCardRecord
  if (existing) {
    rec = (await updateRecord(db, 'reviewCards', existing.id, card))!
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
  return { task, card: rec, log: await logReview(db, rec.id, log) }
}

/** Rates a review of an existing card (a due review, or a brush-up). */
export async function reviewCard(
  db: KilnDB,
  cardId: string,
  rating: RatingName,
  now: number,
  opts: SchedulerOptions = APP_OPTS,
): Promise<{ card: ReviewCardRecord; log: ReviewLogRecord }> {
  const old = await db.reviewCards.get(cardId)
  if (!old || old.deleted) throw new Error(`Review card ${cardId} not found`)
  const { card, log } = rate(old, rating, now, opts)
  const rec = (await updateRecord(db, 'reviewCards', cardId, card))!
  return { card: rec, log: await logReview(db, cardId, log) }
}

// ---- queries (tombstones excluded; cards of deleted tasks are ignored) ----

async function liveTasks(db: KilnDB): Promise<Map<string, TaskRecord>> {
  return new Map((await db.tasks.toArray()).filter((t) => !t.deleted).map((t) => [t.id, t]))
}

async function liveCards(db: KilnDB, tasks: Map<string, TaskRecord>): Promise<ReviewCardRecord[]> {
  return (await db.reviewCards.toArray()).filter((c) => !c.deleted && (!c.taskId || tasks.has(c.taskId)))
}

/** Cards due on `date` ("yyyy-mm-dd", local) or earlier, earliest first. */
export async function dueCards(db: KilnDB, date: string): Promise<ReviewCardRecord[]> {
  const tasks = await liveTasks(db)
  const due = await db.reviewCards.where('due').belowOrEqual(endOfLocalDay(date)).toArray()
  return due.filter((c) => !c.deleted && (!c.taskId || tasks.has(c.taskId))).sort((a, b) => a.due - b.due)
}

/** The scheduler's `reviewsDue` input for `fromDate`..`toDate` (see domain/mastery reviewsDue). */
export async function reviewsDue(db: KilnDB, fromDate: string, toDate: string): Promise<ReviewsDue> {
  return bucketReviews(await liveCards(db, await liveTasks(db)), fromDate, toDate)
}

function planned(tasks: Map<string, TaskRecord>) {
  return [...tasks.values()].filter((t) => t.status !== 'skipped' && cardMinutes(t) !== undefined)
}

/** Mastery per topic over every live plan; see domain/mastery MasteryStat. */
export async function masteryByTopic(db: KilnDB, now: number): Promise<Record<string, MasteryStat>> {
  const tasks = await liveTasks(db)
  return topicMastery(planned(tasks), await liveCards(db, tasks), now)
}

/** Mastery per plan id. */
export async function masteryByPlan(db: KilnDB, now: number): Promise<Record<string, MasteryStat>> {
  const tasks = await liveTasks(db)
  return planMastery(planned(tasks), await liveCards(db, tasks), now)
}

export interface BrushUpEntry extends BrushUpItem<ReviewCardRecord> {
  /** Title of the task (or problem) to revisit. */
  title: string
}

/** The brush-up list: cards due or with recall under 85%, weakest first. */
export async function brushUp(db: KilnDB, now: number): Promise<BrushUpEntry[]> {
  const tasks = await liveTasks(db)
  return brushUpCards(await liveCards(db, tasks), now).map((i) => ({
    ...i,
    title: (i.card.taskId && tasks.get(i.card.taskId)?.title) || i.card.slug || '',
  }))
}
