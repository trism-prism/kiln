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

const DURATION = /^(?:([0-9]+)h)?(?:([0-9]+)m(?:in)?)?$/
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
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const lower = w.toLowerCase()
    const duration = DURATION.exec(lower)
    if (/^https?:\/\//i.test(w)) out.links.push(w)
    else if (w === '!') out.priority = 'core'
    else if (w === '?') out.priority = 'optional'
    else if (duration && (duration[1] || duration[2])) out.minutes = String(Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0))
    else if (lower === 'today') out.due = today
    else if (lower === 'tomorrow') out.due = addDaysISO(today, 1)
    else if (isRealISODate(w)) out.due = w
    // All capitals is an acronym ("SAT prep"), and "sat" / "sun" are ordinary words: not days.
    else if (nameIndex(lower, FULL_WEEKDAYS) >= 0 && w !== w.toUpperCase() && lower !== 'sat' && lower !== 'sun') out.due = nextWeekday(today, nameIndex(lower, FULL_WEEKDAYS))
    else if (nameIndex(lower, FULL_MONTHS) >= 0 && /^[0-9]{1,2}$/.test(words[i + 1] ?? '')) {
      const due = monthDay(today, nameIndex(lower, FULL_MONTHS), Number(words[i + 1]))
      if (due) {
        out.due = due
        i++
      } else rest.push(w)
    } else rest.push(w)
  }
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
    if (line.startsWith('#')) {
      modules.push({ uid: `m${modules.length + 1}`, title: line.replace(/^#+\s*/, ''), tasks: [] })
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
