// Live reads for the screens. Every hook re-runs when the tables it read change (dexie-react-hooks).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { badgeCount } from '../domain/badge'
import { buildTodoItems, type TodoItem } from '../domain/todo'
import {
  db,
  dueCards,
  listModules,
  listPlans,
  masteryByPlan,
  tasksScheduledBetween,
  type ModuleRecord,
  type PlanRecord,
  type TaskRecord,
} from '../data'
import { addDaysISO, toLocalISODate } from '../lib/date'

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

const alive = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted)

/** The badge: open tasks and daily problems today or overdue, plus reviews due. */
export function useBadgeCount(today: string): number {
  return (
    useLiveQuery(async () => {
      const tasks = await tasksScheduledBetween(db, '0000-01-01', today)
      const problems = alive(await db.practiceItems.where('date').belowOrEqual(today).toArray())
      return badgeCount([...tasks, ...problems.map((p) => ({ status: p.status, scheduledDate: p.date }))], await dueCards(db, today), today)
    }, [today]) ?? 0
  )
}

/** Everything the To Do page lists, from today - 28 days to today + 28 days. undefined while loading. */
export function useTodoItems(today: string): { items: TodoItem[]; hasPlans: boolean } | undefined {
  return useLiveQuery(async () => {
    const plans = await listPlans(db)
    const allTasks = alive(await db.tasks.toArray())
    const problems = alive(await db.practiceItems.toArray())
    const cards = await dueCards(db, addDaysISO(today, 28))
    const taskTitle = new Map(allTasks.map((t) => [t.id, t.title]))
    const problemTitle = new Map(problems.map((p) => [p.slug, p.title]))
    const items = buildTodoItems(
      {
        tasks: allTasks,
        problems,
        cards,
        planTitles: new Map(plans.map((p) => [p.id, p.title])),
        cardTitle: (c) => (c.taskId && taskTitle.get(c.taskId)) || (c.slug && (problemTitle.get(c.slug) ?? c.slug)) || '',
      },
      today,
    )
    return { items, hasPlans: plans.length > 0 }
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
      const myProblems = problems.filter((p) => p.planId === plan.id && p.status === 'open')
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
