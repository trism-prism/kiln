// Input and output of schedule(). Plain objects with no database types; src/data/schedule.ts maps to them.
import type { Difficulty, PoolProblem, Solved } from '../practice'

export type Priority = 'core' | 'recommended' | 'optional'

export interface SchedPlan {
  id: string
  /** Positive (2, 3 or 5 from the share). A plan with weight 2 gets about twice the minutes of a plan with weight 1. */
  weight: number
  /** Day 1. Nothing of this plan is placed before it. */
  startDate: string
  /** End of the last day to finish core and recommended work. Also opens the "final 14 days" of the ramp. */
  deadline?: string
  /** Send this plan's open optional tasks to the backlog (like the input's skipOptional, for one plan). */
  skipOptional?: boolean
  dailyPractice?: {
    source: 'neetcode' | 'plan'
    perDay: number
    startDifficulty: Difficulty
    topicFollowsLessons: boolean
  }
  /** Study time plan: minutes per week, planned as daily sessions (study.ts). Such a plan has no tasks. */
  studyMinutesPerWeek?: number
}

export interface SchedTask {
  id: string
  planId: string
  /** The task's id in the plan file; `dependsOn` holds these. */
  key: string
  moduleOrder: number
  taskOrder: number
  estimatedMinutes: number
  priority: Priority
  type: 'lesson' | 'practice' | 'review' | 'project' | 'assessment' | 'milestone'
  dependsOn: string[]
  /** Effective plan day: the larger of the task's and its module's notBeforeDay. */
  notBeforeDay?: number
  /** Pinned by the user or `fixedDate` from the file. Kept even when over budget. */
  pinnedDate?: string
  deadline?: string
  status: 'open' | 'done' | 'skipped'
  scheduledDate?: string
  /** Deferred earlier to the optional backlog. */
  inBacklog?: boolean
  topics: string[]
  /** Only for LeetCode problems. */
  practice?: { slug: string; difficulty: Difficulty }
}

export interface ScheduleInput {
  plans: SchedPlan[]
  tasks: SchedTask[]
  /** Study minutes per weekday, Monday first (7 numbers). */
  minutesPerWeekday: number[]
  blackoutDates: string[]
  /** Local date, yyyy-mm-dd. Nothing is placed before it. */
  today: string
  /**
   * 'initial': place every open task that has no date (including backlog ones); dated tasks keep their date.
   * 'reschedule': also move open tasks dated before today; backlog tasks stay in the backlog.
   */
  mode: 'initial' | 'reschedule'
  /** Spaced reviews due per date, supplied by the caller. Reserved minutes are capped by reviewCapPercent. */
  reviewsDue?: Record<string, { count: number; minutes: number }>
  /** Default 25. */
  reviewCapPercent?: number
  /** Minutes already taken per date outside plans (dated personal to-dos), counted like pinned tasks. Events take none. */
  fixedMinutes?: Record<string, number>
  /** Send every open optional task to the backlog. */
  skipOptional?: boolean
  /** Problems already solved (the practice log): feeds the ramp and is never offered again. */
  solved?: Solved[]
  /** Default: the bundled NeetCode list. */
  pool?: readonly PoolProblem[]
  /** First day of a week for study time plans' weekly minutes. Default monday. */
  weekStartsOn?: 'monday' | 'sunday'
  /** Finished study sessions (live ones), so a week's plan counts what is already done. */
  studyDone?: { planId: string; date: string; minutes: number }[]
}

/** A study session of a study time plan on a day. */
export interface GeneratedStudy {
  planId: string
  date: string
  minutes: number
}

export const BACKLOG = 'backlog'

export interface GeneratedPractice {
  date: string
  planId: string
  slug: string
  title: string
  difficulty: Difficulty
  topic: string
  minutes: number
}

export interface DayLoad {
  date: string
  /** The weekday budget (0 on blackout days). */
  budget: number
  /** Reserved for spaced reviews (at most the review cap of the budget). */
  reviewMinutes: number
  /** Generated daily problems. */
  practiceMinutes: number
  /** Plan tasks, including plan problems, pinned and already dated ones, plus `fixedMinutes` (personal to-dos). */
  taskMinutes: number
  /** Study sessions of study time plans, reserved first. */
  studyMinutes: number
}

export type Violation =
  | { kind: 'plan-deadline'; planId: string; deadline: string; projectedFinish: string }
  | { kind: 'task-deadline'; planId: string; taskId: string; deadline: string; date: string }
  /** A pinned or already dated task whose open dependency is in the backlog, undated, or not dated earlier. */
  | { kind: 'dependency'; planId: string; taskId: string; dependsOnId: string; reason: 'backlog' | 'unscheduled' | 'not-earlier' }

export interface ScheduleOutput {
  /** Open tasks to a date, or 'backlog'. Includes tasks that keep their date. Unplaceable tasks are absent. */
  assignments: Record<string, string>
  practice: GeneratedPractice[]
  /** Study sessions of study time plans, from today to the horizon, by date. */
  study: GeneratedStudy[]
  /** Days that have anything on them, in date order. */
  days: DayLoad[]
  /** Last date of a plan's open, dated tasks. */
  projectedFinish: Record<string, string>
  violations: Violation[]
  unplaceable: { taskId: string; reason: 'blocked' | 'no-capacity' }[]
}
