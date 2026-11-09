// The "meaning" pass of validation (docs/plan-format.md, "Validation"): rules that compare several
// fields or several objects. It reads the plan leniently, ignoring any value whose shape is wrong
// (the shape pass reports those), so one run can report both kinds of problem together.
import { addDaysISO, isRealISODate } from '../../lib/date'
import type { RawIssue, Segment } from './issues'
import type { Priority } from './schema'
import { NEETCODE_TOPICS, normalizeTopic } from './topics'

type Obj = Record<string, unknown>

export interface SemanticOptions {
  /** LeetCode slugs Kiln knows (the bundled NeetCode list). Absent: the slug check is skipped. */
  knownSlugs?: ReadonlySet<string>
  /** Ids already imported from earlier parts of a split plan. */
  priorParts?: { tasks: ReadonlyMap<string, Priority>; sources: ReadonlySet<string> }
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const asObj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined)
const day = (v: unknown): string | undefined => {
  const s = str(v)
  return s !== undefined && isRealISODate(s) ? s : undefined
}
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string')
const priorityOf = (v: unknown): Priority => (v === 'recommended' || v === 'optional' ? v : 'core')
const RANK: Record<Priority, number> = { core: 3, recommended: 2, optional: 1 }

export function checkMeaning(root: Obj, opts: SemanticOptions = {}): RawIssue[] {
  const out: RawIssue[] = []
  const err = (loc: Segment[], field: string, rest: string) => out.push({ severity: 'error', loc, field, rest })
  const warn = (loc: Segment[], field: string, rest: string) => out.push({ severity: 'warning', loc, field, rest })

  const mode = root.schedulingMode === 'auto' || root.schedulingMode === 'fixed' ? root.schedulingMode : undefined
  const startDate = day(root.startDate)
  const planDeadline = day(root.deadline)
  const modules = arr(root.modules).map(asObj)
  const tasks = arr(root.tasks).map(asObj)
  const sources = arr(root.sources).map(asObj)
  const partObj = asObj(root.part)
  const partIndex = int(partObj.index)
  const partTotal = int(partObj.total)
  const laterPart = partIndex !== undefined && partIndex > 1
  if (laterPart && sources.length > 0) warn(['sources'], '', 'is ignored in a part after part 1; put every source in part 1')

  // Parts
  if (partIndex !== undefined && partTotal !== undefined && partTotal < partIndex) {
    err(['part'], 'total', `${partTotal} must be at least index (${partIndex})`)
  }

  // Ids: one namespace across modules, tasks and sources
  const used = new Map<string, string>()
  const claim = (kind: string, objs: Obj[]) =>
    objs.forEach((o, i) => {
      const id = str(o.id)
      if (id === undefined) return
      const prev = used.get(id)
      if (prev !== undefined) err([kind, i], 'id', `"${id}" is also used by ${prev}`)
      else used.set(id, `${kind}[${i}]`)
    })
  claim('modules', modules)
  claim('tasks', tasks)
  claim('sources', sources)

  const moduleIds = new Set(modules.flatMap((m) => str(m.id) ?? []))
  const sourceIds = new Set(sources.flatMap((s) => str(s.id) ?? []))
  const linkedSourceIds = new Set(sources.flatMap((s) => (str(s.url) ? (str(s.id) ?? []) : [])))
  let videosWithoutLink = 0
  const taskIndex = new Map<string, number>()
  tasks.forEach((t, i) => {
    const id = str(t.id)
    if (id !== undefined && !taskIndex.has(id)) taskIndex.set(id, i)
  })

  // Module order and notBeforeDay
  const moduleOrderOwner = new Map<number, number>()
  modules.forEach((m, i) => {
    const order = int(m.order)
    if (order === undefined) return
    const prev = moduleOrderOwner.get(order)
    if (prev !== undefined) err(['modules', i], 'order', `${order} is also used by modules[${prev}]`)
    else moduleOrderOwner.set(order, i)
  })
  const moduleNbd = new Map<string, number>()
  const moduleOrder = new Map<string, number>()
  modules.forEach((m) => {
    const id = str(m.id)
    if (id === undefined) return
    const nbd = int(m.notBeforeDay)
    if (nbd !== undefined) moduleNbd.set(id, nbd)
    const order = int(m.order)
    if (order !== undefined) moduleOrder.set(id, order)
  })
  let prevModule: { i: number; nbd: number } | undefined
  modules
    .map((m, i) => ({ i, order: int(m.order), nbd: int(m.notBeforeDay) }))
    .filter((m) => m.order !== undefined)
    .sort((a, b) => (a.order as number) - (b.order as number) || a.i - b.i)
    .forEach((m) => {
      if (m.nbd === undefined) return
      if (prevModule !== undefined && m.nbd < prevModule.nbd) {
        err(['modules', m.i], 'notBeforeDay', `${m.nbd} is earlier than ${prevModule.nbd} on modules[${prevModule.i}]; module notBeforeDay values must not decrease in module order`)
      }
      prevModule = { i: m.i, nbd: m.nbd }
    })

  // Study time plans have no modules or tasks; every other plan needs at least one of each.
  const listOk = (v: unknown) => v === undefined || Array.isArray(v)
  if (root.studyMinutesPerWeek === undefined) {
    if (listOk(root.modules) && modules.length === 0) err([], 'modules', 'must have at least 1 item')
    if (listOk(root.tasks) && tasks.length === 0) err([], 'tasks', 'must have at least 1 item')
  } else {
    if (modules.length > 0) err([], 'modules', 'must be empty in a study time plan')
    if (tasks.length > 0) err([], 'tasks', 'must be empty in a study time plan')
    if (sources.length > 0) err([], 'sources', 'is not allowed in a study time plan')
    if (root.dailyPractice !== undefined) err([], 'dailyPractice', 'is not allowed in a study time plan')
    if (root.part !== undefined) err([], 'part', 'is not allowed in a study time plan')
    if (mode === 'fixed') err([], 'schedulingMode', 'must be "auto" in a study time plan')
  }

  // Mode and plan-level dates
  const anyTaskDate = tasks.some((t) => t.fixedDate !== undefined || t.deadline !== undefined)
  if (mode === 'auto') {
    if (root.startDate !== undefined) err([], 'startDate', 'is not allowed when schedulingMode is "auto"; use "fixed" or set the start date in Kiln after import')
    if (root.deadline !== undefined) err([], 'deadline', 'is not allowed when schedulingMode is "auto"; use "fixed" or set the deadline in Kiln after import')
  } else if (mode === 'fixed') {
    if (root.startDate === undefined) err([], 'startDate', 'is required when schedulingMode is "fixed"')
    if (root.deadline === undefined && !anyTaskDate) {
      err([], 'schedulingMode', 'is "fixed" but the plan has no dates; add a deadline, or a fixedDate or deadline on a task, or use "auto"')
    }
    if (startDate !== undefined && planDeadline !== undefined && planDeadline < startDate) {
      err([], 'deadline', `${planDeadline} is before startDate (${startDate})`)
    }
  }

  // Tasks
  const taskPriority = tasks.map((t) => priorityOf(t.priority))
  const planPos = tasks.map((t) => {
    const mo = moduleOrder.get(str(t.moduleId) ?? '')
    const to = int(t.order)
    return mo === undefined || to === undefined ? undefined : mo * 100000 + to
  })
  const taskOrderOwner = new Map<string, number>()
  const edges: number[][] = tasks.map(() => [])
  const leetcodeSlugs = new Map<string, number>()
  const nbdByModule = new Map<string, { i: number; nbd: number }>()
  const taskTopics = new Set<string>()

  tasks.forEach((t, i) => {
    const loc: Segment[] = ['tasks', i]
    const id = str(t.id)
    const type = str(t.type)
    const moduleId = str(t.moduleId)
    const minutes = int(t.estimatedMinutes)
    const priority = taskPriority[i] as Priority

    for (const topic of strs(t.topics)) taskTopics.add(normalizeTopic(topic))

    // Module reference and order
    if (moduleId !== undefined && !moduleIds.has(moduleId)) err(loc, 'moduleId', `"${moduleId}" does not match any module id`)
    const order = int(t.order)
    if (moduleId !== undefined && order !== undefined) {
      const key = `${moduleId}\u0000${order}`
      const prev = taskOrderOwner.get(key)
      if (prev !== undefined) err(loc, 'order', `${order} is also used by tasks[${prev}] in the same module`)
      else taskOrderOwner.set(key, i)
    }

    // Minutes
    if (minutes !== undefined && type !== undefined) {
      if (type !== 'milestone' && minutes >= 0 && minutes < 5) err(loc, 'estimatedMinutes', 'must be an integer from 5 to 180')
      if (type !== 'assessment' && minutes > 90 && minutes <= 180) {
        warn(loc, 'estimatedMinutes', `is ${minutes}; split work over 90 minutes into sessions`)
      }
    }

    // notBeforeDay
    const nbd = int(t.notBeforeDay)
    if (nbd !== undefined && t.fixedDate !== undefined) err(loc, 'notBeforeDay', 'cannot be set together with fixedDate')
    const modNbd = moduleId === undefined ? undefined : moduleNbd.get(moduleId)
    if (nbd !== undefined && modNbd !== undefined && nbd < modNbd) {
      err(loc, 'notBeforeDay', `${nbd} is earlier than its module's notBeforeDay (${modNbd})`)
    }
    if (nbd !== undefined && moduleId !== undefined && planPos[i] !== undefined) {
      const prev = nbdByModule.get(moduleId)
      if (prev !== undefined && nbd < prev.nbd) {
        warn(loc, 'notBeforeDay', `${nbd} is earlier than ${prev.nbd} on tasks[${prev.i}]; values should not decrease within a module`)
      }
      nbdByModule.set(moduleId, { i, nbd })
    }

    // Dates in auto mode
    if (mode === 'auto') {
      if (t.fixedDate !== undefined) err(loc, 'fixedDate', 'is not allowed when schedulingMode is "auto"; use "fixed" or pin the date in Kiln after import')
      if (t.deadline !== undefined) err(loc, 'deadline', 'is not allowed when schedulingMode is "auto"; use "fixed" or set the deadline in Kiln after import')
    }

    // Practice
    const practice = isObj(t.practice) ? t.practice : undefined
    if (t.practice !== undefined && type !== undefined && type !== 'practice' && type !== 'assessment') {
      err(loc, 'practice', 'is only allowed on practice and assessment tasks')
    }
    if (practice !== undefined) {
      const provider = str(practice.provider)
      const slug = str(practice.slug)
      if (provider === 'leetcode' && slug === undefined) err([...loc, 'practice'], 'slug', 'is required when provider is "leetcode"')
      if (provider === 'other' && practice.url === undefined) err([...loc, 'practice'], 'url', 'is required when provider is "other"')
      if (provider === 'leetcode' && slug !== undefined) {
        const prev = leetcodeSlugs.get(slug)
        if (prev !== undefined) {
          warn([...loc, 'practice'], 'slug', `"${slug}" is already used by tasks[${prev}]; re-solves come from spaced review, not duplicate tasks`)
        } else {
          leetcodeSlugs.set(slug, i)
          if (opts.knownSlugs !== undefined && !opts.knownSlugs.has(slug)) {
            warn([...loc, 'practice'], 'slug', `"${slug}" is not in Kiln's problem list; check that it is the official LeetCode slug`)
          }
        }
      }
    }

    // Resources
    let requiredMinutes = 0
    arr(t.resources).forEach((r, j) => {
      const res = asObj(r)
      const rloc: Segment[] = [...loc, 'resources', j]
      if (int(res.minutes) === undefined && res.minutes === undefined) warn(rloc, 'minutes', 'is missing; add it so Kiln can total study time')
      if (res.required !== false) requiredMinutes += int(res.minutes) ?? 0
      const rSource = str(res.sourceId)
      if (res.kind === 'video' && !str(res.url) && !(rSource !== undefined && (linkedSourceIds.has(rSource) || !sourceIds.has(rSource)))) videosWithoutLink++ // a source from an earlier part is not checked
      const sourceId = str(res.sourceId)
      if (sourceId !== undefined && !sourceIds.has(sourceId) && !opts.priorParts?.sources.has(sourceId)) {
        if (laterPart && opts.priorParts === undefined) warn(rloc, 'sourceId', `"${sourceId}" is not in this file; it must be in part 1`)
        else err(rloc, 'sourceId', `"${sourceId}" does not match any source id`)
      }
    })
    if (minutes !== undefined && requiredMinutes > minutes) {
      warn(loc, 'resources', `required resource minutes add up to ${requiredMinutes}, more than estimatedMinutes (${minutes})`)
    }

    // Completeness warnings
    if (type === 'lesson') {
      for (const f of ['objectives', 'verificationQuestions', 'resources', 'topics']) {
        if (arr(t[f]).length === 0) warn(loc, f, 'is empty')
      }
    }
    if (type === 'practice' || type === 'assessment') {
      if (t.description === undefined) warn(loc, 'description', 'is missing')
      if (arr(t.topics).length === 0) warn(loc, 'topics', 'is empty')
    }

    // Dependencies
    const seen = new Set<string>()
    arr(t.dependsOn).forEach((d, k) => {
      if (typeof d !== 'string') return
      const field = `dependsOn[${k}]`
      if (d === id) return err(loc, field, `"${d}" is the task itself`)
      if (seen.has(d)) return warn(loc, field, `"${d}" is listed twice and was deduplicated`)
      seen.add(d)
      let depPriority: Priority | undefined
      const idx = taskIndex.get(d)
      if (idx !== undefined) {
        depPriority = taskPriority[idx]
        edges[i]?.push(idx)
        const a = planPos[i]
        const b = planPos[idx]
        if (a !== undefined && b !== undefined && b > a) warn(loc, field, `"${d}" comes later in plan order than this task`)
      } else if (opts.priorParts?.tasks.has(d)) {
        depPriority = opts.priorParts.tasks.get(d)
      } else if (moduleIds.has(d)) {
        return err(loc, field, `"${d}" is a module id; dependsOn takes task ids`)
      } else if (laterPart && opts.priorParts === undefined) {
        return warn(loc, field, `"${d}" is not in this file; it must be in an earlier part`)
      } else {
        return err(loc, field, `"${d}" does not match any task id`)
      }
      if (depPriority !== undefined && RANK[depPriority] < RANK[priority]) {
        err(loc, field, `"${d}" is ${depPriority} but this task is ${priority}; a task may only depend on tasks of equal or higher priority`)
      }
    })
  })

  // Dependency cycles
  const color = new Array<number>(tasks.length).fill(0)
  const stack: number[] = []
  const reported = new Set<string>()
  const visit = (u: number) => {
    color[u] = 1
    stack.push(u)
    for (const v of edges[u] ?? []) {
      if (color[v] === 0) visit(v)
      else if (color[v] === 1) {
        const cycle = stack.slice(stack.indexOf(v))
        const start = cycle.indexOf(Math.min(...cycle))
        const ring = [...cycle.slice(start), ...cycle.slice(0, start)]
        const key = ring.join(',')
        if (reported.has(key)) continue
        reported.add(key)
        const ids = ring.map((n) => str(tasks[n]?.id) ?? `tasks[${n}]`)
        err(['tasks', ring[0] as number], 'dependsOn', `creates a cycle: ${[...ids, ids[0]].join(' -> ')}`)
      }
    }
    stack.pop()
    color[u] = 2
  }
  for (let u = 0; u < tasks.length; u++) if (color[u] === 0) visit(u)

  // Fixed-mode date rules
  if (mode === 'fixed' && startDate !== undefined) {
    const fixedOf = tasks.map((t) => day(t.fixedDate))
    tasks.forEach((t, i) => {
      const loc: Segment[] = ['tasks', i]
      const fixed = fixedOf[i]
      const deadline = day(t.deadline)
      const moduleId = str(t.moduleId)
      for (const [name, value] of [['fixedDate', fixed], ['deadline', deadline]] as const) {
        if (value === undefined) continue
        if (value < startDate) err(loc, name, `${value} is before startDate (${startDate})`)
        if (planDeadline !== undefined && value > planDeadline) err(loc, name, `${value} is after the plan deadline (${planDeadline})`)
      }
      if (fixed !== undefined && deadline !== undefined && fixed > deadline) {
        err(loc, 'fixedDate', `${fixed} is after the task's deadline (${deadline})`)
      }
      if (fixed !== undefined) {
        arr(t.dependsOn).forEach((d, k) => {
          const idx = typeof d === 'string' ? taskIndex.get(d) : undefined
          const dep = idx === undefined ? undefined : fixedOf[idx]
          if (dep !== undefined && fixed < dep) err(loc, `dependsOn[${k}]`, `"${d as string}" is pinned to ${dep}, after this task's fixedDate (${fixed})`)
        })
      }
      // Earliest possible day from notBeforeDay (task's or its module's, whichever is later)
      const nbd = int(t.notBeforeDay)
      const modNbd = moduleId === undefined ? undefined : moduleNbd.get(moduleId)
      const earliestNbd = Math.max(nbd ?? 1, modNbd ?? 1)
      if (deadline !== undefined && earliestNbd > 1) {
        const earliest = addDaysISO(startDate, earliestNbd - 1)
        if (earliest > deadline) err(loc, 'deadline', `${deadline} is before the task's earliest possible day (${earliest}, from notBeforeDay ${earliestNbd})`)
      }
      if (fixed !== undefined && modNbd !== undefined && modNbd > 1) {
        const earliest = addDaysISO(startDate, modNbd - 1)
        if (fixed < earliest) err(loc, 'fixedDate', `${fixed} is before its module's earliest day (${earliest}, from the module's notBeforeDay ${modNbd})`)
      }
    })
  }

  // Empty modules
  modules.forEach((m, i) => {
    const id = str(m.id)
    if (id !== undefined && !tasks.some((t) => t.moduleId === id)) warn(['modules', i], '', 'has no tasks and will be ignored')
  })

  // dailyPractice
  const daily = asObj(root.dailyPractice)
  if (daily.source === 'neetcode' && ![...taskTopics].some((t) => (NEETCODE_TOPICS as readonly string[]).includes(t))) {
    warn(['dailyPractice'], 'source', 'is "neetcode" but no task topic matches a NeetCode topic, so daily problems cannot follow the lessons')
  }

  if (videosWithoutLink > 0) {
    warn([], '', videosWithoutLink === 1 ? '1 video has no link, so there is nothing to open for it. You can add a link later by editing the plan.' : `${videosWithoutLink} videos have no link, so there is nothing to open for them. You can add links later by editing the plan.`)
  }

  return out
}
