// Quick add: one task per line, turned into the builder's draft modules. Pure, so the line syntax is
// unit tested on its own. The draft still goes through buildPlan and validatePlan like any plan.
import type { Priority, Resource } from '../../domain/plan-format'
import { addDaysISO, isRealISODate, weekdayIndex } from '../../lib/date'
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
// "mon", "tues", "monday": any start of the full name, at least three letters.
const FULL_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Index in `full` of a word that is a prefix of the full name, at least three letters. */
const nameIndex = (word: string, full: string[]) => (word.length >= 3 ? full.findIndex((f) => f.startsWith(word)) : -1)

/** The next such weekday after today (1 to 7 days ahead). */
function nextWeekday(today: string, index: number): string {
  return addDaysISO(today, ((index - weekdayIndex(today) + 6) % 7) + 1)
}

/** "nov 20": this year, or next year once the day has passed. */
function monthDay(today: string, month: number, day: number): string | undefined {
  const year = Number(today.slice(0, 4))
  const iso = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // Up to 8 years ahead, so feb 29 finds the next leap year.
  for (let y = year; y <= year + 8; y++) if (isRealISODate(iso(y)) && iso(y) >= today) return iso(y)
  return undefined
}

/** One task line: "Read chapter 3 45m fri ! https://..." -> its fields; the words left over are the title. */
export function parseLine(line: string, today: string): ParsedLine {
  const words = line.replace(/^\s*(?:[-*+]|[0-9]+[.)])\s+/, '').trim().split(/\s+/).filter((w) => w !== '')
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
    // All capitals is an acronym ("SAT prep"), and "sat" / "sun" are ordinary words: not days.
    else if (nameIndex(lower, FULL_WEEKDAYS) >= 0 && w !== w.toUpperCase() && lower !== 'sat' && lower !== 'sun') out.due = nextWeekday(today, nameIndex(lower, FULL_WEEKDAYS))
    else if (nameIndex(lower, FULL_MONTHS) >= 0 && /^[0-9]{1,2}$/.test(clean(words[i + 1] ?? ''))) {
      const due = monthDay(today, nameIndex(lower, FULL_MONTHS), Number(clean(words[i + 1]!)))
      if (due) {
        out.due = due
        i++
      } else rest.push(raw)
    } else rest.push(raw)
  }
  if (total !== undefined) out.minutes = String(Math.round(total))
  out.title = rest.join(' ') || (out.links[0] ? hostOf(out.links[0]) : '')
  return out
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The text with every line repeated `times` times; `{n}` becomes 1, 2, 3... in each copy. */
export function expandRepeat(text: string, times: number): string {
  if (times <= 1) return text.replaceAll('{n}', '1')
  return Array.from({ length: Math.min(times, MAX_REPEAT) }, (_, k) => text.replaceAll('{n}', String(k + 1))).join('\n')
}

/**
 * The draft modules for the text. Lines starting with # or ## start a module; tasks before the
 * first heading go into "Tasks". A task's uid is its line text plus how often that text came
 * before, so edits made in the preview stay on their row while other lines change.
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
      title: p.title,
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
