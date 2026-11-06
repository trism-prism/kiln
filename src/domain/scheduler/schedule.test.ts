import { describe, expect, it } from 'vitest'
import type { PoolProblem } from '../practice'
import { schedule, type SchedPlan, type SchedTask, type ScheduleInput } from './index'

// 2026-11-02 is a Monday.
const MON = '2026-11-02'
const week = (m: number) => Array<number>(7).fill(m)

const plan = (id: string, o: Partial<SchedPlan> = {}): SchedPlan => ({ id, weight: 3, startDate: MON, ...o })

type TaskSpec = [key: string, minutes: number, extra?: Partial<SchedTask>]
/** Tasks of one plan, in plan order. Ids are "<plan>-<key>". */
const tasks = (planId: string, specs: TaskSpec[]): SchedTask[] =>
  specs.map(([key, minutes, extra], i) => ({
    id: `${planId}-${key}`,
    planId,
    key,
    moduleOrder: 1,
    taskOrder: i + 1,
    estimatedMinutes: minutes,
    priority: 'core',
    type: 'lesson',
    dependsOn: [],
    status: 'open',
    topics: [],
    ...extra,
  }))

const run = (o: Partial<ScheduleInput> & { tasks: SchedTask[] }) =>
  schedule({ plans: [plan('p')], minutesPerWeekday: week(60), blackoutDates: [], today: MON, mode: 'initial', pool: [], ...o })

/** Dates of the given task keys of plan p. */
const dates = (out: ReturnType<typeof run>, keys: string[], planId = 'p') => keys.map((k) => out.assignments[`${planId}-${k}`])

describe('capacity', () => {
  it('uses each weekday budget', () => {
    // Mon 60, Tue 30, Wed 60, Thu-Sun 0
    const out = run({ minutesPerWeekday: [60, 30, 60, 0, 0, 0, 0], tasks: tasks('p', ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => [k, 30] as TaskSpec)) })
    expect(dates(out, ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['2026-11-02', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-04', '2026-11-09'])
    expect(out.unplaceable).toEqual([])
  })

  it('skips blackout days', () => {
    const out = run({ blackoutDates: ['2026-11-03'], tasks: tasks('p', ['a', 'b', 'c', 'd'].map((k) => [k, 30] as TaskSpec)) })
    expect(dates(out, ['a', 'b', 'c', 'd'])).toEqual(['2026-11-02', '2026-11-02', '2026-11-04', '2026-11-04'])
  })

  it('never splits a task: overflow moves the whole task to the next day', () => {
    const out = run({ tasks: tasks('p', [['a', 40], ['b', 40], ['c', 40]]) })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })

  it('the first task of a day always fits, so a task longer than the whole budget takes an empty day', () => {
    const out = run({ tasks: tasks('p', [['a', 20], ['big', 100], ['c', 20]]) })
    expect(dates(out, ['a', 'big', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-02'])
    expect(out.days.find((d) => d.date === '2026-11-03')?.taskMinutes).toBe(100)
  })

  it('does not place anything before today or the plan start', () => {
    const out = run({ today: '2026-11-04', plans: [plan('p', { startDate: '2026-11-09' })], tasks: tasks('p', [['a', 30]]) })
    expect(dates(out, ['a'])).toEqual(['2026-11-09'])
  })
})

describe('readiness', () => {
  it('a dependent goes on a later day than its dependency, even with room left', () => {
    const out = run({ tasks: tasks('p', [['a', 10], ['b', 10, { dependsOn: ['a'] }], ['c', 10]]) })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-02'])
  })

  it('a done dependency is met at once', () => {
    const ts = tasks('p', [['a', 10, { status: 'done', scheduledDate: '2026-11-02' }], ['b', 10, { dependsOn: ['a'] }]])
    expect(dates(run({ tasks: ts }), ['b'])).toEqual(['2026-11-02'])
  })

  it('notBeforeDay counts plan days from the start date', () => {
    const out = run({ plans: [plan('p', { startDate: '2026-11-03' })], tasks: tasks('p', [['a', 10, { notBeforeDay: 3 }], ['b', 10]]) })
    expect(dates(out, ['a', 'b'])).toEqual(['2026-11-05', '2026-11-03'])
  })

  it('a dependency chain across days keeps its order', () => {
    const out = run({ tasks: tasks('p', [['a', 60], ['b', 60, { dependsOn: ['a'] }], ['c', 60, { dependsOn: ['b'] }]]) })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })
})

describe('fill rule', () => {
  it('a later task of the same module may fill the room', () => {
    const out = run({ tasks: tasks('p', [['a', 50], ['b', 40], ['c', 10]]) })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-02'])
  })

  it('a task of a later module never jumps past one that does not fit', () => {
    const out = run({ tasks: tasks('p', [['a', 50], ['b', 40], ['c', 10, { moduleOrder: 2, taskOrder: 1 }]]) })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-03'])
  })
})

describe('pinned tasks', () => {
  it('go on their date even over budget, and leave no room that day', () => {
    const out = run({ tasks: tasks('p', [['a', 30], ['pin', 90, { pinnedDate: '2026-11-02' }], ['b', 30]]) })
    expect(dates(out, ['pin', 'a', 'b'])).toEqual(['2026-11-02', '2026-11-03', '2026-11-03'])
    expect(out.days[0]).toMatchObject({ date: '2026-11-02', budget: 60, taskMinutes: 90 })
  })

  it('count as met dependencies only from the next day', () => {
    const out = run({ tasks: tasks('p', [['pin', 10, { pinnedDate: '2026-11-04' }], ['b', 10, { dependsOn: ['pin'] }]]) })
    expect(dates(out, ['pin', 'b'])).toEqual(['2026-11-04', '2026-11-05'])
  })
})

describe('weighted interleave', () => {
  it('gives a plan with double weight about double the minutes', () => {
    const ts = [...tasks('a', ['1', '2', '3', '4', '5', '6'].map((k) => [k, 30] as TaskSpec)), ...tasks('b', ['1', '2', '3', '4', '5', '6'].map((k) => [k, 30] as TaskSpec))]
    const out = run({ plans: [plan('a', { weight: 2 }), plan('b', { weight: 1 })], minutesPerWeekday: week(90), tasks: ts })
    const day = (d: string, id: string) => ts.filter((t) => t.planId === id && out.assignments[t.id] === d).map((t) => t.key)
    expect([day('2026-11-02', 'a'), day('2026-11-02', 'b')]).toEqual([['1', '2'], ['1']])
    expect([day('2026-11-03', 'a'), day('2026-11-03', 'b')]).toEqual([['3', '4'], ['2']])
  })

  it('equal weights alternate, ties going to the lower plan id', () => {
    const ts = [...tasks('b', [['1', 30], ['2', 30]]), ...tasks('a', [['1', 30], ['2', 30]])]
    const out = run({ plans: [plan('b'), plan('a')], minutesPerWeekday: week(60), tasks: ts })
    expect(out.assignments['a-1']).toBe('2026-11-02')
    expect(out.assignments['b-1']).toBe('2026-11-02')
    expect(out.assignments['a-2']).toBe('2026-11-03')
  })
})

describe('stability and reschedule', () => {
  // Today is Wednesday 2026-11-04. 'a' is overdue (Monday), 'b' is on Thursday, 'c' has no date.
  const base = () =>
    tasks('p', [['a', 60, { scheduledDate: '2026-11-02' }], ['b', 60, { scheduledDate: '2026-11-05' }], ['c', 60], ['d', 60, { status: 'done', scheduledDate: '2026-11-03' }]])

  it('initial mode keeps every dated task, even overdue, and places only the undated', () => {
    const out = run({ today: '2026-11-04', tasks: base() })
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-02', '2026-11-05', '2026-11-04'])
    expect(out.assignments['p-d']).toBeUndefined()
  })

  it('reschedule moves only overdue tasks into spare capacity and keeps the rest', () => {
    const out = run({ today: '2026-11-04', mode: 'reschedule', tasks: base() })
    // Wednesday is free for the overdue task (plan order), Thursday is full of b, c follows on Friday.
    expect(dates(out, ['a', 'b', 'c'])).toEqual(['2026-11-04', '2026-11-05', '2026-11-06'])
    expect(out.assignments['p-d']).toBeUndefined()
  })

  it('reschedule never moves a pinned task, even an overdue one', () => {
    const ts = tasks('p', [['a', 60, { scheduledDate: '2026-11-02', pinnedDate: '2026-11-02' }]])
    expect(dates(run({ today: '2026-11-04', mode: 'reschedule', tasks: ts }), ['a'])).toEqual(['2026-11-02'])
  })

  it('work done today still uses up today', () => {
    const ts = tasks('p', [['x', 45, { status: 'done', scheduledDate: '2026-11-04' }], ['a', 30]])
    expect(dates(run({ today: '2026-11-04', tasks: ts }), ['a'])).toEqual(['2026-11-05'])
  })

  it('reschedule keeps backlog tasks in the backlog; initial places them again', () => {
    const ts = () => tasks('p', [['a', 10, { priority: 'optional', inBacklog: true }]])
    expect(dates(run({ mode: 'reschedule', tasks: ts() }), ['a'])).toEqual(['backlog'])
    expect(dates(run({ mode: 'initial', tasks: ts() }), ['a'])).toEqual(['2026-11-02'])
  })
})

describe('reviews', () => {
  it('are capped at 25% of the day and leave the rest for tasks', () => {
    const out = run({
      minutesPerWeekday: week(100),
      reviewsDue: { [MON]: { count: 9, minutes: 90 } },
      tasks: tasks('p', ['a', 'b', 'c', 'd'].map((k) => [k, 25] as TaskSpec)),
    })
    expect(out.days[0]).toMatchObject({ date: MON, reviewMinutes: 25, taskMinutes: 75 })
    expect(dates(out, ['a', 'b', 'c', 'd'])).toEqual([MON, MON, MON, '2026-11-03'])
  })

  it('take less than the cap when little is due, and honour a custom cap', () => {
    const small = run({ minutesPerWeekday: week(100), reviewsDue: { [MON]: { count: 1, minutes: 10 } }, tasks: tasks('p', [['a', 10]]) })
    expect(small.days[0]?.reviewMinutes).toBe(10)
    const custom = run({ minutesPerWeekday: week(100), reviewCapPercent: 50, reviewsDue: { [MON]: { count: 9, minutes: 90 } }, tasks: tasks('p', [['a', 10]]) })
    expect(custom.days[0]?.reviewMinutes).toBe(50)
  })
})

describe('daily practice slot', () => {
  const practice = (slug: string) => ({ type: 'practice' as const, practice: { slug, difficulty: 'easy' as const } })
  const dp = (o: Partial<NonNullable<SchedPlan['dailyPractice']>> = {}): SchedPlan['dailyPractice'] => ({
    source: 'plan',
    perDay: 1,
    startDifficulty: 'easy',
    topicFollowsLessons: true,
    ...o,
  })
  const pool: PoolProblem[] = [
    { slug: 'ah-1', title: 'AH 1', difficulty: 'easy', topic: 'arrays-hashing' },
    { slug: 'ah-2', title: 'AH 2', difficulty: 'easy', topic: 'arrays-hashing' },
    { slug: 'st-1', title: 'ST 1', difficulty: 'easy', topic: 'stack' },
    { slug: 'st-2', title: 'ST 2', difficulty: 'easy', topic: 'stack' },
  ]

  it('takes one plan problem a day, ahead of earlier lessons, when ready', () => {
    const ts = tasks('p', [['lesson', 30], ['p1', 20, practice('x-1')], ['p2', 20, practice('x-2')]])
    const out = run({ plans: [plan('p', { dailyPractice: dp() })], tasks: ts })
    expect(dates(out, ['p1', 'lesson', 'p2'])).toEqual([MON, MON, '2026-11-03'])
    expect(out.practice).toEqual([])
  })

  it('does not pull a plan problem forward before its lesson', () => {
    const ts = tasks('p', [['lesson', 30], ['p1', 20, { ...practice('x-1'), dependsOn: ['lesson'] }]])
    const out = run({ plans: [plan('p', { dailyPractice: dp() })], tasks: ts })
    expect(dates(out, ['lesson', 'p1'])).toEqual([MON, '2026-11-03'])
  })

  it('source "plan" generates nothing', () => {
    const out = run({ plans: [plan('p', { dailyPractice: dp() })], pool, tasks: tasks('p', [['a', 10]]) })
    expect(out.practice).toEqual([])
  })

  it('tops up from the pool, following the most recent lesson, skipping plan and solved problems', () => {
    const ts = tasks('p', [
      ['lesson', 20, { topics: ['Stack'] }],
      ['later', 10, { notBeforeDay: 4 }],
      ['p', 10, { ...practice('st-1'), notBeforeDay: 30 }],
    ])
    const out = run({
      plans: [plan('p', { dailyPractice: dp({ source: 'neetcode' }) })],
      pool,
      solved: [{ slug: 'ah-1', difficulty: 'easy', topic: 'arrays-hashing', rating: 3 }],
      tasks: ts,
    })
    // Day 1: no lesson yet, roadmap order -> ah-2 (ah-1 solved). Day 2 on: the lesson on day 1 was Stack -> st-2
    // (st-1 is a plan problem, so it is never generated).
    expect(out.practice.map((g) => [g.date, g.slug, g.minutes])).toEqual([
      [MON, 'ah-2', 25],
      ['2026-11-03', 'st-2', 25],
    ])
    expect(out.days[0]).toMatchObject({ practiceMinutes: 25, taskMinutes: 20 + 0 })
  })

  it('topicFollowsLessons false uses roadmap order', () => {
    const ts = tasks('p', [['lesson', 20, { topics: ['stack'] }], ['later', 10, { notBeforeDay: 3 }]])
    const out = run({ plans: [plan('p', { dailyPractice: dp({ source: 'neetcode', topicFollowsLessons: false }) })], pool, tasks: ts })
    expect(out.practice.map((g) => g.slug)).toEqual(['ah-1', 'ah-2', 'st-1'])
  })

  it('perDay problems a day, and generated problems cost minutes from the budget', () => {
    const out = run({
      plans: [plan('p', { dailyPractice: dp({ source: 'neetcode', perDay: 2 }) })],
      pool,
      minutesPerWeekday: week(60),
      tasks: tasks('p', [['a', 20], ['b', 20]]),
    })
    expect(out.practice.filter((g) => g.date === MON)).toHaveLength(2)
    // 50 minutes of practice leave 10, so only the first task of the day (always allowed) goes on Monday.
    expect(dates(out, ['a', 'b'])).toEqual([MON, '2026-11-03'])
  })

  it('ramps from easy to medium after five good easy problems in the topic', () => {
    const rampPool: PoolProblem[] = [
      ...Array.from({ length: 6 }, (_, i): PoolProblem => ({ slug: `e${i}`, title: `E${i}`, difficulty: 'easy', topic: 'arrays-hashing' })),
      { slug: 'm0', title: 'M0', difficulty: 'medium', topic: 'arrays-hashing' },
      { slug: 'm1', title: 'M1', difficulty: 'medium', topic: 'arrays-hashing' },
      { slug: 'm2', title: 'M2', difficulty: 'medium', topic: 'arrays-hashing' },
    ]
    const out = run({
      plans: [plan('p', { dailyPractice: dp({ source: 'neetcode' }) })],
      pool: rampPool,
      minutesPerWeekday: week(60),
      tasks: tasks('p', [['end', 10, { notBeforeDay: 8 }]]),
    })
    expect(out.practice.map((g) => g.difficulty)).toEqual(['easy', 'easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium'])
    expect(out.practice[5]?.minutes).toBe(40)
  })

  it('opens hard problems in the final 14 days of a plan with a deadline', () => {
    const hardPool: PoolProblem[] = [
      { slug: 'e0', title: 'E0', difficulty: 'easy', topic: 'stack' },
      { slug: 'e1', title: 'E1', difficulty: 'easy', topic: 'stack' },
      { slug: 'h0', title: 'H0', difficulty: 'hard', topic: 'stack' },
    ]
    const out = run({
      plans: [plan('p', { deadline: '2026-11-03', dailyPractice: dp({ source: 'neetcode' }) })],
      pool: hardPool,
      tasks: tasks('p', [['end', 10, { notBeforeDay: 3 }]]),
    })
    // Day 1: 0 solved -> easy. Day 2: 1 solved -> easy. Day 3 is past the 14-day mark but 2 solved gives hard.
    expect(out.practice.map((g) => g.difficulty)).toEqual(['easy', 'easy', 'hard'])
  })
})

describe('deadlines and deferral', () => {
  // One 60-minute task a day. Plan order: c1 o1 r1 c2 o2 r2 c3.
  const spec = (): TaskSpec[] => [
    ['c1', 60], ['o1', 60, { priority: 'optional' }], ['r1', 60, { priority: 'recommended' }], ['c2', 60],
    ['o2', 60, { priority: 'optional' }], ['r2', 60, { priority: 'recommended' }], ['c3', 60],
  ]
  const keys = ['c1', 'o1', 'r1', 'c2', 'o2', 'r2', 'c3']

  it('with no deadline nothing is deferred', () => {
    const out = run({ tasks: tasks('p', spec()) })
    expect(out.projectedFinish).toEqual({ p: '2026-11-08' })
    expect(Object.values(out.assignments)).not.toContain('backlog')
  })

  it('defers optional tasks, latest in plan order first, only as many as needed', () => {
    const out = run({ plans: [plan('p', { deadline: '2026-11-06' })], tasks: tasks('p', spec()) })
    expect(dates(out, keys)).toEqual(['2026-11-02', 'backlog', '2026-11-03', '2026-11-04', 'backlog', '2026-11-05', '2026-11-06'])
    expect(out.violations).toEqual([])
    expect(out.projectedFinish).toEqual({ p: '2026-11-06' })
  })

  it('defers one optional task when one is enough (the latest one)', () => {
    const out = run({ plans: [plan('p', { deadline: '2026-11-07' })], tasks: tasks('p', spec()) })
    expect(dates(out, ['o1', 'o2'])).toEqual(['2026-11-03', 'backlog'])
  })

  it('then defers recommended tasks, latest first, and never core', () => {
    const out = run({ plans: [plan('p', { deadline: '2026-11-04' })], tasks: tasks('p', spec()) })
    // Core alone needs 3 days (c1 c2 c3), so the deadline of day 3 is met once every other task is deferred.
    expect(dates(out, keys)).toEqual(['2026-11-02', 'backlog', 'backlog', '2026-11-03', 'backlog', 'backlog', '2026-11-04'])
  })

  it('defers recommended only after optional (r2 goes before r1)', () => {
    // Deadline day 5: needs 2 deferrals; optional are enough, no recommended is touched.
    const five = run({ plans: [plan('p', { deadline: '2026-11-06' })], tasks: tasks('p', spec()) })
    expect(dates(five, ['r1', 'r2']).every((d) => d !== 'backlog')).toBe(true)
    // Deadline day 4: both optional plus the latest recommended (r2), r1 stays.
    const four = run({ plans: [plan('p', { deadline: '2026-11-05' })], tasks: tasks('p', spec()) })
    expect(dates(four, ['o1', 'o2', 'r1', 'r2'])).toEqual(['backlog', 'backlog', '2026-11-03', 'backlog'])
  })

  it('never defers core: an impossible deadline is reported and nothing is deferred', () => {
    const out = run({ plans: [plan('p', { deadline: '2026-11-03' })], tasks: tasks('p', spec()) })
    expect(Object.values(out.assignments)).not.toContain('backlog')
    expect(out.violations).toEqual([{ kind: 'plan-deadline', planId: 'p', deadline: '2026-11-03', projectedFinish: '2026-11-08' }])
  })

  it('defers tasks that depend on a deferred task along with it', () => {
    const ts = tasks('p', [['c1', 60], ['o1', 60, { priority: 'optional' }], ['o2', 60, { priority: 'optional', dependsOn: ['o1'] }]])
    const out = run({ plans: [plan('p', { deadline: '2026-11-02' })], tasks: ts })
    expect(dates(out, ['c1', 'o1', 'o2'])).toEqual([MON, 'backlog', 'backlog'])
  })

  it('reports a missed task deadline and defers earlier optional work to meet it', () => {
    const ts = tasks('p', [['o1', 60, { priority: 'optional' }], ['c1', 60, { deadline: '2026-11-02' }], ['o2', 60, { priority: 'optional' }]])
    const out = run({ tasks: ts })
    expect(dates(out, ['o1', 'c1', 'o2'])).toEqual(['backlog', MON, '2026-11-03'])
    expect(out.violations).toEqual([])
    const late = run({ tasks: tasks('p', [['c0', 60], ['c1', 60, { deadline: MON }]]) })
    expect(late.violations).toEqual([{ kind: 'task-deadline', planId: 'p', taskId: 'p-c1', deadline: MON, date: '2026-11-03' }])
  })

  it('skipOptional sends every optional task to the backlog', () => {
    const out = run({ skipOptional: true, tasks: tasks('p', spec()) })
    expect(dates(out, keys)).toEqual(['2026-11-02', 'backlog', '2026-11-03', '2026-11-04', 'backlog', '2026-11-05', '2026-11-06'])
  })
})

describe('unplaceable work', () => {
  it('a core task behind a backlog task is blocked', () => {
    const ts = tasks('p', [['o', 10, { priority: 'optional' }], ['c', 10, { dependsOn: ['o'] }]])
    const out = run({ skipOptional: true, tasks: ts })
    expect(out.unplaceable).toEqual([{ taskId: 'p-c', reason: 'blocked' }])
  })

  it('a dependency cycle is blocked', () => {
    const ts = tasks('p', [['a', 10, { dependsOn: ['b'] }], ['b', 10, { dependsOn: ['a'] }], ['c', 10]])
    const out = run({ tasks: ts })
    expect(out.unplaceable.map((u) => u.taskId).sort()).toEqual(['p-a', 'p-b'])
    expect(out.assignments['p-c']).toBe(MON)
  })

  it('without any capacity tasks are reported after the horizon', () => {
    const out = run({ minutesPerWeekday: week(0), tasks: tasks('p', [['a', 10]]) })
    expect(out.unplaceable).toEqual([{ taskId: 'p-a', reason: 'no-capacity' }])
    expect(out.assignments).toEqual({})
  })
})

describe('determinism', () => {
  it('same input gives the same output and the input is not changed', () => {
    const input: ScheduleInput = {
      plans: [plan('a', { weight: 2, deadline: '2026-12-01', dailyPractice: { source: 'neetcode', perDay: 1, startDifficulty: 'easy', topicFollowsLessons: true } }), plan('b', { weight: 1 })],
      tasks: [
        ...tasks('a', [['1', 45, { topics: ['stack'] }], ['2', 30, { priority: 'optional' }], ['3', 60, { dependsOn: ['1'] }]]),
        ...tasks('b', [['1', 50], ['2', 50, { pinnedDate: '2026-11-05' }]]),
      ],
      minutesPerWeekday: [90, 90, 90, 90, 90, 120, 120],
      blackoutDates: ['2026-11-07'],
      today: MON,
      mode: 'initial',
    }
    const before = JSON.stringify(input)
    const first = JSON.stringify(schedule(input))
    expect(JSON.stringify(schedule(input))).toBe(first)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.parse(first).practice.length).toBeGreaterThan(0)
  })
})
