// The To Do list: turns tasks, generated daily problems and due reviews into dated items, then
// cuts them into a range and groups them by day. Pure; the data layer feeds it.
import { addDaysISO } from '../../lib/date'
import { cardMinutes, localDate, type ReviewableTask } from '../mastery'

export type TodoRange = 'today' | 'next7' | 'next28' | 'past7' | 'past28'
export const TODO_RANGES: { id: TodoRange; label: string; empty: string }[] = [
  { id: 'today', label: 'Today', empty: 'Nothing due today' },
  { id: 'next7', label: 'Next 7', empty: 'Nothing due in the next 7 days' },
  { id: 'next28', label: 'Next 28', empty: 'Nothing due in the next 28 days' },
  { id: 'past7', label: 'Past 7', empty: 'Nothing was due in the past 7 days' },
  { id: 'past28', label: 'Past 28', empty: 'Nothing was due in the past 28 days' },
]

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
  kind: 'task' | 'practice' | 'review'
  /** Id of the task, generated problem or review card. */
  id: string
  title: string
  planId: string
  planTitle: string
  /** Day the item is listed under. */
  date: string
  /** Lesson, practice, review, project, assessment, milestone, or "daily problem". */
  typeLabel: string
  minutes: number
  done: boolean
  /** Open and dated before today. */
  overdue: boolean
  leetcode?: { slug: string; difficulty: 'easy' | 'medium' | 'hard' }
  /** In-app page of the item, when it has one. */
  href?: string
  /** Completing it asks for a rating (it gets or has a review card). */
  rates: boolean
}

const KIND_RANK = { review: 0, task: 1, practice: 2 }

export interface TodoSource {
  tasks: (TodoTask & { practice?: { provider: string; slug?: string; difficulty: 'easy' | 'medium' | 'hard' } })[]
  problems: TodoProblem[]
  /** Live review cards (not suspended). */
  cards: TodoCard[]
  planTitles: ReadonlyMap<string, string>
  /** Title shown after "Review:" for a card. */
  cardTitle: (c: TodoCard) => string
}

/**
 * Every item that has a day: scheduled tasks (open or done, not skipped), generated problems, and
 * reviews. A review due today or earlier is listed today (like the badge counts it); a later one on
 * its due day. Reviews are never overdue.
 */
export function buildTodoItems(src: TodoSource, today: string): TodoItem[] {
  const planTitle = (id: string) => src.planTitles.get(id) ?? ''
  const items: (TodoItem & { sort: number })[] = []
  for (const t of src.tasks) {
    if (t.status === 'skipped' || !t.scheduledDate) continue
    const lc = t.practice?.provider === 'leetcode' && t.practice.slug ? { slug: t.practice.slug, difficulty: t.practice.difficulty } : undefined
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
      rates: cardMinutes(t) !== undefined,
      sort: t.order,
    })
  }
  for (const p of src.problems) {
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
      leetcode: { slug: p.slug, difficulty: p.difficulty },
      rates: true,
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
      rates: true,
      sort: c.due,
    })
  }
  return items
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.planTitle.localeCompare(b.planTitle) || a.sort - b.sort || a.title.localeCompare(b.title))
    .map(({ sort: _sort, ...item }) => {
      void _sort
      return item
    })
}

/** First and last day (inclusive) a range lists. */
export function rangeBounds(range: TodoRange, today: string): { from: string; to: string } {
  switch (range) {
    case 'today':
      return { from: today, to: today }
    case 'next7':
      return { from: today, to: addDaysISO(today, 6) }
    case 'next28':
      return { from: today, to: addDaysISO(today, 27) }
    case 'past7':
      return { from: addDaysISO(today, -7), to: addDaysISO(today, -1) }
    case 'past28':
      return { from: addDaysISO(today, -28), to: addDaysISO(today, -1) }
  }
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
  /** Open items dated before today, oldest first. Only for the forward ranges. */
  overdue: TodoItem[]
  /** Days with something on them: ascending for forward ranges, newest first for past ones. */
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

/**
 * The list for a range. Forward ranges pin every open overdue item (any age) in `overdue` and list
 * the rest from today; past ranges list what was dated in the window (done and still open), newest
 * day first, with no pinned section.
 */
export function todoView(items: TodoItem[], range: TodoRange, today: string): TodoView {
  const { from, to } = rangeBounds(range, today)
  const past = range === 'past7' || range === 'past28'
  const overdue = past ? [] : items.filter((i) => i.overdue).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const pinned = new Set(overdue.map((i) => i.key))
  const byDay = new Map<string, TodoItem[]>()
  for (const i of items) {
    if (pinned.has(i.key) || i.date < from || i.date > to) continue
    byDay.set(i.date, [...(byDay.get(i.date) ?? []), i])
  }
  const dates = [...byDay.keys()].sort()
  if (past) dates.reverse()
  return { overdue, days: dates.map((date) => ({ date, ...dayLabel(date, today), items: byDay.get(date)! })) }
}
