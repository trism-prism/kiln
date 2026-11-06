// Manual plan builder: the form's state (a Draft) and its conversion to a plan object. The object is
// not trusted: it goes through validatePlan like any pasted plan.
import { NEETCODE_POOL } from '../../domain/practice'
import type { Priority, TaskType } from '../../domain/plan-format'
import { slugify } from './slug'

export interface DraftTask {
  uid: string
  title: string
  type: TaskType
  /** Text, so a half-typed value stays as typed; validation reports a bad one. */
  minutes: string
  priority: Priority
  /** Comma separated. */
  topics: string
  /** LeetCode slug, optional. */
  slug: string
  /** uids of the tasks this one depends on. */
  dependsOn: string[]
  /** yyyy-mm-dd, optional. */
  pinned: string
}

export interface DraftModule {
  uid: string
  title: string
  tasks: DraftTask[]
}

export interface Draft {
  title: string
  modules: DraftModule[]
}

let counter = 0
const uid = () => `d${++counter}`

export const emptyTask = (): DraftTask => ({
  uid: uid(),
  title: '',
  type: 'lesson',
  minutes: '',
  priority: 'core',
  topics: '',
  slug: '',
  dependsOn: [],
  pinned: '',
})

export const emptyModule = (): DraftModule => ({ uid: uid(), title: '', tasks: [emptyTask()] })

export const emptyDraft = (): Draft => ({ title: '', modules: [emptyModule()] })

// 60, not 64: room for the "-2" that keeps ids unique.
const slug = (s: string) => slugify(s, 60)

const POOL = new Map(NEETCODE_POOL.map((p) => [p.slug, p]))

/** An id from a title that no other id has: "arrays", "arrays-2", ... Modules, tasks and sources share one namespace. */
function unique(used: Set<string>, base: string): string {
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

/**
 * The plan object for a draft. A pinned date makes the plan a fixed-mode plan, which needs
 * `startDate`; otherwise the plan is auto.
 */
export function buildPlan(draft: Draft, info: { id: string; goal?: string; startDate?: string }): Record<string, unknown> {
  const used = new Set<string>()
  const moduleIds = draft.modules.map((m) => unique(used, slug(m.title) || 'module'))
  const taskIds = new Map<string, string>()
  for (const m of draft.modules) for (const t of m.tasks) taskIds.set(t.uid, unique(used, slug(t.title) || 'task'))

  const fixed = draft.modules.some((m) => m.tasks.some((t) => t.pinned.trim() !== ''))
  const plan: Record<string, unknown> = { schemaVersion: 1, id: info.id, title: draft.title.trim() }
  if (info.goal?.trim()) plan.goal = info.goal.trim()
  plan.schedulingMode = fixed ? 'fixed' : 'auto'
  if (fixed && info.startDate) plan.startDate = info.startDate
  plan.modules = draft.modules.map((m, i) => ({ id: moduleIds[i], title: m.title.trim(), order: i + 1 }))
  plan.tasks = draft.modules.flatMap((m, mi) =>
    m.tasks.map((t, ti) => {
      const task: Record<string, unknown> = {
        id: taskIds.get(t.uid),
        moduleId: moduleIds[mi],
        order: ti + 1,
        title: t.title.trim(),
        type: t.type,
        // Whole numbers become numbers; anything else stays text so the validator reports it
        // (5-180 minutes, or 0 for a milestone). A blank milestone means 0.
        estimatedMinutes: /^[0-9]+$/.test(t.minutes.trim()) ? Number(t.minutes.trim()) : t.minutes.trim() || (t.type === 'milestone' ? 0 : undefined),
        priority: t.priority,
      }
      const topics = t.topics.split(',').map((x) => x.trim()).filter((x) => x !== '')
      if (topics.length > 0) task.topics = topics
      const problem = t.slug.trim()
      if (problem !== '') {
        const known = POOL.get(problem)
        task.practice = { provider: 'leetcode', slug: problem, title: known?.title ?? problem, difficulty: known?.difficulty ?? 'medium' }
      }
      const deps = t.dependsOn.flatMap((u) => taskIds.get(u) ?? [])
      if (deps.length > 0) task.dependsOn = deps
      if (t.pinned.trim() !== '') task.fixedDate = t.pinned.trim()
      return task
    }),
  )
  return plan
}
