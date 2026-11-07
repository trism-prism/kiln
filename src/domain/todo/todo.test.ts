import { describe, expect, it } from 'vitest'
import { DEFAULT_TODO_PREFS, buildTodoItems, dayLabel, filterTodoItems, isRealMonthDay, nearestMonthDay, parseTodoPrefs, rangeBounds, todoView, type TodoCard, type TodoPrefs, type TodoProblem, type TodoSource, type TodoTask } from './index'

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

const build = (tasks: TodoSource['tasks'], problems: TodoProblem[] = [], cards: TodoCard[] = []) =>
  buildTodoItems({ tasks, problems, cards, planTitles: new Map([['p1', 'DSA']]), cardTitle: (c) => (c.taskId ? `Task ${c.taskId}` : (c.slug ?? '')) }, TODAY)

describe('buildTodoItems', () => {
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
    expect(items.find((i) => i.id === 't3')?.leetcode).toEqual({ slug: 'two-sum', difficulty: 'easy' })
    expect(items.find((i) => i.id === 'a')).toMatchObject({ kind: 'practice', leetcode: { slug: 'slug-a', difficulty: 'easy' } })
  })

  it('orders reviews, then tasks in plan order, then daily problems', () => {
    const items = build([task('t2', TODAY), task('t1', TODAY)], [problem('a', TODAY)], [card('c1', at(11))])
    expect(items.map((i) => i.id)).toEqual(['c1', 't1', 't2', 'a'])
  })
})

const prefs = (over: Partial<TodoPrefs> = {}): TodoPrefs => ({ ...DEFAULT_TODO_PREFS, ...over })

describe('rangeBounds', () => {
  // TODAY is Wednesday 11 Nov: its week starts Monday 9 Nov, or Sunday 8 Nov.
  it.each([
    [{}, 'monday', '2026-11-11', '2026-11-11'],
    [{ from: 'thisWeek', until: 'thisWeek' }, 'monday', '2026-11-09', '2026-11-15'],
    [{ from: 'thisWeek', until: 'thisWeek' }, 'sunday', '2026-11-08', '2026-11-14'],
    [{ from: 'lastWeek', until: 'nextWeek' }, 'monday', '2026-11-02', '2026-11-22'],
    [{ from: 'weeks4', until: 'weeks4' }, 'monday', '2026-10-12', '2026-12-13'],
    [{ from: 'weeks4', until: 'weeks4' }, 'sunday', '2026-10-11', '2026-12-12'],
    [{ from: 'weeks2', until: 'weeks2' }, 'monday', '2026-10-26', '2026-11-29'],
    [{ from: 'weeks3', until: 'weeks3' }, 'monday', '2026-10-19', '2026-12-06'],
  ] as const)('anchors %j, week starts %s', (over, weekStart, from, to) => expect(rangeBounds(prefs(over), TODAY, weekStart)).toEqual({ from, to }))

  it('uses custom month and day instead of the anchors, in this year', () => {
    const custom = prefs({ from: 'weeks4', until: 'weeks4', customFrom: { month: 11, day: 1 }, customUntil: { month: 11, day: 30 } })
    expect(rangeBounds(custom, TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(rangeBounds(prefs({ customFrom: { month: 11, day: 1 } }), TODAY)).toEqual({ from: '2026-11-01', to: TODAY })
  })

  it('picks the occurrence nearest today for both ends', () => {
    // From Dec 1 on Jan 5 is last December; Until Dec 20 is this coming one.
    expect(rangeBounds(prefs({ customFrom: { month: 12, day: 1 }, customUntil: { month: 1, day: 20 } }), '2027-01-05')).toEqual({ from: '2026-12-01', to: '2027-01-20' })
    expect(nearestMonthDay({ month: 1, day: 3 }, '2026-12-28')).toBe('2027-01-03')
    expect(nearestMonthDay({ month: 2, day: 29 }, '2026-11-11')).toBeUndefined() // no leap year within a year of today
  })

  it('an Until before the From gives an empty range, not a year-long one', () => {
    const r = rangeBounds(prefs({ customUntil: { month: 11, day: 1 } }), TODAY)
    expect(r).toEqual({ from: TODAY, to: '2026-11-01' })
    expect(todoView([], r, TODAY)).toEqual({ overdue: [], days: [] })
    expect(r.from > r.to).toBe(true)
  })

  it('ignores a date that does not exist', () => {
    expect(isRealMonthDay({ month: 2, day: 29 })).toBe(true)
    expect(isRealMonthDay({ month: 4, day: 31 })).toBe(false)
    expect(rangeBounds(prefs({ customFrom: { month: 2, day: 30 } }), TODAY)).toEqual({ from: TODAY, to: TODAY })
  })
})

describe('parseTodoPrefs', () => {
  it('defaults when missing or damaged and keeps valid fields', () => {
    expect(parseTodoPrefs(undefined)).toEqual(DEFAULT_TODO_PREFS)
    expect(parseTodoPrefs('{not json')).toEqual(DEFAULT_TODO_PREFS)
    const saved = prefs({ completed: false, favoriteOnly: true, from: 'lastWeek', until: 'weeks3', customFrom: { month: 9, day: 1 } })
    expect(parseTodoPrefs(JSON.stringify(saved))).toEqual({ ...saved, customUntil: undefined })
    expect(parseTodoPrefs(JSON.stringify({ from: 'bogus', customFrom: { month: 13, day: 1 } }))).toEqual(DEFAULT_TODO_PREFS)
  })
})

describe('personal to-dos and events', () => {
  const items = buildTodoItems(
    {
      tasks: [task('t1', TODAY)],
      problems: [],
      cards: [],
      personalTodos: [
        { id: 'p1', title: 'Buy a book', done: false },
        { id: 'p2', title: 'Hand in form', date: '2026-11-09', minutes: 15, done: false },
        { id: 'p3', title: 'Email prof', done: true, completedAt: at(10) },
      ],
      events: [{ id: 'e1', title: 'BIO 101 lecture', date: TODAY, course: 'BIO 101', allDay: false, start: at(11, 9) }],
      planTitles: new Map([['p1', 'DSA']]),
      cardTitle: () => '',
    },
    TODAY,
  )
  const by = (id: string) => items.find((i) => i.id === id)!

  it('lists undated to-dos today, done ones on their finish day, dated overdue ones overdue', () => {
    expect([by('p1').date, by('p1').overdue]).toEqual([TODAY, false])
    expect([by('p2').date, by('p2').overdue, by('p2').minutes]).toEqual(['2026-11-09', true, 15])
    expect([by('p3').date, by('p3').overdue, by('p3').done]).toEqual(['2026-11-10', false, true])
  })

  it('lists an event on its day, with no minutes and no plan', () => {
    expect(by('e1')).toMatchObject({ kind: 'event', date: TODAY, minutes: 0, planId: '', planTitle: 'BIO 101', done: false, rates: false })
    expect(by('e1').typeLabel).toMatch(/^Event, /)
  })

  it('the visible-items choices hide kinds, completed items and non-favorite plan items', () => {
    const kinds = (p: TodoPrefs, fav: string[] = []) => filterTodoItems(items, p, new Set(fav)).map((i) => i.id)
    expect(kinds(prefs())).toEqual(['e1', 't1', 'p1', 'p3', 'p2'])
    expect(kinds(prefs({ personal: false }))).toEqual(['e1', 't1'])
    expect(kinds(prefs({ events: false }))).toEqual(['t1', 'p1', 'p3', 'p2'])
    expect(kinds(prefs({ completed: false }))).toEqual(['e1', 't1', 'p1', 'p2'])
    expect(kinds(prefs({ favoriteOnly: true }))).toEqual(['e1', 'p1', 'p3', 'p2'])
    expect(kinds(prefs({ favoriteOnly: true }), ['p1'])).toEqual(['e1', 't1', 'p1', 'p3', 'p2'])
  })
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
  const view = (over: Partial<TodoPrefs>, weekStart: 'monday' | 'sunday' = 'monday') => todoView(items, rangeBounds(prefs(over), TODAY, weekStart), TODAY)
  const ids = (v: ReturnType<typeof todoView>) => ({ overdue: v.overdue.map((i) => i.id), days: v.days.map((d) => [d.date, d.items.map((i) => i.id)]) })

  it('today pins every overdue item and lists only today', () => {
    expect(ids(view({}))).toEqual({ overdue: ['t1', 't2'], days: [[TODAY, ['t4', 'a']]] })
  })

  it('a range through next week groups by day with labels, overdue still pinned', () => {
    const v = view({ until: 'thisWeek' })
    expect(v.overdue.map((i) => i.id)).toEqual(['t1', 't2'])
    expect(v.days.map((d) => [d.date, d.label])).toEqual([
      [TODAY, 'Today'],
      ['2026-11-12', 'Tomorrow'],
    ])
    expect(view({ until: 'nextWeek' }).days.map((d) => d.date)).toEqual([TODAY, '2026-11-12', '2026-11-20'])
    expect(view({ until: 'weeks4' }).days.map((d) => d.date)).toEqual([TODAY, '2026-11-12', '2026-11-20'])  // t7 is on 20 Dec, past 13 Dec
  })

  it('a range that includes today lists the past part oldest first, with overdue pinned, not repeated', () => {
    const v = view({ from: 'thisWeek', until: 'thisWeek' })
    expect(ids(v)).toEqual({ overdue: ['t1', 't2'], days: [['2026-11-09', ['t3']], [TODAY, ['t4', 'a']], ['2026-11-12', ['t5']]] })
  })

  it('a range wholly in the past has no pinned section and lists done and still-open items', () => {
    const v = todoView(items, { from: '2026-11-02', to: '2026-11-10' }, TODAY)
    expect(ids(v)).toEqual({ overdue: [], days: [['2026-11-09', ['t2', 't3']]] })
    expect(v.days[0]!.items.map((i) => [i.id, i.done, i.overdue])).toEqual([
      ['t2', false, true],
      ['t3', true, false],
    ])
  })

  it('a range wholly in the future has no pinned section', () => {
    expect(ids(todoView(items, { from: '2026-11-12', to: '2026-11-30' }, TODAY)).overdue).toEqual([])
  })

  it('is empty for a range with nothing in it', () => {
    expect(todoView([], { from: TODAY, to: TODAY }, TODAY)).toEqual({ overdue: [], days: [] })
    expect(todoView(items.filter((i) => i.id === 't7'), { from: TODAY, to: '2026-11-17' }, TODAY).days).toEqual([])
  })
})
