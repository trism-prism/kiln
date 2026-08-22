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
  /** Share of daily capacity against other plans, 1-5. */
  weight: number
  /** Day 1 of the plan. */
  startDate: string
  deadline?: string
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
  settings: SettingsRecord
}
export type TableName = keyof Records
export const TABLE_NAMES: TableName[] = ['plans', 'modules', 'tasks', 'reviewCards', 'reviewLogs', 'practiceLog', 'settings']
