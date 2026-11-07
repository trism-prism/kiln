import { describe, expect, it } from 'vitest'
import { buildTodoItems, dayLabel, rangeBounds, todoView, type TodoCard, type TodoProblem, type TodoSource, type TodoTask } from './index'

const TODAY = '2026-11-11' // a Wednesday
const at = (day: number, h = 12) => new Date(2026, 10, day, h).getTime()

const task = (id: string, scheduledDate: string | undefined, over: Partial<TodoTask> = {}): TodoSource['tasks'][number] => ({
  id,
  planId: 'p1',
  title: `Task ${id}`,
  status: 'open',
  scheduledDate,
  type: 'lesson',
  estimatedMinutes: 60,
  order: Number(id.replace(/\D/g, '')) || 0,
  ...over,
})
const problem = (id: string, date: string, over: Partial<TodoProblem> = {}): TodoProblem => ({
  id,
  planId: 'p1',
  date,
  slug: `slug-${id}`,
  title: `Problem ${id}`,
  difficulty: 'easy',
  minutes: 25,
  status: 'open',
  ...over,
})
const card = (id: string, due: number, over: Partial<TodoCard> = {}): TodoCard => ({ id, planId: 'p1', taskId: 't1', due, minutes: 10, ...over })

const build = (tasks: TodoSource['tasks'], problems: TodoProblem[] = [], cards: TodoCard[] = [], practiceLanguages: TodoSource['practiceLanguages'] = new Map([['p1', 'Python']])) =>
  buildTodoItems({ tasks, problems, cards, planTitles: new Map([['p1', 'DSA']]), practiceLanguages, cardTitle: (c) => (c.taskId ? `Task ${c.taskId}` : (c.slug ?? '')) }, TODAY)

describe('buildTodoItems', () => {
  it('lists generated daily problems only for plans with daily practice on, in the language of that plan', () => {
    const lcTask = task('t1', TODAY, { practice: { provider: 'leetcode', slug: 'two-sum', difficulty: 'easy' } })
    const off = build([lcTask], [problem('a', TODAY)], [], new Map())
    expect(off.map((i) => i.kind)).toEqual(['task'])
    expect(off[0]?.leetcode).toBeDefined() // a LeetCode task written into the plan keeps its Solve link
    const on = build([], [problem('a', TODAY)], [], new Map([['p1', 'Go']]))
    expect(on[0]).toMatchObject({ kind: 'practice', leetcode: { language: 'Go' } })
  })

  it('lists scheduled open and done tasks, not skipped or undated ones', () => {
    const items = build([task('t1', TODAY), task('t2', TODAY, { status: 'done' }), task('t3', TODAY, { status: 'skipped' }), task('t4', undefined)])
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ['t1', false],
      ['t2', true],
    ])
  })

  it('marks open items dated before today overdue, done ones not', () => {
    const items = build([task('t1', '2026-11-09'), task('t2', '2026-11-09', { status: 'done' }), task('t3', TODAY)], [problem('a', '2026-11-10')])
    expect(Object.fromEntries(items.map((i) => [i.id, i.overdue]))).toEqual({ t1: true, t2: false, t3: false, a: true })
  })

  it('lists reviews due today or earlier under today, later ones on their day, never overdue', () => {
    const items = build([], [], [card('c1', at(5)), card('c2', at(11, 9)), card('c3', at(14))])
    expect(items.map((i) => [i.id, i.date, i.overdue])).toEqual([
      ['c1', TODAY, false],
      ['c2', TODAY, false],
      ['c3', '2026-11-14', false],
    ])
    expect(items[0]).toMatchObject({ title: 'Review: Task t1', kind: 'review', href: '/task/t1', rates: true })
  })

  it('asks for a rating only where a review card exists or will', () => {
    const items = build([task('t1', TODAY), task('t2', TODAY, { type: 'milestone' }), task('t3', TODAY, { type: 'practice', practice: { provider: 'leetcode', slug: 'two-sum', difficulty: 'easy' } })], [problem('a', TODAY)])
    expect(Object.fromEntries(items.map((i) => [i.id, i.rates]))).toEqual({ t1: true, t2: false, t3: true, a: true })
    expect(items.find((i) => i.id === 't3')?.leetcode).toEqual({ slug: 'two-sum', difficulty: 'easy', language: 'Python' })
    expect(items.find((i) => i.id === 'a')).toMatchObject({ kind: 'practice', leetcode: { slug: 'slug-a', difficulty: 'easy', language: 'Python' } })
  })

  it('orders reviews, then tasks in plan order, then daily problems', () => {
    const items = build([task('t2', TODAY), task('t1', TODAY)], [problem('a', TODAY)], [card('c1', at(11))])
    expect(items.map((i) => i.id)).toEqual(['c1', 't1', 't2', 'a'])
  })
})

describe('rangeBounds', () => {
  it.each([
    ['today', '2026-11-11', '2026-11-11'],
    ['next7', '2026-11-11', '2026-11-17'],
    ['next28', '2026-11-11', '2026-12-08'],
    ['past7', '2026-11-04', '2026-11-10'],
    ['past28', '2026-10-14', '2026-11-10'],
  ] as const)('%s', (range, from, to) => expect(rangeBounds(range, TODAY)).toEqual({ from, to }))
})

describe('dayLabel', () => {
  it('names today, tomorrow, yesterday, then the weekday', () => {
    expect(dayLabel(TODAY, TODAY)).toEqual({ label: 'Today', dateText: 'Wed, Nov 11' })
    expect(dayLabel('2026-11-12', TODAY).label).toBe('Tomorrow')
    expect(dayLabel('2026-11-10', TODAY).label).toBe('Yesterday')
    expect(dayLabel('2026-11-14', TODAY)).toEqual({ label: 'Saturday', dateText: 'Sat, Nov 14' })
  })
})

describe('todoView', () => {
  const items = build(
    [
      task('t1', '2026-10-01'), // overdue long ago
      task('t2', '2026-11-09'), // overdue
      task('t3', '2026-11-09', { status: 'done' }), // done in the past
      task('t4', TODAY),
      task('t5', '2026-11-12'),
      task('t6', '2026-11-20'),
      task('t7', '2026-12-20'),
    ],
    [problem('a', TODAY)],
  )
  const ids = (v: ReturnType<typeof todoView>) => ({ overdue: v.overdue.map((i) => i.id), days: v.days.map((d) => [d.date, d.items.map((i) => i.id)]) })

  it('today pins every overdue item and lists only today', () => {
    expect(ids(todoView(items, 'today', TODAY))).toEqual({ overdue: ['t1', 't2'], days: [[TODAY, ['t4', 'a']]] })
  })

  it('next 7 days runs today through the sixth day after, grouped by day', () => {
    const v = todoView(items, 'next7', TODAY)
    expect(v.overdue.map((i) => i.id)).toEqual(['t1', 't2'])
    expect(v.days.map((d) => [d.date, d.label])).toEqual([
      [TODAY, 'Today'],
      ['2026-11-12', 'Tomorrow'],
    ])
  })

  it('next 28 days includes the later items but not beyond', () => {
    const v = todoView(items, 'next28', TODAY)
    expect(v.days.map((d) => d.date)).toEqual([TODAY, '2026-11-12', '2026-11-20'])
  })

  it('past ranges show done and still-open items, newest day first, with no pinned section', () => {
    const v = todoView(items, 'past7', TODAY)
    expect(ids(v)).toEqual({ overdue: [], days: [['2026-11-09', ['t2', 't3']]] })
    expect(v.days[0]!.items.map((i) => [i.id, i.done, i.overdue])).toEqual([
      ['t2', false, true],
      ['t3', true, false],
    ])
    expect(todoView(items, 'past28', TODAY).days.map((d) => d.date)).toEqual(['2026-11-09'])
  })

  it('is empty for a range with nothing in it', () => {
    expect(todoView([], 'today', TODAY)).toEqual({ overdue: [], days: [] })
    expect(todoView(items.filter((i) => i.id === 't7'), 'next7', TODAY).days).toEqual([])
  })
})
