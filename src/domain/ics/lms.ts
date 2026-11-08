// LMS calendar items -> Kiln: which items are assignments, exams or class times, which course each
// belongs to, minute defaults by keyword, and one plan file per course. Pure.
import { validatePlan, type Issue, type Plan, type TaskType } from '../plan-format'
import { dayIn, type IcsEvent } from './parse'

export type ItemKind = 'assignment' | 'exam' | 'event'

export interface CalendarItem {
  uid: string
  /** Title without the course tag. */
  title: string
  /** Course code or name; OTHER_COURSE when none is found. */
  course: string
  kind: ItemKind
  event: IcsEvent
}

export const OTHER_COURSE = 'Other calendar items'

const EXAM = /\b(exam|exams|midterm|midterms)\b/i
// An assignment named like a test ("Test 4", "Final Exam"), but not "Final Paper" or "Test Corrections".
const EXAM_LIKE = /\b(exam|exams|midterm|midterms|test|tests|final|finals)\b/i
const NOT_EXAM = /\b(project|paper|essay|presentation|reflection|report|draft|corrections?|review|outline)\b/i
export const examLike = (title: string) => EXAM_LIKE.test(title) && !NOT_EXAM.test(title)
const ASSIGNMENT_WORDS =
  /\b(due|assignment|assignments|homework|hw|quiz|quizzes|essay|paper|project|lab|problem set|pset|worksheet|reading|discussion|submit|submission|report)\b/i
// "CS 101", "MATH-221", "BIO101L": letters, optional space or dash, digits.
const CODE = /^[A-Z]{2,6}[ -]?[0-9]{2,4}[A-Z]?(?:[ -][0-9A-Z]{1,4})*$/

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Course and the title without its course tag. Canvas puts the course code in a trailing `[CODE]`. */
export function courseOf(ev: IcsEvent): { course: string; title: string } {
  const tag = /^(.*?)\s*\[([^\]]{1,120})\]\s*$/.exec(ev.summary)
  if (tag?.[1] && tag[2]) return { course: tag[2].trim(), title: tag[1].trim() }
  // Heuristics for other LMSs: Moodle puts the course short name in CATEGORIES; some feeds start
  // the title with the code ("CS 101: Lab 2") or put it in LOCATION.
  const cat = ev.categories[0]
  if (cat) return { course: cat.slice(0, 120), title: ev.summary }
  const lead = /^([A-Z]{2,6}[ -]?[0-9]{2,4}[A-Z]?)\s*[:\-–]\s+(.+)$/.exec(ev.summary)
  if (lead?.[1] && lead[2]) return { course: lead[1], title: lead[2] }
  if (ev.location && CODE.test(ev.location.trim())) return { course: ev.location.trim(), title: ev.summary }
  return { course: OTHER_COURSE, title: ev.summary }
}

/** A course tag without its section group: "COB300A (Section 02 Fall 2026)" is "COB300A". For display and default plan titles; ids keep the raw tag. */
export const courseName = (raw: string) => raw.replace(/\s*\((?:section|sec\.?)\s[^)]*\)\s*$/i, '').trim() || raw

/** Assignment, exam or class time. Canvas marks assignments in the UID; other LMSs by keyword or a zero-length (due-time) event. */
export function kindOf(ev: IcsEvent, title: string): ItemKind {
  // The Canvas UID says what the item is, whatever its title: "Midterm Reflection Essay" stays an assignment.
  if (/^event-assignment-/i.test(ev.uid)) return 'assignment'
  if (EXAM.test(title)) return 'exam'
  if (/^event-calendar-event-/i.test(ev.uid)) return 'event'
  if (ASSIGNMENT_WORDS.test(title) || /assign|submission|attempt|quiz/i.test(ev.uid)) return 'assignment'
  if (!ev.allDay && ev.start === ev.end) return 'assignment'
  return 'event'
}

export function classify(events: IcsEvent[]): CalendarItem[] {
  return events.map((event) => {
    const { course, title } = courseOf(event)
    return { uid: event.uid, title: title.slice(0, 120) || '(untitled)', course, kind: kindOf(event, title), event }
  })
}

// Minute defaults by keyword, first match wins.
const MINUTES: [RegExp, number, TaskType][] = [
  [EXAM, 180, 'assessment'],
  [/\bprojects?\b/i, 240, 'project'],
  [/\b(essay|essays|paper|papers)\b/i, 180, 'project'],
  [/\blabs?\b/i, 90, 'practice'],
  [/\b(quiz|quizzes)\b/i, 30, 'assessment'],
  [/\b(discussion|discussions|forum)\b/i, 30, 'practice'],
  [/\b(homework|hw|problem sets?|psets?|worksheet)\b/i, 60, 'practice'],
  [/\b(reading|readings|read|chapter|chapters)\b/i, 60, 'lesson'],
]

export function defaultMinutes(title: string, exam = true): { minutes: number; type: TaskType } {
  const hit = MINUTES.find(([re]) => (exam || re !== EXAM) && re.test(title))
  return hit ? { minutes: hit[1], type: hit[2] } : { minutes: 60, type: 'practice' }
}

/** FNV-1a 32-bit, as 8 hex digits. */
export function shortHash(s: string): string {
  return fnv(s, 0x811c9dc5)
}

function fnv(s: string, seed: number): string {
  let h = seed
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Stable task id for a calendar UID, so re-importing matches it. */
export const taskKey = (uid: string) => `a-${fnv(uid, 0x811c9dc5)}${fnv(uid, 0x050c5d1f)}`

/** Stable plan id for a course. */
export function courseKey(course: string): string {
  // Plain upper-case codes ("MATH-221-001") keep the bare slug. Anything else (other case, spaces,
  // a name cut at 40 characters) gets a hash of the raw name, so "MATH 101" and "MATH-101", or two
  // long names that share a start, stay separate plans.
  const plain = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(course) && course.length <= 40
  const slug = course
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `course-${plain && slug ? slug : slug ? `${slug}-${shortHash(course)}` : shortHash(course)}`
}

/** One line of the review grid: an assignment, or the prep for an exam. */
export interface TaskRow {
  uid: string
  key: string
  course: string
  title: string
  minutes: number
  /** Day the work must be done by. */
  due: string
  type: TaskType
  url?: string
  /** The prep row of an exam. */
  prep?: boolean
  /** The feed marks the item as completed (STATUS:COMPLETED, COMPLETED or PERCENT-COMPLETE:100). */
  completed?: boolean
  /** Import as already done: one task, status done, no completion time (so it never counts toward a streak). */
  done?: boolean
}

/** The day an item is due: an assignment on the local day of its due time (all-day: that day; exactly midnight: the day before); others on their day. */
export function dueOf(it: CalendarItem): string {
  const ev = it.event
  if (it.kind !== 'assignment' || ev.allDay) return ev.date
  return dayIn((ev.end ?? ev.start ?? 0) - 1, ev.tz)
}

/**
 * Work items for the grid, due on `dueOf`. An exam, and an assignment named like one ("Test 4"), get a
 * "Prepare for" row due the day before (180 minutes, so two 90-minute sessions); such an assignment
 * also keeps its own row, the test itself.
 */
export function taskRows(items: CalendarItem[]): TaskRow[] {
  const rows: TaskRow[] = []
  for (const it of items) {
    if (it.kind === 'event') continue
    const base = { uid: it.uid, course: it.course, url: it.event.url, ...(it.event.completed ? { completed: true } : {}) }
    const due = dueOf(it)
    const test = it.kind === 'exam' || examLike(it.title)
    if (it.kind === 'assignment') {
      const d = test ? { minutes: 60, type: 'assessment' as const } : defaultMinutes(it.title, false)
      rows.push({ ...base, key: taskKey(it.uid), title: it.title, minutes: d.minutes, due, type: d.type })
    }
    if (test) rows.push({ ...base, key: taskKey(`${it.uid}#prep`), title: `Prepare for ${it.title}`.slice(0, 120), minutes: 180, due: addDays(due, -1), type: 'practice', prep: true })
  }
  return rows.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
}

/** Items that go on the calendar as events (class times and exams). */
export const eventItems = (items: CalendarItem[]) => items.filter((it) => it.kind !== 'assignment')

const SESSION = 90

/**
 * Task ids a row becomes: work over 90 minutes (except assessments) is split into sessions of at
 * most 90 (the plan format's guideline), `key`, `key-2`, ...
 */
export function sessions(row: Pick<TaskRow, 'key' | 'title' | 'minutes' | 'type'>): { id: string; title: string; minutes: number }[] {
  const n = row.type === 'assessment' ? 1 : Math.max(1, Math.ceil(row.minutes / SESSION))
  const each = Math.max(5, Math.min(180, Math.round(row.minutes / n)))
  if (n === 1) return [{ id: row.key, title: row.title, minutes: each }]
  return Array.from({ length: n }, (_, i) => {
    const suffix = ` (session ${i + 1} of ${n})`
    return { id: i === 0 ? row.key : `${row.key}-${i + 1}`, title: row.title.slice(0, 120 - suffix.length) + suffix, minutes: each }
  })
}

/**
 * A plan file for one course: fixed mode, one "Assignments" module, a task per session (one for a
 * done row) with the row's due day as its deadline, in due order. Returns the validation issues if the file is invalid.
 */
export function coursePlan(course: string, rows: TaskRow[], startDate: string, title = courseName(course)): { plan?: Plan; issues: Issue[] } {
  const tasks = rows.flatMap((r) =>
    (r.done ? [{ id: r.key, title: r.title, minutes: Math.max(5, Math.min(180, r.minutes)) }] : sessions(r)).map((s) => ({
      id: s.id,
      moduleId: 'assignments',
      title: s.title,
      type: r.type,
      estimatedMinutes: s.minutes,
      deadline: r.due,
      ...(r.url ? { resources: [{ title: 'Open in your course', url: r.url, kind: 'other' as const }] } : {}),
    })),
  )
  const input = {
    schemaVersion: 1,
    id: courseKey(course),
    title: title.slice(0, 120),
    subject: course.slice(0, 120),
    schedulingMode: 'fixed',
    startDate,
    modules: [{ id: 'assignments', title: 'Assignments', order: 1 }],
    tasks: tasks.map((t, i) => ({ ...t, order: i + 1 })),
  }
  const res = validatePlan(input)
  return { plan: res.plan, issues: res.issues.filter((i) => i.severity === 'error') }
}

/** Courses in first-seen order: their assignments and exams (`total`) and those due `today` or later (`due`). */
export function courses(items: CalendarItem[], today: string): { course: string; total: number; due: number }[] {
  const m = new Map<string, { course: string; total: number; due: number }>()
  for (const it of items) {
    const c = m.get(it.course) ?? { course: it.course, total: 0, due: 0 }
    if (it.kind !== 'event') {
      c.total++
      if (dueOf(it) >= today) c.due++
    }
    m.set(it.course, c)
  }
  return [...m.values()]
}
