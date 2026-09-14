// The To Do list: turns tasks, generated daily problems, due reviews, personal to-dos and events into
// dated items, then filters them by the list preferences, cuts them into a range and groups them by
// day. Pure; the data layer feeds it.
import { addDaysISO } from '../../lib/date'
import { weekStartOf, type WeekStart } from '../calendar'
import { localDate, type ReviewableTask } from '../mastery'
import { DEFAULT_PRACTICE_LANGUAGE } from '../plan-format'

export type FromAnchor = 'weeks4' | 'weeks3' | 'weeks2' | 'lastWeek' | 'thisWeek' | 'today'
export type UntilAnchor = 'today' | 'thisWeek' | 'nextWeek' | 'weeks2' | 'weeks3' | 'weeks4'
/** Per-device choices for the To Do list (kept in meta). */
export interface TodoPrefs {
  personal: boolean
  events: boolean
  completed: boolean
  favoriteOnly: boolean
  from: FromAnchor
  until: UntilAnchor
}
export const DEFAULT_TODO_PREFS: TodoPrefs = { personal: true, events: true, completed: true, favoriteOnly: false, from: 'today', until: 'today' }
export const FROM_OPTIONS: { id: FromAnchor; label: string }[] = [
  { id: 'weeks4', label: '4 Weeks Ago' },
  { id: 'weeks3', label: '3 Weeks Ago' },
  { id: 'weeks2', label: '2 Weeks Ago' },
  { id: 'lastWeek', label: 'Last Week' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'today', label: 'Today' },
]
export const UNTIL_OPTIONS: { id: UntilAnchor; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'nextWeek', label: 'Next Week' },
  { id: 'weeks2', label: 'In 2 Weeks' },
  { id: 'weeks3', label: 'In 3 Weeks' },
  { id: 'weeks4', label: 'In 4 Weeks' },
]
const FROM_WEEKS: Record<FromAnchor, number | 'today'> = { weeks4: 4, weeks3: 3, weeks2: 2, lastWeek: 1, thisWeek: 0, today: 'today' }
const UNTIL_WEEKS: Record<UntilAnchor, number | 'today'> = { today: 'today', thisWeek: 0, nextWeek: 1, weeks2: 2, weeks3: 3, weeks4: 4 }

/** Reads stored preferences, falling back to the default for anything missing or malformed. Custom dates saved by older versions are ignored. */
export function parseTodoPrefs(raw: string | undefined): TodoPrefs {
  let o: Record<string, unknown> = {}
  try {
    const v: unknown = raw ? JSON.parse(raw) : {}
    if (v && typeof v === 'object') o = v as Record<string, unknown>
  } catch {
    // damaged value: use the defaults
  }
  const d = DEFAULT_TODO_PREFS
  const bool = (k: 'personal' | 'events' | 'completed' | 'favoriteOnly') => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d[k])
  return {
    personal: bool('personal'),
    events: bool('events'),
    completed: bool('completed'),
    favoriteOnly: bool('favoriteOnly'),
    from: FROM_OPTIONS.some((x) => x.id === o.from) ? (o.from as FromAnchor) : d.from,
    until: UNTIL_OPTIONS.some((x) => x.id === o.until) ? (o.until as UntilAnchor) : d.until,
  }
}

/**
 * First and last day (inclusive) the list shows. Week anchors count from the first day of the week
 * (per the week-start setting): "4 Weeks Ago" is the first day of the week 4 weeks back, "Next Week"
 * the last day of next week.
 */
export function rangeBounds(prefs: TodoPrefs, today: string, weekStartsOn: WeekStart = 'monday'): { from: string; to: string } {
  const ws = weekStartOf(today, weekStartsOn)
  const f = FROM_WEEKS[prefs.from]
  const u = UNTIL_WEEKS[prefs.until]
  return { from: f === 'today' ? today : addDaysISO(ws, -7 * f), to: u === 'today' ? today : addDaysISO(ws, 7 * u + 6) }
}

/** The first day each From option would give and the last day each Until option would give, for the preferences sheet. */
export function optionBounds(prefs: TodoPrefs, today: string, weekStartsOn: WeekStart = 'monday'): { from: Record<FromAnchor, string>; until: Record<UntilAnchor, string> } {
  const from = Object.fromEntries(FROM_OPTIONS.map(({ id }) => [id, rangeBounds({ ...prefs, from: id }, today, weekStartsOn).from]))
  const until = Object.fromEntries(UNTIL_OPTIONS.map(({ id }) => [id, rangeBounds({ ...prefs, until: id }, today, weekStartsOn).to]))
  return { from: from as Record<FromAnchor, string>, until: until as Record<UntilAnchor, string> }
}

/** Drops what the visible-items choices hide. With "Favorite plans only", items of a plan that is not a favorite go (personal to-dos and events stay). */
export function filterTodoItems(items: TodoItem[], prefs: TodoPrefs, favoritePlans: ReadonlySet<string>): TodoItem[] {
  return items.filter(
    (i) =>
      (prefs.personal || i.kind !== 'personal') &&
      (prefs.events || i.kind !== 'event') &&
      (prefs.completed || !i.done) &&
      (!prefs.favoriteOnly || !i.planId || favoritePlans.has(i.planId)),
  )
}

export interface TodoTask extends ReviewableTask {
  id: string
  planId: string
  title: string
  status: 'open' | 'done' | 'skipped'
  scheduledDate?: string
  /** Order inside its module, for a stable list. */
  order: number
}

export interface TodoProblem {
  id: string
  planId: string
  date: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  minutes: number
  status: 'open' | 'done'
}

export interface TodoCard {
  id: string
  planId: string
  taskId?: string
  slug?: string
  due: number
  minutes: number
}

export interface TodoItem {
  /** Unique in the list. */
  key: string
  kind: 'task' | 'practice' | 'review' | 'personal' | 'event'
  /** Id of the task, generated problem, review card, personal to-do or event. */
  id: string
  title: string
  /** Empty for personal to-dos and events. */
  planId: string
  /** The course, for an event. */
  planTitle: string
  /** Day the item is listed under. */
  date: string
  /** Lesson, practice, review, project, assessment, milestone, "daily problem", "To-do" or "Event". */
  typeLabel: string
  minutes: number
  done: boolean
  /** Open and dated before today. */
  overdue: boolean
  leetcode?: { slug: string; difficulty: 'easy' | 'medium' | 'hard'; language: string }
  /** In-app page of the item, when it has one. */
  href?: string
  /** Personal to-dos only: the stored date and minutes (both optional), for the edit form. */
  todo?: { date?: string; minutes?: number }
}

const KIND_RANK = { event: 0, review: 1, task: 2, personal: 3, practice: 4 }

export interface TodoSource {
  tasks: (TodoTask & { practice?: { provider: string; slug?: string; difficulty: 'easy' | 'medium' | 'hard' } })[]
  problems: TodoProblem[]
  /** Live review cards (not suspended). */
  cards: TodoCard[]
  personalTodos?: { id: string; title: string; date?: string; minutes?: number; done: boolean; completedAt?: number }[]
  events?: { id: string; title: string; date: string; course?: string; allDay: boolean; start?: number }[]
  planTitles: ReadonlyMap<string, string>
  /**
   * Plans whose daily practice setting is on, with the language for "Solve in <language>". Generated daily
   * problems of any other plan are left out (switching the setting off hides them); LeetCode tasks written
   * into a plan always show, in `planLanguages`' language.
   */
  practiceLanguages: ReadonlyMap<string, string>
  /** The language of every plan, on or off, for the Solve link of a LeetCode task written into the plan. */
  planLanguages: ReadonlyMap<string, string>
  /** Title shown after "Review:" for a card. */
  cardTitle: (c: TodoCard) => string
}

/**
 * Every item that has a day: scheduled tasks (open or done, not skipped), generated problems,
 * reviews, personal to-dos and events. A review due today or earlier is listed today (like the badge
 * counts it); a later one on its due day. Reviews are never overdue. An undated to-do is listed today
 * (never overdue), and once done on the day it was finished. Events are listed on their first day.
 */
export function buildTodoItems(src: TodoSource, today: string): TodoItem[] {
  const planTitle = (id: string) => src.planTitles.get(id) ?? ''
  const items: (TodoItem & { sort: number })[] = []
  for (const t of src.tasks) {
    if (t.status === 'skipped' || !t.scheduledDate) continue
    const lc = t.practice?.provider === 'leetcode' && t.practice.slug ? { slug: t.practice.slug, difficulty: t.practice.difficulty, language: src.planLanguages.get(t.planId) ?? DEFAULT_PRACTICE_LANGUAGE } : undefined
    items.push({
      key: `task:${t.id}`,
      kind: 'task',
      id: t.id,
      title: t.title,
      planId: t.planId,
      planTitle: planTitle(t.planId),
      date: t.scheduledDate,
      typeLabel: t.type[0]!.toUpperCase() + t.type.slice(1),
      minutes: t.estimatedMinutes,
      done: t.status === 'done',
      overdue: t.status === 'open' && t.scheduledDate < today,
      leetcode: lc,
      href: `/task/${t.id}`,
      sort: t.order,
    })
  }
  for (const p of src.problems) {
    const language = src.practiceLanguages.get(p.planId)
    if (language === undefined) continue
    items.push({
      key: `practice:${p.id}`,
      kind: 'practice',
      id: p.id,
      title: p.title,
      planId: p.planId,
      planTitle: planTitle(p.planId),
      date: p.date,
      typeLabel: 'Daily problem',
      minutes: p.minutes,
      done: p.status === 'done',
      overdue: p.status === 'open' && p.date < today,
      leetcode: { slug: p.slug, difficulty: p.difficulty, language },
      sort: 0,
    })
  }
  for (const c of src.cards) {
    const day = localDate(c.due)
    items.push({
      key: `review:${c.id}`,
      kind: 'review',
      id: c.id,
      title: `Review: ${src.cardTitle(c)}`,
      planId: c.planId,
      planTitle: planTitle(c.planId),
      date: day < today ? today : day,
      typeLabel: 'Review',
      minutes: c.minutes,
      done: false,
      overdue: false,
      href: c.taskId ? `/task/${c.taskId}` : undefined,
      sort: c.due,
    })
  }
  for (const t of src.personalTodos ?? []) {
    items.push({
      key: `personal:${t.id}`,
      kind: 'personal',
      id: t.id,
      title: t.title,
      planId: '',
      planTitle: '',
      date: t.date ?? (t.done && t.completedAt ? localDate(t.completedAt) : today),
      typeLabel: 'To-do',
      minutes: t.minutes ?? 0,
      done: t.done,
      overdue: !t.done && !!t.date && t.date < today,
      todo: { date: t.date, minutes: t.minutes },
      sort: 0,
    })
  }
  for (const e of src.events ?? []) {
    const time = !e.allDay && e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
    items.push({
      key: `event:${e.id}`,
      kind: 'event',
      id: e.id,
      title: e.title,
      planId: '',
      planTitle: e.course ?? '',
      date: e.date,
      typeLabel: time ? `Event, ${time}` : 'Event',
      minutes: 0,
      done: false,
      overdue: false,
      sort: e.start ?? 0,
    })
  }
  return items
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.planTitle.localeCompare(b.planTitle) || a.sort - b.sort || a.title.localeCompare(b.title))
    .map(({ sort: _sort, ...item }) => {
      void _sort
      return item
    })
}

export interface TodoDay {
  date: string
  /** "Today", "Tomorrow", "Yesterday" or the weekday. */
  label: string
  /** "Thu, Nov 12". */
  dateText: string
  items: TodoItem[]
}

export interface TodoView {
  /** Open items dated before today, oldest first. Only when the range includes today. */
  overdue: TodoItem[]
  /** Days with something on them, oldest first. */
  days: TodoDay[]
}

const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

export function dayLabel(date: string, today: string): { label: string; dateText: string } {
  const d = dateOf(date)
  const dateText = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (date === today) return { label: 'Today', dateText }
  if (date === addDaysISO(today, 1)) return { label: 'Tomorrow', dateText }
  if (date === addDaysISO(today, -1)) return { label: 'Yesterday', dateText }
  return { label: d.toLocaleDateString('en-US', { weekday: 'long' }), dateText }
}

/** "Oct 12" in the user's locale, with the year only when it isn't today's year ("Dec 28, 2025"). */
export function shortDate(date: string, today: string): string {
  const withYear = date.slice(0, 4) !== today.slice(0, 4)
  return dateOf(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
}

/**
 * The list for a range of days. When the range includes today, every open overdue item (any age) is
 * pinned in `overdue` and the rest are listed by day; otherwise there is no pinned section.
 */
export function todoView(items: TodoItem[], bounds: { from: string; to: string }, today: string): TodoView {
  const { from, to } = bounds
  const overdue = from <= today && today <= to ? items.filter((i) => i.overdue).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : []
  const pinned = new Set(overdue.map((i) => i.key))
  const byDay = new Map<string, TodoItem[]>()
  for (const i of items) {
    if (pinned.has(i.key) || i.date < from || i.date > to) continue
    byDay.set(i.date, [...(byDay.get(i.date) ?? []), i])
  }
  const dates = [...byDay.keys()].sort()
  return { overdue, days: dates.map((date) => ({ date, ...dayLabel(date, today), items: byDay.get(date)! })) }
}
