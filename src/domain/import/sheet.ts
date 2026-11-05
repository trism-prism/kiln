// Sheet import (docs/plan-import.md): rows of cells -> plan JSON -> the same validation as a JSON file,
// with problem locations shown as spreadsheet rows (the header is row 1).
import { parseCsv } from './csv'
import {
  collectIssues,
  LABEL_LENGTH,
  renderIssue,
  MAX_ISSUES,
  type Issue,
  type RawIssue,
  type SemanticOptions,
  type ValidationResult,
} from '../plan-format'

/** What a sheet cannot carry: the plan-level row. The caller (the import screen) supplies it. */
export interface SheetPlanInfo {
  title: string
  /** Default: made from the title. */
  id?: string
  goal?: string
  /** Used only when the sheet has dates (fixed mode). */
  startDate?: string
}

export const COLUMNS = [
  'moduleId', 'moduleTitle', 'moduleOrder', 'moduleSummary', 'moduleNotBeforeDay',
  'id', 'order', 'title', 'type', 'estimatedMinutes', 'priority', 'topics', 'description',
  'objectives', 'keyConcepts', 'tradeoffs', 'verificationQuestions', 'resources',
  'practiceProvider', 'practiceSlug', 'practiceUrl', 'practiceTitle', 'practiceDifficulty',
  'dependsOn', 'notBeforeDay', 'fixedDate', 'deadline',
] as const
type Column = (typeof COLUMNS)[number]

const REQUIRED_COLUMNS: Column[] = ['moduleId', 'id', 'title', 'type', 'estimatedMinutes']

const MODULE_FIELDS = [
  ['moduleTitle', 'title'],
  ['moduleOrder', 'order'],
  ['moduleSummary', 'summary'],
  ['moduleNotBeforeDay', 'notBeforeDay'],
] as const

type Obj = Record<string, unknown>

/** True when the first line of pasted text holds the required column headers. */
export function looksLikeSheet(text: string): boolean {
  const first = text.trimStart().split('\n', 1)[0] ?? ''
  const headers = (parseCsv(first)[0] ?? []).map((h) => h.trim().toLowerCase())
  return REQUIRED_COLUMNS.every((c) => headers.includes(c.toLowerCase()))
}

/** Pasted sheet text or the content of a .csv file. */
export function importSheetText(text: string, info: SheetPlanInfo, opts: SemanticOptions = {}): ValidationResult {
  return importSheetRows(parseCsv(text), info, opts)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')

const num = (s: string | undefined): number | string | undefined => (s !== undefined && /^-?[0-9]+$/.test(s) ? Number(s) : s)
const list = (s: string | undefined): string[] | undefined => {
  const items = s?.split(' | ').map((x) => x.trim()).filter((x) => x !== '')
  return items === undefined || items.length === 0 ? undefined : items
}
const put = (o: Obj, key: string, value: unknown) => {
  if (value !== undefined) o[key] = value
}

interface SheetIssue {
  row: number
  issue: Issue
}

/** Rows of cells (first row = header) to a plan; `rows` come from parseCsv or an XLSX sheet. */
export function importSheetRows(rows: string[][], info: SheetPlanInfo, opts: SemanticOptions = {}): ValidationResult {
  const found: SheetIssue[] = []
  const add = (row: number, severity: Issue['severity'], label: string, message: string) => {
    const where = label === '' ? `row ${row}` : `row ${row} "${label.slice(0, LABEL_LENGTH)}"`
    found.push({ row, issue: { path: `row ${row}`, message: `${where}: ${message}`, severity } })
  }

  // Header
  const columnAt = new Map<Column, number>()
  ;(rows[0] ?? []).forEach((h, i) => {
    const name = COLUMNS.find((c) => c.toLowerCase() === h.trim().toLowerCase())
    if (name === undefined) {
      if (h.trim() !== '') add(1, 'warning', '', `column "${h.trim()}" is not a known column and was ignored`)
    } else if (!columnAt.has(name)) columnAt.set(name, i)
  })
  const missing = REQUIRED_COLUMNS.filter((c) => !columnAt.has(c))
  for (const c of missing) add(1, 'error', '', `required column "${c}" is missing`)
  if (missing.length > 0) return { issues: found.map((f) => f.issue) }

  // Rows
  const modules = new Map<string, { row: number; fields: Obj }>()
  const moduleRows: number[] = []
  const tasks: Obj[] = []
  const taskRows: number[] = []
  const perModule = new Map<string, number>()
  let dated = false

  rows.slice(1).forEach((cells, r) => {
    const row = r + 2
    const get = (c: Column): string | undefined => {
      const i = columnAt.get(c)
      const v = i === undefined ? '' : (cells[i] ?? '').trim()
      return v === '' ? undefined : v
    }
    if (cells.every((c) => c.trim() === '')) return
    const title = get('title') ?? ''
    const problem = (message: string) => add(row, 'error', title, message)

    // Module: the first row defines it; later rows may repeat it but not change it.
    const moduleId = get('moduleId')
    if (moduleId !== undefined) {
      let m = modules.get(moduleId)
      if (m === undefined) {
        m = { row, fields: { id: moduleId } }
        modules.set(moduleId, m)
        moduleRows.push(row)
      }
      for (const [column, field] of MODULE_FIELDS) {
        const raw = get(column)
        if (raw === undefined) continue
        const value = field === 'order' || field === 'notBeforeDay' ? num(raw) : raw
        if (m.fields[field] === undefined) m.fields[field] = value
        else if (m.fields[field] !== value) problem(`${column} "${raw}" differs from "${String(m.fields[field])}" on row ${m.row}`)
      }
    }

    // Task
    const task: Obj = {}
    const count = (perModule.get(moduleId ?? '') ?? 0) + 1
    perModule.set(moduleId ?? '', count)
    put(task, 'id', get('id'))
    put(task, 'moduleId', moduleId)
    task.order = num(get('order')) ?? count
    put(task, 'title', title === '' ? undefined : title)
    put(task, 'type', get('type')?.toLowerCase())
    put(task, 'estimatedMinutes', num(get('estimatedMinutes')))
    put(task, 'priority', get('priority')?.toLowerCase())
    put(task, 'topics', list(get('topics')))
    put(task, 'description', get('description'))
    for (const c of ['objectives', 'keyConcepts', 'tradeoffs', 'verificationQuestions'] as const) put(task, c, list(get(c)))

    const resources = (list(get('resources')) ?? []).map((item, k): Obj => {
      const f = item.split(/\s+;(?=\s|$)/).map((x) => x.trim())
      if (f.length > 6) problem(`resources item ${k + 1}: has ${f.length} fields; the most is 6 (title ; url ; kind ; minutes ; section ; required)`)
      const res: Obj = {}
      put(res, 'title', f[0] || undefined)
      put(res, 'url', f[1] || undefined)
      put(res, 'kind', f[2]?.toLowerCase() || undefined)
      put(res, 'minutes', num(f[3] || undefined))
      put(res, 'section', f[4] || undefined)
      const required = f[5]?.toLowerCase()
      if (required === 'yes' || required === 'true') res.required = true
      else if (required === 'no' || required === 'false') res.required = false
      else if (required) problem(`resources item ${k + 1}: required must be yes or no`)
      return res
    })
    if (resources.length > 0) task.resources = resources

    const provider = get('practiceProvider')?.toLowerCase()
    if (provider !== undefined) {
      const practice: Obj = { provider }
      put(practice, 'slug', get('practiceSlug'))
      put(practice, 'url', get('practiceUrl'))
      practice.title = get('practiceTitle') ?? title
      put(practice, 'difficulty', get('practiceDifficulty')?.toLowerCase())
      task.practice = practice
    } else if (['practiceSlug', 'practiceUrl', 'practiceTitle', 'practiceDifficulty'].some((c) => get(c as Column) !== undefined)) {
      problem('practiceProvider is required when other practice columns are filled')
    }

    put(task, 'dependsOn', list(get('dependsOn')))
    put(task, 'notBeforeDay', num(get('notBeforeDay')))
    put(task, 'fixedDate', get('fixedDate'))
    put(task, 'deadline', get('deadline'))
    dated ||= task.fixedDate !== undefined || task.deadline !== undefined
    tasks.push(task)
    taskRows.push(row)
  })

  // Plan object: any date in the sheet makes it a fixed-mode plan
  const moduleList = [...modules.values()].map((m, i) => ({ ...m.fields, order: m.fields.order ?? i + 1 }))
  const plan: Obj = { schemaVersion: 1, id: info.id ?? (slug(info.title) || 'plan'), title: info.title }
  put(plan, 'goal', info.goal)
  plan.schedulingMode = dated ? 'fixed' : 'auto'
  if (dated) put(plan, 'startDate', info.startDate)
  plan.modules = moduleList
  plan.tasks = tasks

  // Validate, then show locations as rows
  const { issues, root, plan: parsed } = collectIssues(plan, opts)
  for (const raw of issues) found.push(toRow(raw, root as { tasks: Obj[]; modules: Obj[] }, taskRows, moduleRows))
  found.sort((a, b) => a.row - b.row)
  const hasError = found.some((f) => f.issue.severity === 'error')
  const rendered = found.slice(0, MAX_ISSUES).map((f) => f.issue)
  return parsed && !hasError ? { plan: parsed, issues: rendered } : { issues: rendered }
}

const MODULE_COLUMN: Record<string, string> = {
  id: 'moduleId', title: 'moduleTitle', order: 'moduleOrder', summary: 'moduleSummary', notBeforeDay: 'moduleNotBeforeDay',
}

function toRow(
  raw: RawIssue,
  root: { tasks: Obj[]; modules: Obj[] },
  taskRows: number[],
  moduleRows: number[],
): SheetIssue {
  const [kind, index, sub, subIndex] = raw.loc
  if (kind !== 'tasks' && kind !== 'modules') return { row: 0, issue: renderIssue(raw, root) }

  let field = raw.field
  let prefix = ''
  if (kind === 'modules') field = MODULE_COLUMN[field] ?? field
  else if (sub === 'resources') prefix = `resources item ${Number(subIndex) + 1}: `
  else if (sub === 'practice') field = `practice${field.charAt(0).toUpperCase()}${field.slice(1)}`
  field = field.replace(/\[([0-9]+)\]/g, (_m, n: string) => ` item ${Number(n) + 1}`)

  const row = (kind === 'tasks' ? taskRows : moduleRows)[index as number] ?? 0
  const title = root[kind][index as number]?.title
  const label = typeof title === 'string' && title !== '' ? ` "${title.slice(0, LABEL_LENGTH)}"` : ''
  const body = field === '' ? raw.rest : `${field} ${raw.rest}`
  const message = `row ${row}${label}: ${prefix}${body}`
  return { row, issue: { path: `row ${row}`, message, severity: raw.severity } }
}
