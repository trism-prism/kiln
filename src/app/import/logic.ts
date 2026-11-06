// The import screen's logic without React: detecting what was pasted, validating it with the
// context of the stored plans, deciding how it matches a stored plan, and summarizing it.
// Spec: docs/plan-import.md.
import { getPlanByKey, listPlans, listTasks, type KilnDB, type PlanRecord } from '../../data'
import { importSheetText, looksLikeSheet, type SheetPlanInfo } from '../../domain/import'
import {
  extractPlanJson,
  inputIssue,
  MAX_INPUT_CHARS,
  parsePlanJson,
  validatePlan,
  type Issue,
  type Plan,
  type Priority,
  type SemanticOptions,
  type ValidationResult,
} from '../../domain/plan-format'
import { NEETCODE_SLUGS } from '../../domain/practice'
import { buildPlan, type Draft } from './builder'

export const FILE_TYPES = ['.md', '.txt', '.json', '.csv', '.xlsx']

/** Lowercase slug for a plan id: letters, digits and hyphens, at most 64 characters. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

// Same pattern as the plan format's id (src/domain/plan-format/schema.ts ID_PATTERN).
export const isValidId = (id: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)

export type Input =
  | { kind: 'text'; text: string; fileName?: string }
  | { kind: 'xlsx'; data: ArrayBuffer; fileName: string }
  | { kind: 'build'; draft: Draft }

export type Detected = 'json' | 'sheet'

/** Sheet or JSON block: by file type when there is one, otherwise by the header line. */
export function detect(input: Input): Detected {
  if (input.kind === 'xlsx') return 'sheet'
  if (input.kind === 'build') return 'json'
  if (input.fileName?.toLowerCase().endsWith('.csv')) return 'sheet'
  return looksLikeSheet(input.text) ? 'sheet' : 'json'
}

/** The fields the import screen asks for besides the file. */
export interface Details {
  /** Sheets: the plan title. */
  title: string
  /** Sheets and hand-built plans: the plan id. Empty: made from the title. */
  id: string
  goal: string
  startDate: string
  deadline: string
}

/** The id and part a JSON plan declares, read before validation so the stored plan can be looked up. */
export function peekJson(text: string): { id?: string; part?: { index: number; total: number } } {
  const found = extractPlanJson(text)
  if (!found.ok) return {}
  const parsed = parsePlanJson(found.json, found.line)
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) return {}
  const v = parsed.value as { id?: unknown; part?: { index?: unknown; total?: unknown } }
  const part = v.part
  return {
    id: typeof v.id === 'string' ? v.id.trim() : undefined,
    part: typeof part?.index === 'number' && typeof part.total === 'number' ? { index: part.index, total: part.total } : undefined,
  }
}

export interface Analysis {
  detected: Detected
  result: ValidationResult
  /** The stored plan with the id the file declares. */
  existing?: PlanRecord
  /** Task ids (keys) already stored for `existing`. */
  existingTaskKeys: Set<string>
  /** Every stored plan id, to keep a copy's id free. */
  keys: Set<string>
}

/** The id a sheet or hand-built plan gets: the edited id, else one made from the title. */
export const effectiveId = (d: Pick<Details, 'id' | 'title'>) => d.id.trim() || slugify(d.title) || 'plan'

/** Validates the input with the stored plans as context (earlier parts for a later part). */
export async function analyze(db: KilnDB, input: Input, d: Details): Promise<Analysis> {
  const detected = detect(input)
  const title = input.kind === 'build' ? input.draft.title : d.title
  const id = effectiveId({ id: d.id, title })
  const sheetInfo: SheetPlanInfo = {
    title: d.title.trim() || 'Untitled',
    id,
    goal: d.goal.trim() || undefined,
    startDate: d.startDate || undefined,
  }
  const peek = input.kind === 'text' && detected === 'json' ? peekJson(input.text) : {}
  const key = peek.id ?? (input.kind === 'build' || detected === 'sheet' ? id : undefined)
  const existing = key ? await getPlanByKey(db, key) : undefined
  const keys = new Set((await listPlans(db)).map((p) => p.key))
  const stored = existing ? await listTasks(db, existing.id) : []

  const opts: SemanticOptions = { knownSlugs: NEETCODE_SLUGS }
  if (existing && (peek.part?.index ?? 1) > 1) {
    opts.priorParts = {
      tasks: new Map<string, Priority>(stored.map((t) => [t.key, t.priority])),
      sources: new Set(existing.sources.map((s) => s.id)),
    }
  }

  let result: ValidationResult
  if (input.kind === 'build') {
    result = validatePlan(buildPlan(input.draft, { id, goal: d.goal, startDate: d.startDate }), opts)
  } else if (input.kind === 'xlsx') {
    // Loaded on demand: the xlsx package stays out of the main bundle.
    const { importXlsx } = await import('../../domain/import/xlsx')
    result = importXlsx(input.data, sheetInfo, opts)
  } else if (detected === 'sheet') {
    result = importSheetText(input.text, sheetInfo, opts)
  } else {
    result = validatePlan(input.text, opts)
  }
  return { detected, result, existing, existingTaskKeys: new Set(stored.map((t) => t.key)), keys }
}

export function splitIssues(issues: Issue[]) {
  return { errors: issues.filter((i) => i.severity === 'error'), warnings: issues.filter((i) => i.severity === 'warning') }
}

/** A file that is too large, before reading it. */
export function fileSizeIssue(size: number): Issue | undefined {
  return size > MAX_INPUT_CHARS ? inputIssue('input', 'file is larger than 5 MB') : undefined
}

export type Choice = 'update' | 'copy'

export interface Match {
  kind: 'new' | 'update' | 'copy' | 'part' | 'blocked'
  /** Which choices the user gets (empty: the match is decided). */
  choices: Choice[]
  /** Text for the match step. */
  label: string
}

/** How a validated plan relates to the stored plan with the same id (docs/plan-import.md, step 5). */
export function decideMatch(plan: Plan, existing: PlanRecord | undefined, choice: Choice): Match {
  const part = plan.part
  const index = part?.index ?? 1
  if (!existing) {
    if (index > 1) {
      return {
        kind: 'blocked',
        choices: [],
        label: `This is part ${index} of ${part?.total ?? index}, but no plan "${plan.id}" is in Kiln yet. Import part 1 first.`,
      }
    }
    return { kind: 'new', choices: [], label: 'New plan' }
  }
  if (index > 1) {
    return existing.partsIn.includes(index)
      ? { kind: 'update', choices: [], label: `Update part ${index} of ${part?.total} in "${existing.title}" (progress is kept)` }
      : { kind: 'part', choices: [], label: `Add part ${index} of ${part?.total} to "${existing.title}"` }
  }
  return { kind: choice, choices: ['update', 'copy'], label: `A plan with the id "${plan.id}" is already in Kiln` }
}

export interface Summary {
  modules: number
  tasks: number
  totalMinutes: number
  minutesByPriority: Record<Priority, number>
}

export function summarize(plan: Plan): Summary {
  const minutesByPriority: Record<Priority, number> = { core: 0, recommended: 0, optional: 0 }
  let totalMinutes = 0
  for (const t of plan.tasks) {
    minutesByPriority[t.priority] += t.estimatedMinutes
    totalMinutes += t.estimatedMinutes
  }
  return { modules: plan.modules.length, tasks: plan.tasks.length, totalMinutes, minutesByPriority }
}

export const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} h`
