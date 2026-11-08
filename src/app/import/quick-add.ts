// Quick add: one task per line, turned into the builder's draft modules. Pure, so the line syntax is
// unit tested on its own. The draft still goes through buildPlan and validatePlan like any plan.
import type { Priority, Resource } from '../../domain/plan-format'
import { addDaysISO, isRealISODate } from '../../lib/date'
import { isMonthName, parseDateText } from '../../lib/date-parse'
import type { DraftModule, DraftTask } from './builder'

export const DEFAULT_MINUTES = '30'
export const MAX_REPEAT = 52

export interface ParsedLine {
  title: string
  /** Whole minutes as text, or undefined when the line gives none. */
  minutes?: string
  /** yyyy-mm-dd. */
  due?: string
  priority?: Priority
  links: string[]
}

// "45m", "1h30m", "1.5h", "2hrs": one token; "1 h 30 m" is two tokens each (a number, then a unit word).
const HOUR = 'h|hr|hrs|hour|hours'
const MINUTE = 'm|min|mins|minute|minutes'
const DURATION = new RegExp(`^(?:([0-9]+(?:[.][0-9]+)?)(?:${HOUR}))?(?:([0-9]+(?:[.][0-9]+)?)(?:${MINUTE}))?$`)
const NUMBER = /^[0-9]+(?:\.[0-9]+)?$/
const UNIT = new RegExp(`^(?:(${HOUR})|(?:${MINUTE}))$`)

/** The token without trailing . , ; : and without a ")" that has no "(" before it. */
function clean(word: string): string {
  let w = word
  for (;;) {
    const next = w.replace(/[.,;:]+$/, '')
    const unmatched = next.endsWith(')') && next.split(')').length > next.split('(').length
    const out = unmatched ? next.slice(0, -1) : next
    if (out === w) return w
    w = out
  }
}
// Quick add reads only month and weekday names, so the locale's numeric order never matters.
const readDate = (text: string, today: string) => parseDateText(text, today, 'en-US')
const BULLET = /^\s*(?:[-*+]|[0-9]+[.)])\s+/

/** One task line: "Read chapter 3 45m fri ! https://..." -> its fields; the words left over are the title. */
export function parseLine(line: string, today: string): ParsedLine {
  const words = line.replace(BULLET, '').trim().split(/\s+/).filter((w) => w !== '')
  const out: ParsedLine = { title: '', links: [] }
  const rest: string[] = []
  // Every duration on the line adds up: "1h 30m" is 90.
  let total: number | undefined
  const addMinutes = (m: number) => (total = (total ?? 0) + m)
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!
    const w = clean(raw) || raw
    const lower = w.toLowerCase()
    const duration = DURATION.exec(lower)
    const unit = NUMBER.test(lower) ? UNIT.exec(clean(words[i + 1] ?? '').toLowerCase()) : null
    if (/^https?:\/\//i.test(w)) out.links.push(w)
    else if (w === '!') out.priority = 'core'
    else if (w === '?') out.priority = 'optional'
    else if (unit) {
      addMinutes(Number(lower) * (unit[1] ? 60 : 1))
      i++
    } else if (duration && (duration[1] || duration[2])) addMinutes(Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0))
    else if (lower === 'today') out.due = today
    else if (lower === 'tomorrow') out.due = addDaysISO(today, 1)
    else if (isRealISODate(w)) out.due = w
    // A weekday: the next one after today. All capitals is an acronym ("SAT prep"), and "sat" / "sun" are ordinary words.
    else if (/^[a-z]{3,}$/.test(lower) && w !== w.toUpperCase() && lower !== 'sat' && lower !== 'sun' && lower !== 'yesterday' && readDate(lower, today))
      out.due = readDate(lower, today)
    // "nov 20", or "nov 20 2027" with a year from last year to 10 years ahead; any other number stays
    // in the title ("Essay nov 20 2000 words").
    else if (isMonthName(lower) && /^[0-9]{1,2}$/.test(clean(words[i + 1] ?? ''))) {
      const day = clean(words[i + 1]!)
      const year = clean(words[i + 2] ?? '')
      const thisYear = Number(today.slice(0, 4))
      const typed = /^[0-9]{4}$/.test(year) && Number(year) >= thisYear - 1 && Number(year) <= thisYear + 10
      const due = readDate(`${lower} ${day}${typed ? ` ${year}` : ''}`, today)
      if (due) {
        out.due = due
        i += typed ? 2 : 1
      } else rest.push(raw)
    } else rest.push(raw)
  }
  if (total !== undefined) out.minutes = String(Math.round(total))
  out.title = rest.join(' ') || (out.links[0] ? hostOf(out.links[0]) : '')
  return out
}

/** Minutes as people type them: "30", "45m", "1h", "1h30", "1h 30m", "1.5 hours". Undefined for anything else. */
export function parseStudyMinutes(text: string): number | undefined {
  const t = text.trim()
  if (/^[0-9]+$/.test(t)) return Number(t)
  // "1h30": hours, then bare minutes.
  const hm = /^([0-9]+)\s*h\s*([0-9]{1,2})$/i.exec(t)
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) * 60 + Number(hm[2]) : undefined
  // Quick add reads durations; the text must be nothing but a duration.
  const p = parseLine(t, '2000-01-01')
  return p.title === '' && p.minutes !== undefined && !p.due && !p.priority && p.links.length === 0 ? Number(p.minutes) : undefined
}

const WEEK_MARKER = /\s*(?:\b(?:a|per|each|every)\s+week|\/\s*(?:week|wk)|\bweekly)\s*$/i

/**
 * A study time line: a subject and a time per week, "Psychology 3h a week", "Spanish 2h weekly", "Biology 3h/week".
 * The rest of the line must be a title and minutes only (no day, ! or ?, or link); a leading "study" is dropped.
 * Undefined for any other line (it is a task line). `error` says why the time can't be used (outside 15 min to 40 h).
 */
export function parseStudyLine(line: string): StudyLine | undefined {
  const body = line.replace(BULLET, '').trim()
  if (!WEEK_MARKER.test(body)) return undefined
  const p = parseLine(body.replace(WEEK_MARKER, ''), '2000-01-01')
  if (p.minutes === undefined || p.due || p.priority || p.links.length > 0) return undefined
  const subject = p.title.replace(/^study\s+/i, '').trim()
  if (subject === '' || /^study$/i.test(subject)) return undefined
  const minutesPerWeek = Number(p.minutes)
  const error = studyTimeError(minutesPerWeek)
  return error ? { subject, minutesPerWeek, error } : { subject, minutesPerWeek }
}

export interface StudyLine {
  subject: string
  minutesPerWeek: number
  error?: string
}

/** A study time plan takes 15 minutes to 40 hours a week. The error for other times, or ''. */
export function studyTimeError(minutes: number): string {
  if (minutes < 15) return 'At least 15 min, like 3h or 90m'
  if (minutes > 2400) return 'Up to 40 h a week'
  return ''
}

/** "psychology" -> "Psychology": a plan title from a typed subject (the subject itself stays as typed). */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * The line with each standalone 1 ("Week 1", "chapter 1.") made `n`. A 1 stays when it is part of a date or
 * time ("nov 1", "1 nov", "1 pm"), a duration ("1 hour") or a count ("Part 1 of 3", "1 / 3"); "1h", "1st",
 * "1.5", "10" and "1-20" are other words.
 */
function countUp(line: string, n: number): string {
  // Words at even indexes, the whitespace between them at odd ones.
  const parts = line.split(/(\s+)/)
  const word = (i: number) => clean(parts[i] ?? '').toLowerCase()
  const keep = (i: number) =>
    isMonthName(word(i - 2)) ||
    isMonthName(word(i + 2)) ||
    UNIT.test(word(i + 2)) ||
    /^(?:am|pm|a\.m|p\.m)$/.test(word(i + 2)) ||
    ['of', '/'].includes(word(i - 2)) ||
    ['of', '/'].includes(word(i + 2))
  return parts.map((p, i) => (i % 2 === 0 && clean(p) === '1' && !keep(i) ? String(n) + p.slice(1) : p)).join('')
}

/** The text repeated `times` times; in copy n, any standalone 1 and any `{n}` become n. */
export function expandRepeat(text: string, times: number): string {
  if (times <= 1) return text.replaceAll('{n}', '1')
  const copy = (n: number) =>
    text
      .replaceAll('{n}', String(n))
      .split(/\r?\n/)
      .map((line) => countUp(line, n))
      .join('\n')
  return Array.from({ length: Math.min(times, MAX_REPEAT) }, (_, k) => copy(k + 1)).join('\n')
}

/**
 * The draft modules for the text. Lines starting with # or ## start a module; tasks before the
 * first heading go into "Tasks". A task's uid is its line text plus how often that text came
 * before ("Read#2"), so edits made in the preview stay on their row while other lines change.
 * Identical lines can't be told apart, so `keptEdits` drops their edits when their number changes.
 */
export function parseQuickAdd(text: string, today: string, times = 1): DraftModule[] {
  const modules: DraftModule[] = []
  const seen = new Map<string, number>()
  for (const raw of expandRepeat(text, times).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    if (/^#{1,3}\s/.test(line)) {
      modules.push({ uid: `m${modules.length + 1}`, title: line.replace(/^#+\s+/, ''), tasks: [] })
      continue
    }
    if (modules.length === 0) modules.push({ uid: 'm0', title: 'Tasks', tasks: [] })
    const n = (seen.get(line) ?? 0) + 1
    seen.set(line, n)
    const p = parseLine(line, today)
    const task: DraftTask = {
      uid: `${line}#${n}`,
      // A line of only a date, minutes or "!" keeps its text as the title, so no row is blank.
      title: p.title || line.replace(BULLET, ''),
      type: 'lesson',
      minutes: p.minutes ?? DEFAULT_MINUTES,
      priority: p.priority ?? 'core',
      due: p.due ?? '',
      links: p.links.join(' '),
    }
    modules[modules.length - 1]!.tasks.push(task)
  }
  return modules.filter((m) => m.tasks.length > 0)
}

// Resource kind from the link's domain. Flashcard sites are "tool": the plan format has no flashcards kind.
const KINDS: [Resource['kind'], string[]][] = [
  ['video', ['youtube.com', 'youtu.be', 'vimeo.com']],
  ['course', ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org']],
  ['problem', ['leetcode.com', 'hackerrank.com', 'codewars.com', 'neetcode.io']],
  ['tool', ['quizlet.com', 'ankiweb.net', 'github.com', 'replit.com']],
  ['docs', ['developer.mozilla.org', 'readthedocs.io']],
  ['article', ['wikipedia.org', 'medium.com', 'dev.to']],
]

export function kindFromUrl(url: string): Resource['kind'] {
  const host = hostOf(url).toLowerCase()
  if (host.startsWith('docs.')) return 'docs'
  return KINDS.find(([, domains]) => domains.some((d) => host === d || host.endsWith(`.${d}`)))?.[0] ?? 'other'
}

/** The modules with every due date before today cleared (a plan cannot start in the past), and how many were cleared. */
export function dropPastDue(modules: DraftModule[], today: string): { modules: DraftModule[]; dropped: number } {
  let dropped = 0
  const out = modules.map((m) => ({
    ...m,
    tasks: m.tasks.map((t) => {
      if (t.due === '' || t.due >= today) return t
      dropped++
      return { ...t, due: '' }
    }),
  }))
  return { modules: out, dropped }
}

/** How many lines of each text, from the uids ("Read#2" is the second "Read"). */
function copies(modules: DraftModule[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of modules.flatMap((m) => m.tasks)) {
    const text = t.uid.slice(0, t.uid.lastIndexOf('#'))
    out.set(text, (out.get(text) ?? 0) + 1)
  }
  return out
}

/**
 * The table edits that still belong to a row after the text changes from `before` to `after`. An edit goes
 * when its line is gone (`changed`), and when the number of lines with its text changes (`recounted`):
 * identical lines can't be told apart, so no row ever shows an edit made on another.
 */
export function keptEdits<T>(
  edits: Record<string, T>,
  before: DraftModule[],
  after: DraftModule[],
): { edits: Record<string, T>; changed: number; recounted: number } {
  const [was, now] = [copies(before), copies(after)]
  const live = new Set(after.flatMap((m) => m.tasks.map((t) => t.uid)))
  const kept: [string, T][] = []
  let [changed, recounted] = [0, 0]
  for (const [uid, edit] of Object.entries(edits)) {
    const text = uid.slice(0, uid.lastIndexOf('#'))
    // A text that is gone altogether is a changed line, not a recount.
    if (now.has(text) && was.get(text) !== now.get(text)) recounted++
    else if (!live.has(uid)) changed++
    else kept.push([uid, edit])
  }
  return { edits: Object.fromEntries(kept), changed, recounted }
}

/**
 * Whether the text is a study time line. `study`: its only line is one (a Study time plan). `mixed`: a study line
 * (as typed) sits among other lines, which can't go in one plan. Undefined: no study line, a task list.
 */
export function readStudyText(text: string): { study: StudyLine } | { mixed: string } | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const first = lines.find((l) => parseStudyLine(l))
  if (!first) return undefined
  return lines.length === 1 ? { study: parseStudyLine(first)! } : { mixed: first }
}
