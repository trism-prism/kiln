// Review minutes, mastery %, the brush-up list and the scheduler's reviewsDue shape. Pure.
import type { Practice, TaskType } from '../plan-format'
import { retrievability, type CardState } from './fsrs'

// ---- local dates ("yyyy-mm-dd", the device's local calendar day; no timezone handling) ----

const p2 = (n: number) => String(n).padStart(2, '0')

/** The local calendar day of a ms timestamp. */
export function localDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** Last millisecond of a local day. */
export function endOfLocalDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d + 1).getTime() - 1
}

// ---- which tasks get a review card, and how long a review takes ----

export const LEETCODE_REVIEW_MINUTES = { easy: 15, medium: 25, hard: 35 } as const
export const LESSON_REVIEW_SHARE = 0.25
export const LESSON_REVIEW_MIN = 5
export const LESSON_REVIEW_MAX = 20

export interface ReviewableTask {
  type: TaskType
  estimatedMinutes: number
  practice?: Pick<Practice, 'provider' | 'slug' | 'difficulty'>
}

/**
 * Minutes one review of the task takes, or undefined when the task gets no review card.
 * - A task with a LeetCode problem (practice or assessment): re-solve, 15/25/35 minutes for easy/medium/hard.
 * - A lesson: max(5, round(0.25 * estimatedMinutes)), capped at 20.
 * - Everything else (review, project, milestone, other-provider practice) gets no card: a plan's own
 *   review tasks are sessions, not material to retain, and projects and milestones are not recall.
 */
export function cardMinutes(task: ReviewableTask): number | undefined {
  if (task.type !== 'milestone' && task.practice?.provider === 'leetcode' && task.practice.slug) {
    return LEETCODE_REVIEW_MINUTES[task.practice.difficulty]
  }
  if (task.type === 'lesson') {
    return Math.min(LESSON_REVIEW_MAX, Math.max(LESSON_REVIEW_MIN, Math.round(LESSON_REVIEW_SHARE * task.estimatedMinutes)))
  }
  return undefined
}

// ---- mastery ----

/** Mastery is the mean retrievability (0-1; show as a percentage) over the planned tasks. */
export interface MasteryStat {
  mastery: number
  /** Planned tasks that get a review card (skipped and deleted tasks excluded). */
  total: number
  /** Of those, how many have a card (were completed). Never-studied tasks count as 0 in the mean. */
  studied: number
}

export interface PlannedTask {
  id: string
  planId: string
  topics: string[]
}

export interface CardRef extends CardState {
  taskId?: string
}

function stats(groups: Map<string, PlannedTask[]>, cards: CardRef[], now: number): Record<string, MasteryStat> {
  const byTask = new Map<string, number>()
  // One card per task (the data layer dedupes: two devices can each create one before syncing).
  for (const c of cards) if (c.taskId && !byTask.has(c.taskId)) byTask.set(c.taskId, retrievability(c, now))
  const out: Record<string, MasteryStat> = {}
  for (const [key, tasks] of groups) {
    let sum = 0
    let studied = 0
    for (const t of tasks) {
      const r = byTask.get(t.id)
      if (r !== undefined) {
        sum += r
        studied++
      }
    }
    out[key] = { mastery: tasks.length ? sum / tasks.length : 0, total: tasks.length, studied }
  }
  return out
}

function group(planned: PlannedTask[], keys: (t: PlannedTask) => string[]) {
  const m = new Map<string, PlannedTask[]>()
  for (const t of planned) for (const k of new Set(keys(t))) m.set(k, [...(m.get(k) ?? []), t])
  return m
}

/** Mastery per topic. A task with several topics counts in each. `cards` are the live cards. */
export const masteryByTopic = (planned: PlannedTask[], cards: CardRef[], now: number) =>
  stats(group(planned, (t) => t.topics), cards, now)

/** Mastery per plan id. */
export const masteryByPlan = (planned: PlannedTask[], cards: CardRef[], now: number) =>
  stats(group(planned, (t) => [t.planId]), cards, now)

// ---- brush-up ----

/** Below this recall chance a card is offered for a brush-up. */
export const BRUSH_UP_THRESHOLD = 0.85

export interface BrushUpItem<C extends CardState> {
  card: C
  retrievability: number
  /** Due today or earlier (by local day). */
  due: boolean
}

/** Cards that are due or have retrievability under the threshold, lowest retrievability first (ties: earliest due). */
export function brushUp<C extends CardState>(cards: C[], now: number, threshold = BRUSH_UP_THRESHOLD): BrushUpItem<C>[] {
  const endOfToday = endOfLocalDay(localDate(now)) // "due" means due today, as for the badge and the due list
  return cards
    .map((card) => ({ card, retrievability: retrievability(card, now), due: card.due <= endOfToday }))
    .filter((i) => i.due || i.retrievability < threshold)
    .sort((a, b) => a.retrievability - b.retrievability || a.card.due - b.card.due)
}

// ---- scheduler input ----

/** Shape of the scheduler's `reviewsDue` input. */
export type ReviewsDue = { [date: string]: { count: number; minutes: number } }

/**
 * Reviews per local day from `fromDate` to `toDate` inclusive. Overdue reviews (due before
 * `fromDate`) are put on `fromDate`. Days with no reviews are left out.
 */
export function reviewsDue(cards: { due: number; minutes: number }[], fromDate: string, toDate: string): ReviewsDue {
  const out: ReviewsDue = {}
  for (const c of cards) {
    const day = localDate(c.due)
    const key = day < fromDate ? fromDate : day
    if (key > toDate) continue
    const e = (out[key] ??= { count: 0, minutes: 0 })
    e.count++
    e.minutes += c.minutes
  }
  return out
}
