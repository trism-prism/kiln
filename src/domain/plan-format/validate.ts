// validatePlan: the whole check of a plan file (docs/plan-format.md, "Validation").
// Steps: find and parse the JSON -> clean it (trim, null and "" mean absent, topics normalized,
// unknown fields dropped with a warning) -> shape pass (Zod) -> meaning pass (checkMeaning).
// All problems come back together in file order, capped at 100; the plan only when there are no errors.
import { extractPlanJson, parsePlanJson } from './extract'
import { renderIssue, splitPath, valueAt, type Issue, type RawIssue, type Segment } from './issues'
import {
  dailyPracticeSchema,
  moduleSchema,
  partSchema,
  planSchema,
  practiceSchema,
  resourceSchema,
  sourceSchema,
  taskSchema,
  type Plan,
} from './schema'
import { checkMeaning, type SemanticOptions } from './semantic'
import { normalizeTopic } from './topics'

export const MAX_ISSUES = 100

export interface ValidationResult {
  plan?: Plan
  issues: Issue[]
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const SCHEMAS = {
  plan: planSchema,
  source: sourceSchema,
  dailyPractice: dailyPracticeSchema,
  part: partSchema,
  module: moduleSchema,
  task: taskSchema,
  resource: resourceSchema,
  practice: practiceSchema,
}
type Kind = keyof typeof SCHEMAS

/** Fields that hold objects: the kind of object, and whether the field is a list of them. */
const CHILDREN: Partial<Record<Kind, Record<string, [Kind, boolean]>>> = {
  plan: {
    sources: ['source', true],
    dailyPractice: ['dailyPractice', false],
    part: ['part', false],
    modules: ['module', true],
    tasks: ['task', true],
  },
  task: { resources: ['resource', true], practice: ['practice', false] },
}

/**
 * The plan object as the checks should see it: strings trimmed, null and empty strings removed,
 * topics normalized, unknown fields dropped. Dropped fields are added to `warnings`.
 */
function clean(value: unknown, kind: Kind, loc: Segment[], warnings: RawIssue[]): unknown {
  if (!isObj(value)) return value
  const known = Object.keys(SCHEMAS[kind].shape)
  const out: Obj = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!known.includes(key)) {
      const rest = /^total[A-Z]/.test(key) ? 'is derived by Kiln and was ignored' : 'is not a known field and was dropped'
      warnings.push({ severity: 'warning', loc, field: key, rest })
      continue
    }
    const v = typeof raw === 'string' ? raw.trim() : raw
    if (v === null || v === '') continue
    const child = CHILDREN[kind]?.[key]
    if (child === undefined) {
      // List items: trimmed; empty and null items are dropped.
      out[key] = Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '' && x !== null) : v
    } else if (child[1]) {
      out[key] = Array.isArray(v) ? v.map((x, i) => clean(x, child[0], [...loc, key, i], warnings)) : v
    } else {
      out[key] = clean(v, child[0], [...loc, key], warnings)
    }
    if (kind === 'task' && key === 'topics' && Array.isArray(out[key])) {
      // A topic that normalizes to nothing is dropped; topics that collide are kept once.
      const topics = (out[key] as unknown[]).map((t) => (typeof t === 'string' ? normalizeTopic(t) : t))
      out[key] = [...new Set(topics.filter((t) => t !== ''))]
    }
  }
  return out
}

/** A Zod issue as a RawIssue, in the spec's wording. */
function fromZod(path: readonly PropertyKey[], message: string, root: unknown): RawIssue {
  const { loc, field } = splitPath(root, path)
  let rest = message
  if (field === 'schemaVersion') {
    const v = valueAt(root, path as Segment[])
    if (typeof v === 'number' && v > 1) rest = `is ${v}; this plan was made for a newer version of Kiln`
  }
  if (field === 'estimatedMinutes' && loc[0] === 'tasks' && valueAt(valueAt(root, loc), ['type']) !== 'milestone') {
    rest = rest.replace('from 0 to', 'from 5 to')
  }
  return { severity: 'error', loc, field, rest }
}

/** The kind of object at a location, to know its schema key order. */
function kindAt(loc: Segment[]): Kind | undefined {
  const [a, , b] = loc
  if (loc.length === 0) return 'plan'
  if (a === 'tasks' && loc.length === 4 && b === 'resources') return 'resource'
  if (a === 'tasks' && loc.length === 3 && b === 'practice') return 'practice'
  if (loc.length === 2 && (a === 'tasks' || a === 'modules' || a === 'sources')) return a === 'tasks' ? 'task' : a === 'modules' ? 'module' : 'source'
  if (loc.length === 1 && (a === 'dailyPractice' || a === 'part')) return a
  return undefined
}

/**
 * Where an issue sits in the file, as numbers to compare: key position or list index at each step,
 * then the field's position and a trailing list index. A missing field sorts at the place its
 * schema position would have in the object (just after the nearest present field before it).
 */
function fileOrder(input: unknown, issue: RawIssue): number[] {
  const out: number[] = []
  let cur = input
  for (const seg of issue.loc) {
    out.push(typeof seg === 'number' ? seg : isObj(cur) ? Object.keys(cur).indexOf(seg) : -1)
    cur = isObj(cur) || Array.isArray(cur) ? (cur as Obj)[seg] : undefined
  }
  const name = issue.field.split(/[.[]/)[0] ?? ''
  const keys = isObj(cur) ? Object.keys(cur) : []
  let pos = keys.indexOf(name)
  if (pos < 0) {
    const kind = kindAt(issue.loc)
    const order = kind === undefined ? [] : Object.keys(SCHEMAS[kind].shape)
    const at = order.indexOf(name)
    pos = -0.5
    keys.forEach((k, i) => {
      const before = order.indexOf(k)
      if (before >= 0 && before < at) pos = i + 0.5
    })
  }
  out.push(pos)
  const index = /\[([0-9]+)\]$/.exec(issue.field)
  if (index?.[1] !== undefined) out.push(Number(index[1]))
  return out
}

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number)
  return a.length - b.length
}

export interface CollectedIssues {
  /** Every problem in file order, not capped. */
  issues: RawIssue[]
  /** The cleaned object the issues' locations refer to. */
  root: unknown
  plan?: Plan
}

/** Both passes on an already parsed value. Sheet import reuses this and renders locations as rows. */
export function collectIssues(input: unknown, opts: SemanticOptions = {}): CollectedIssues {
  const dropped: RawIssue[] = []
  const root = clean(input, 'plan', [], dropped)
  const parsed = planSchema.safeParse(root)
  const shape = parsed.success ? [] : parsed.error.issues.map((i) => fromZod(i.path, i.message, root))
  const meaning = isObj(root) ? checkMeaning(root, opts) : []
  const issues = [...dropped, ...shape, ...meaning]
    .map((issue) => ({ issue, at: fileOrder(input, issue) }))
    .sort((a, b) => compare(a.at, b.at))
    .map((x) => x.issue)
  const ok = parsed.success && !issues.some((i) => i.severity === 'error')
  if (!ok) return { issues, root }
  const tasks = parsed.data.tasks.map((t) => ({ ...t, dependsOn: [...new Set(t.dependsOn)] }))
  return { issues, root, plan: { ...parsed.data, tasks } }
}

/**
 * Checks a plan: the text of a file (Markdown with a JSON block, or raw JSON) or an already parsed
 * object. `plan` is set only when there are no errors.
 */
export function validatePlan(input: string | unknown, opts: SemanticOptions = {}): ValidationResult {
  let value = input
  if (typeof input === 'string') {
    const found = extractPlanJson(input)
    if (!found.ok) return { issues: [found.issue] }
    const parsed = parsePlanJson(found.json, found.line)
    if (!parsed.ok) return { issues: [parsed.issue] }
    value = parsed.value
  }
  const { issues, root, plan } = collectIssues(value, opts)
  const rendered = issues.slice(0, MAX_ISSUES).map((i) => renderIssue(i, root))
  return plan ? { plan, issues: rendered } : { issues: rendered }
}
