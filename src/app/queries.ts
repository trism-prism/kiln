// Live reads for the screens. Every hook re-runs when the tables it read change (dexie-react-hooks).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { badgeCount } from '../domain/badge'
import { buildStudyDays, streakStats, type DayStudy, type StreakStats } from '../domain/streaks'
import { buildTodoItems, parseTodoPrefs, type TodoItem, type TodoPrefs } from '../domain/todo'
import type { WeekStart } from '../domain/calendar'
import { getMeta, setMeta } from '../pwa/meta'
import {
  db,
  dueCards,
  eventsBetween,
  getSettings,
  listModules,
  listPersonalTodos,
  listPlans,
  masteryByPlan,
  practiceConfig,
  practiceLanguage,
  studyEvents,
  tasksScheduledBetween,
  type ModuleRecord,
  type PlanRecord,
  type SettingsRecord,
  type TaskRecord,
} from '../data'
import { addDaysISO, toLocalISODate, weekdayIndex } from '../lib/date'

/** Today's local date. Re-checked every 30 s and when the tab regains focus, so it rolls over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => toLocalISODate(new Date()))
  useEffect(() => {
    const tick = () => setToday(toLocalISODate(new Date()))
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

/** Changes once a minute, to refresh views that depend on the current time. */
export function useMinute(): number {
  const [m, setM] = useState(() => Math.floor(Date.now() / 60_000))
  useEffect(() => {
    const id = setInterval(() => setM(Math.floor(Date.now() / 60_000)), 60_000)
    return () => clearInterval(id)
  }, [])
  return m
}

const alive = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted)

/** The badge: open tasks and daily problems today or overdue, plus reviews due. */
export function useBadgeCount(today: string): number {
  return (
    useLiveQuery(async () => {
      const tasks = await tasksScheduledBetween(db, '0000-01-01', today)
      const on = new Set((await listPlans(db)).filter((p) => practiceConfig(p)).map((p) => p.id))
      const problems = alive(await db.practiceItems.where('date').belowOrEqual(today).toArray()).filter((p) => on.has(p.planId))
      const todos = await db.personalTodos.where('date').belowOrEqual(today).toArray()
      return badgeCount([...tasks, ...problems.map((p) => ({ status: p.status, scheduledDate: p.date }))], await dueCards(db, today), today, todos)
    }, [today]) ?? 0
  )
}

async function loadTodo(today: string, horizonDays: number) {
  const plans = await listPlans(db)
  const allTasks = alive(await db.tasks.toArray())
  const problems = alive(await db.practiceItems.toArray())
  const planLanguages = new Map(plans.map((p) => [p.id, practiceLanguage(p)]))
  const practiceLanguages = new Map(plans.filter((p) => practiceConfig(p)).map((p) => [p.id, practiceLanguage(p)]))
  const cards = await dueCards(db, addDaysISO(today, horizonDays))
  const taskTitle = new Map(allTasks.map((t) => [t.id, t.title]))
  const problemTitle = new Map(problems.map((p) => [p.slug, p.title]))
  const items = buildTodoItems(
    {
      tasks: allTasks,
      problems,
      cards,
      personalTodos: await listPersonalTodos(db),
      events: await eventsBetween(db, addDaysISO(today, -horizonDays), addDaysISO(today, horizonDays)),
      planTitles: new Map(plans.map((p) => [p.id, p.title])),
      practiceLanguages,
      planLanguages,
      cardTitle: (c) => (c.taskId && taskTitle.get(c.taskId)) || (c.slug && (problemTitle.get(c.slug) ?? c.slug)) || '',
    },
    today,
  )
  return { items, hasPlans: plans.length > 0, tasks: allTasks, favorites: plans.filter((p) => p.favorite).map((p) => p.id) }
}

/** Everything the To Do page can list (a year either way), the favorite plans' ids and the week start. undefined while loading. */
export function useTodoItems(today: string): { items: TodoItem[]; hasPlans: boolean; favorites: string[]; weekStartsOn: WeekStart } | undefined {
  return useLiveQuery(async () => {
    const { items, hasPlans, favorites } = await loadTodo(today, 366)
    return { items, hasPlans, favorites, weekStartsOn: (await getSettings(db)).weekStartsOn }
  }, [today])
}

const TODO_PREFS_KEY = 'todoPrefs'

/** The To Do list preferences of this device (meta), and a saver. undefined while loading. */
export function useTodoPrefs(): [TodoPrefs | undefined, (p: TodoPrefs) => Promise<void>] {
  const prefs = useLiveQuery(async () => parseTodoPrefs(await getMeta(db, TODO_PREFS_KEY)), [])
  return [prefs, (p) => setMeta(db, TODO_PREFS_KEY, JSON.stringify(p))]
}

export interface CalendarData {
  /** Every dated item (tasks, daily problems, reviews up to a year ahead), as on the To Do page. */
  items: TodoItem[]
  /** Live tasks, for dependency checks when one is moved. */
  tasks: TaskRecord[]
  hasPlans: boolean
  settings: SettingsRecord
}

/** What the calendar draws: all dated items, the tasks, and the settings (week start, daily minutes, blackout dates). */
export function useCalendarData(today: string): CalendarData | undefined {
  return useLiveQuery(async () => {
    const { items, hasPlans, tasks } = await loadTodo(today, 366)
    return { items, tasks, hasPlans, settings: await getSettings(db) }
  }, [today])
}

export interface StudySummary {
  days: Map<string, DayStudy>
  stats: StreakStats
  /** Read for the streak; the heatmap needs the week start and the day budgets too. */
  settings: SettingsRecord
}

/** Streak numbers and the per-day completions behind the heatmap. Blackout dates and weekdays with no minutes do not break a streak. */
export function useStudy(today: string): StudySummary | undefined {
  return useLiveQuery(async () => {
    const days = buildStudyDays(await studyEvents(db))
    const settings = await getSettings(db)
    const blackout = new Set(settings.blackoutDates)
    const stats = streakStats(days, today, (d) => blackout.has(d) || (settings.minutesPerWeekday[weekdayIndex(d)] ?? 0) === 0)
    return { days, stats, settings }
  }, [today])
}

export interface PlanSummary {
  plan: PlanRecord
  /** First open task by date, then plan order. */
  next?: TaskRecord
  /** Open tasks and daily problems for today. */
  todayCount: number
  overdue: number
  coreDone: number
  coreTotal: number
  allDone: number
  allTotal: number
  /** 0-1 */
  mastery: number
  /** Last date of the plan's open, scheduled tasks. */
  finish?: string
  backlog: number
}

/** One summary per plan (skipped tasks are left out of the totals). */
export function usePlanSummaries(today: string): PlanSummary[] | undefined {
  return useLiveQuery(async () => {
    const plans = await listPlans(db)
    const tasks = alive(await db.tasks.toArray())
    const problems = alive(await db.practiceItems.toArray())
    const mastery = await masteryByPlan(db, Date.now())
    return plans.map((plan): PlanSummary => {
      const mine = tasks.filter((t) => t.planId === plan.id && t.status !== 'skipped')
      const open = mine.filter((t) => t.status === 'open')
      const dated = open.filter((t) => t.scheduledDate).sort((a, b) => (a.scheduledDate! < b.scheduledDate! ? -1 : a.scheduledDate! > b.scheduledDate! ? 1 : a.order - b.order))
      const myProblems = practiceConfig(plan) ? problems.filter((p) => p.planId === plan.id && p.status === 'open') : []
      const core = mine.filter((t) => t.priority === 'core')
      return {
        plan,
        next: dated[0],
        todayCount: open.filter((t) => t.scheduledDate === today).length + myProblems.filter((p) => p.date === today).length,
        overdue: open.filter((t) => t.scheduledDate && t.scheduledDate < today).length + myProblems.filter((p) => p.date < today).length,
        coreDone: core.filter((t) => t.status === 'done').length,
        coreTotal: core.length,
        allDone: mine.filter((t) => t.status === 'done').length,
        allTotal: mine.length,
        mastery: mastery[plan.id]?.mastery ?? 0,
        finish: dated.at(-1)?.scheduledDate,
        backlog: open.filter((t) => t.backlog).length,
      }
    })
  }, [today])
}

export interface TaskDetail {
  task: TaskRecord
  plan?: PlanRecord
  module?: ModuleRecord
  /** The tasks it depends on, in the order of `dependsOn`. */
  dependencies: TaskRecord[]
}

/** One task with its plan, module and dependencies. undefined while loading, null when it does not exist. */
export function useTaskDetail(id: string | undefined): TaskDetail | null | undefined {
  return useLiveQuery(async () => {
    const task = id ? await db.tasks.get(id) : undefined
    if (!task || task.deleted) return null
    const plan = await db.plans.get(task.planId)
    const module = await db.modules.get(task.moduleId)
    const siblings = alive(await db.tasks.where('planId').equals(task.planId).toArray())
    const byKey = new Map(siblings.map((t) => [t.key, t]))
    return {
      task,
      plan: plan && !plan.deleted ? plan : undefined,
      module: module && !module.deleted ? module : undefined,
      dependencies: task.dependsOn.flatMap((k) => byKey.get(k) ?? []),
    }
  }, [id])
}

export interface PlanDetail {
  plan: PlanRecord
  modules: { module: ModuleRecord; tasks: TaskRecord[] }[]
  backlog: TaskRecord[]
}

/** A plan with its modules (in order) and their tasks (in order). undefined while loading, null when missing. */
export function usePlanDetail(id: string | undefined): PlanDetail | null | undefined {
  return useLiveQuery(async () => {
    const plan = id ? await db.plans.get(id) : undefined
    if (!plan || plan.deleted) return null
    const modules = await listModules(db, plan.id)
    const tasks = alive(await db.tasks.where('planId').equals(plan.id).toArray()).sort((a, b) => a.order - b.order)
    return {
      plan,
      modules: modules.map((module) => ({ module, tasks: tasks.filter((t) => t.moduleId === module.id) })),
      backlog: tasks.filter((t) => t.backlog && t.status === 'open'),
    }
  }, [id])
}

/** Kiln's week start (Settings), for every date picker. */
export function useWeekStart(): WeekStart {
  return useLiveQuery(async () => (await getSettings(db)).weekStartsOn, []) ?? 'monday'
}
