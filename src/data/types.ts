// Record shapes stored in IndexedDB. Dates are local calendar days as "yyyy-mm-dd"; times are ms since epoch.
import type { DailyPractice, Plan, Source, Task } from '../domain/plan-format'

/** On every synced record. `deleted` is the tombstone: records are never removed, only flagged. */
export interface Base {
  /** UUIDv7 (the settings record uses the fixed id "settings"). */
  id: string
  /** ms epoch of the last write; sync keeps the record with the larger value. */
  updatedAt: number
  deleted: boolean
  /** Device that made the last write. */
  deviceId: string
}

export type TaskStatus = 'open' | 'done' | 'skipped'
export type Share = 'less' | 'even' | 'more'

export interface PlanRecord extends Base {
  /** The plan's own id from the file (a slug). */
  key: string
  title: string
  description?: string
  goal?: string
  subject?: string
  level?: Plan['level']
  audience?: string
  schedulingMode: Plan['schedulingMode']
  sources: Source[]
  dailyPractice?: DailyPractice
  // App settings for this plan
  /**
   * Scheduler weight against other plans, 1-5. Kept in step with `share` (SHARE_WEIGHT) by setPlanShare
   * so older devices still read it; the scheduler uses `share` when it is set (planWeight in plan-settings.ts).
   */
  weight: number
  /** "Share of study time" (schema 4). Less, Even, More = scheduler weight 2, 3, 5. */
  share?: Share
  /** Starred in the plan list (schema 4). */
  favorite?: boolean
  /**
   * Daily practice problem setting (schema 4). Unset: on when the plan file has `dailyPractice`. False:
   * off. True without a `dailyPractice` config: NeetCode, one a day (practiceConfig in plan-settings.ts).
   */
  dailyPracticeOn?: boolean
  /** Day 1 of the plan. */
  startDate: string
  deadline?: string
  /**
   * Spaced reviews for this plan (schema 4+, opt-in). Unset means off, so plans from before the setting
   * (and plans synced from older devices) start off with no rewrite. Their old cards are kept but ignored
   * until this is true (reviewPlanIds in plan-settings.ts).
   */
  reviewsOn?: boolean
  /** Keep this plan's optional tasks in the backlog. */
  skipOptional?: boolean
  // Part progress
  /** How many files the plan is split into (1 when not split). */
  partTotal: number
  /** Part indices imported so far. The plan is complete when this covers 1..partTotal. */
  partsIn: number[]
}

export interface ModuleRecord extends Base {
  planId: string
  /** The module's id from the file. */
  key: string
  title: string
  order: number
  summary?: string
  notBeforeDay?: number
}

/** Plan task fields (as in the file, minus `id`) plus the app's state for the task. */
export interface TaskRecord extends Base, Omit<Task, 'id' | 'moduleId'> {
  planId: string
  /** The task's id from the file. `dependsOn` also holds file ids, resolve them with [planId+key]. */
  key: string
  /** Id of the ModuleRecord. */
  moduleId: string
  // App state
  /** Set by the scheduler. */
  scheduledDate?: string
  /** User-pinned day; the scheduler must keep it. Set from `fixedDate` on import. */
  pinnedDate?: string
  /** Set by the scheduler when it defers the task to the optional backlog (no `scheduledDate` then). */
  backlog?: boolean
  status: TaskStatus
  completedAt?: number
}

/** FSRS card state as plain data (the fields of ts-fsrs's Card, with times as ms). See domain/mastery. */
export interface ReviewCardRecord extends Base {
  planId: string
  /** The task being reviewed. */
  taskId?: string
  /** A LeetCode problem being re-solved (when it is not a task). */
  slug?: string
  topics: string[]
  /** When the card is next due. */
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  /** ts-fsrs learning step index (always 0 in Kiln: short-term steps are off). */
  learningSteps: number
  reps: number
  lapses: number
  /** FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number
  lastReview?: number
  /** Estimated minutes for one review of this card (domain/mastery cardMinutes). */
  minutes: number
  /** The task was skipped: the card is not due, listed or counted until resumed. */
  suspended?: boolean
}

export interface ReviewLogRecord extends Base {
  cardId: string
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  /** Card state before the review. */
  state: number
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  /** When the review happened. */
  reviewedAt: number
}

/** One LeetCode problem done on a day (feeds the streak and the difficulty ramp). */
export interface PracticeLogRecord extends Base {
  date: string
  planId?: string
  taskId?: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
  /** 1-4 as for reviews. */
  rating?: number
  completedAt: number
}

/**
 * A daily LeetCode problem the scheduler generated for a day, kept so it stays the same between runs
 * and can be checked off. Keyed by (planId, date, slug). Finished ones also get a practiceLog row.
 */
export interface PracticeItemRecord extends Base {
  planId: string
  date: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
  /** Estimated minutes (the scheduler's, by difficulty). */
  minutes: number
  status: 'open' | 'done'
  /** 1-4 as for reviews, set on completion. */
  rating?: number
  completedAt?: number
}

/** Singleton, id "settings". */
export interface SettingsRecord extends Base {
  /** Study minutes available per weekday, Monday first. */
  minutesPerWeekday: number[]
  weekStartsOn: 'monday' | 'sunday'
  /** "HH:mm" local. */
  reminderTime: string
  nudgeEnabled: boolean
  nudgeTime: string
  theme: 'system' | 'light' | 'dark'
  /** Reviews may take at most this share of a day's minutes. */
  reviewCapPercent: number
  /** Days with no study (scheduler skips them). */
  blackoutDates: string[]
}

/** A one-off to-do outside any plan (schema 4). With a date and minutes it takes that time from the day's budget. */
export interface PersonalTodoRecord extends Base {
  title: string
  /** Day it is due; none = undated (shown in the list, never overdue). */
  date?: string
  /** Estimated minutes; counted as fixed load on `date` by the scheduler. */
  minutes?: number
  done: boolean
  completedAt?: number
  notes?: string
}

/**
 * A dated item that takes no study time (schema 4), e.g. a class or an exam from an LMS calendar.
 * All-day events have `date` (and `endDate` for several days); timed ones also have `start`/`end`.
 */
export interface EventRecord extends Base {
  title: string
  /** Local day the event is shown on (its first day). Indexed. */
  date: string
  /** Last day of a multi-day all-day event, inclusive. */
  endDate?: string
  allDay: boolean
  /** Start, ms epoch (timed events). */
  start?: number
  /** End, ms epoch (timed events). */
  end?: number
  /** Course code or name, e.g. "BIO 101". */
  course?: string
  url?: string
  notes?: string
  /** Plan the event belongs to (the course's plan); tombstoned with it. */
  planId?: string
  /** Feed it came from (feeds table); none for a one-off .ics upload. */
  feedId?: string
  /** The calendar UID, used to match on re-import. */
  uid?: string
}

/**
 * A saved version of a plan's content (schema 4); the plan edit screen calls snapshotPlan after each save. At most 20 live per plan
 * (snapshotPlan prunes). `snapshot` is a plan file (domain/plan-format Plan) as gzip + base64url; read it with readSnapshot.
 */
export interface PlanVersionRecord extends Base {
  planId: string
  createdAt: number
  /** Optional name, e.g. "Before restore". */
  label?: string
  /** What changed, e.g. "Renamed 2 tasks, added 1". */
  summary: string
  /** Empty on pruned (tombstoned) versions. */
  snapshot: string
}

export type Lms = 'canvas' | 'blackboard' | 'moodle' | 'brightspace' | 'schoology' | 'google' | 'other'

export interface FeedResult {
  ok: boolean
  /** Counts from the last fetch, for "3 new assignments, 1 due date changed". */
  added?: number
  changed?: number
  removed?: number
  /** Class times or exams that moved to another time. */
  moved?: number
  /** Short reason when `ok` is false. */
  error?: string
}

/** A calendar link kept in sync (schema 4). The URL is a secret: sync carries it end-to-end encrypted; the JSON backup leaves it out (a backup file is plain text and gets shared), so a restored feed needs its link pasted again. */
export interface FeedRecord extends Base {
  lms: Lms
  /** https URL of the .ics feed. Empty after a backup restore (the backup leaves it out): see `needsLink`. */
  url: string
  /** The link was not in the backup file; the person has to paste it again. */
  needsLink?: boolean
  /** Fingerprint of what the last notice was about, so the same news is not announced again every 6 hours. */
  noticeFp?: string
  /** Display name, e.g. "Canvas (Fall 2026)". */
  name?: string
  /** Plans created from this feed (one per course). */
  planIds: string[]
  lastFetchedAt?: number
  lastResult?: FeedResult
}

/** Local to this device, never exported or synced. */
export interface MetaRecord {
  key: string
  value: string
}

/** Table name -> record type, for the synced tables. */
export interface Records {
  plans: PlanRecord
  modules: ModuleRecord
  tasks: TaskRecord
  reviewCards: ReviewCardRecord
  reviewLogs: ReviewLogRecord
  practiceLog: PracticeLogRecord
  practiceItems: PracticeItemRecord
  settings: SettingsRecord
  personalTodos: PersonalTodoRecord
  events: EventRecord
  planVersions: PlanVersionRecord
  feeds: FeedRecord
}
export type TableName = keyof Records
export const TABLE_NAMES: TableName[] = [
  'plans',
  'modules',
  'tasks',
  'reviewCards',
  'reviewLogs',
  'practiceLog',
  'practiceItems',
  'settings',
  'personalTodos',
  'events',
  'planVersions',
  'feeds',
]
