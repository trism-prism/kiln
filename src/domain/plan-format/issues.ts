// The problem list a validation returns, and how a problem becomes text.
// Message format (docs/plan-format.md, "Message format"):  <location> "<label>": <message>

export type Severity = 'error' | 'warning'

/**
 * One problem. `path` is where it is (`tasks[13].estimatedMinutes`, `plan`, `row 15`, `input`, `json`);
 * `message` is the full text in the spec format. A warning's display prefix ("warning: ") is added by
 * formatIssue, not stored.
 */
export interface Issue {
  path: string
  message: string
  severity: Severity
}

/** Display text: warnings start with "warning: ". */
export function formatIssue(issue: Issue): string {
  return issue.severity === 'warning' ? `warning: ${issue.message}` : issue.message
}

/** An issue for a place that has no plan object yet (the pasted text, the JSON syntax). */
export function inputIssue(path: 'input' | 'json', text: string, severity: Severity = 'error'): Issue {
  return { path, message: `${path}: ${text}`, severity }
}

export type Segment = string | number

/** Where a problem sits in the plan object. `loc` is the nearest object, `field` the key(s) below it. */
export interface RawIssue {
  severity: Severity
  loc: Segment[]
  field: string
  /** Text after the field name ("is required", `"x" does not match any task id`). */
  rest: string
}

export const LABEL_LENGTH = 40

/** A title cut to LABEL_LENGTH characters, without splitting a surrogate pair. */
export function truncateLabel(title: string): string {
  return [...title].slice(0, LABEL_LENGTH).join('')
}

/** `tasks[13].resources[2]` from ['tasks', 13, 'resources', 2]; 'plan' for the top level. */
export function formatPath(segments: Segment[]): string {
  if (segments.length === 0) return 'plan'
  return segments.map((s, i) => (typeof s === 'number' ? `[${s}]` : i === 0 ? s : `.${s}`)).join('')
}

/** The path of a Zod issue split into the nearest object and the field below it. */
export function splitPath(root: unknown, path: readonly PropertyKey[]): { loc: Segment[]; field: string } {
  const segs = path.map((p) => (typeof p === 'number' ? p : String(p)))
  for (let k = segs.length - 1; k >= 0; k--) {
    const v = valueAt(root, segs.slice(0, k))
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const field = segs
        .slice(k)
        .map((s, i) => (typeof s === 'number' ? `[${s}]` : i === 0 ? s : `.${s}`))
        .join('')
      return { loc: segs.slice(0, k), field }
    }
  }
  return { loc: [], field: segs.join('.') }
}

export function valueAt(root: unknown, segs: readonly Segment[]): unknown {
  let cur = root
  for (const s of segs) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[s]
  }
  return cur
}

/** Default rendering: JSON paths. */
export function renderIssue(raw: RawIssue, root: unknown): Issue {
  const where = formatPath(raw.loc)
  const title = valueAt(valueAt(root, raw.loc), ['title'])
  const label = typeof title === 'string' && title !== '' ? ` "${truncateLabel(title)}"` : ''
  const body = raw.field === '' ? raw.rest : `${raw.field} ${raw.rest}`
  const fieldPath = raw.field === '' || raw.loc.length === 0 ? where : `${where}.${raw.field}`
  return { path: raw.field !== '' && /^[A-Za-z]+$/.test(raw.field) ? fieldPath : where, message: `${where}${label}: ${body}`, severity: raw.severity }
}
