// Plan builder: the quick-add draft and its conversion to a plan object. The object is not trusted:
// it goes through validatePlan like any pasted plan.
import type { Priority, TaskType } from '../../domain/plan-format'
import { hostOf, kindFromUrl } from './quick-add'
import { slugify } from './slug'

export interface DraftTask {
  uid: string
  title: string
  type: TaskType
  /** Text, so a half-typed value stays as typed; validation reports a bad one. */
  minutes: string
  priority: Priority
  /** yyyy-mm-dd, optional: the task's deadline. */
  due: string
  /** Links separated by spaces. */
  links: string
}

export interface DraftModule {
  uid: string
  title: string
  tasks: DraftTask[]
}

export interface Draft {
  title: string
  modules: DraftModule[]
  /** A study time plan (one Quick add line like "Psychology 3h a week"): no modules or tasks. */
  study?: { subject: string; minutesPerWeek: number }
}

// 60, not 64: room for the "-2" that keeps ids unique.
const slug = (s: string) => slugify(s, 60)

/** An id from a title that no other id has: "arrays", "arrays-2", ... Modules, tasks and sources share one namespace. */
function unique(used: Set<string>, base: string): string {
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

/**
 * The plan object for a draft. A due date makes the plan a fixed-mode plan, which needs
 * `startDate`; otherwise the plan is auto. A study draft makes a study time plan.
 */
export function buildPlan(draft: Draft, info: { id: string; goal?: string; startDate?: string }): Record<string, unknown> {
  if (draft.study) {
    const study: Record<string, unknown> = { schemaVersion: 1, id: info.id, title: draft.title.trim(), subject: draft.study.subject }
    if (info.goal?.trim()) study.goal = info.goal.trim()
    return { ...study, schedulingMode: 'auto', studyMinutesPerWeek: draft.study.minutesPerWeek, modules: [], tasks: [] }
  }
  const used = new Set<string>()
  const moduleIds = draft.modules.map((m) => unique(used, slug(m.title) || 'module'))
  const taskIds = new Map<string, string>()
  for (const m of draft.modules) for (const t of m.tasks) taskIds.set(t.uid, unique(used, slug(t.title) || 'task'))

  const fixed = draft.modules.some((m) => m.tasks.some((t) => t.due.trim() !== ''))
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
      const links = t.links.split(/\s+/).filter((u) => u !== '')
      if (links.length > 0) task.resources = links.map((url) => ({ title: hostOf(url).slice(0, 200), url, kind: kindFromUrl(url) }))
      if (t.due.trim() !== '') task.deadline = t.due.trim()
      return task
    }),
  )
  return plan
}
