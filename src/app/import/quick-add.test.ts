import { describe, expect, it } from 'vitest'
import { formatIssue, validatePlan } from '../../domain/plan-format'
import { buildPlan } from './builder'
import { expandRepeat, kindFromUrl, parseLine, parseQuickAdd, type ParsedLine } from './quick-add'

// Friday.
const today = '2026-11-06'

describe('parseLine', () => {
  const cases: [string, Partial<ParsedLine>][] = [
    ['Read chapter 3', { title: 'Read chapter 3', minutes: undefined, due: undefined, priority: undefined, links: [] }],
    ['Read chapter 3 45m', { title: 'Read chapter 3', minutes: '45' }],
    ['Lab 1h30m', { title: 'Lab', minutes: '90' }],
    ['Lab 2h', { title: 'Lab', minutes: '120' }],
    ['Lab 20min', { title: 'Lab', minutes: '20' }],
    ['Essay today', { title: 'Essay', due: '2026-11-06' }],
    ['Essay Tomorrow', { title: 'Essay', due: '2026-11-07' }],
    ['Quiz mon', { title: 'Quiz', due: '2026-11-09' }],
    ['Quiz friday', { title: 'Quiz', due: '2026-11-13' }],
    ['Quiz tues', { title: 'Quiz', due: '2026-11-10' }],
    ['SAT prep', { title: 'SAT prep', due: undefined }],
    ['Read sat notes', { title: 'Read sat notes', due: undefined }],
    ['The sun', { title: 'The sun', due: undefined }],
    ['Quiz saturday', { title: 'Quiz', due: '2026-11-07' }],
    ['Exam nov 20', { title: 'Exam', due: '2026-11-20' }],
    ['Exam November 20', { title: 'Exam', due: '2026-11-20' }],
    ['Exam nov 1', { title: 'Exam', due: '2027-11-01' }],
    ['Exam jan 5', { title: 'Exam', due: '2027-01-05' }],
    ['Exam feb 30', { title: 'Exam feb 30', due: undefined }],
    ['May the force', { title: 'May the force', due: undefined }],
    ['Exam 2026-12-01', { title: 'Exam', due: '2026-12-01' }],
    ['Must do !', { title: 'Must do', priority: 'core' }],
    ['Extra reading ?', { title: 'Extra reading', priority: 'optional' }],
    ['Why? Because', { title: 'Why? Because', priority: undefined }],
    ['Watch https://youtu.be/abc 20m', { title: 'Watch', minutes: '20', links: ['https://youtu.be/abc'] }],
    ['https://www.quizlet.com/1/cells', { title: 'quizlet.com', links: ['https://www.quizlet.com/1/cells'] }],
    ['- Bullet item 10m', { title: 'Bullet item', minutes: '10' }],
    ['2. Numbered item', { title: 'Numbered item' }],
    ['2 Sum problem', { title: '2 Sum problem' }],
  ]
  it.each(cases)('%s', (line, want) => {
    const got = parseLine(line, today)
    for (const key of Object.keys(want) as (keyof ParsedLine)[]) expect(got[key], key).toEqual(want[key])
  })
  it('feb 29 after it has passed goes to the next leap year', () => {
    expect(parseLine('Exam feb 29', '2028-03-01').due).toBe('2032-02-29')
    expect(parseLine('Exam feb 29', '2027-01-01').due).toBe('2028-02-29')
  })
})

describe('kindFromUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=x', 'video'],
    ['https://youtu.be/x', 'video'],
    ['https://quizlet.com/123', 'tool'],
    ['https://www.coursera.org/learn/x', 'course'],
    ['https://leetcode.com/problems/two-sum/', 'problem'],
    ['https://docs.python.org/3/', 'docs'],
    ['https://en.wikipedia.org/wiki/Cell', 'article'],
    ['https://example.com/', 'other'],
    ['not a url', 'other'],
  ])('%s is %s', (url, kind) => expect(kindFromUrl(url)).toBe(kind))
})

describe('parseQuickAdd', () => {
  it('starts modules at # and ##, defaults to 30 min and Essential, and puts loose tasks in "Tasks"', () => {
    const m = parseQuickAdd('Warm up\n# Cells\nRead 45m\n\n## Genetics\nQuiz ?', today)
    expect(m.map((x) => x.title)).toEqual(['Tasks', 'Cells', 'Genetics'])
    expect(m[0]!.tasks[0]).toMatchObject({ title: 'Warm up', type: 'lesson', minutes: '30', priority: 'core', due: '', links: '' })
    expect(m[2]!.tasks[0]).toMatchObject({ title: 'Quiz', priority: 'optional' })
  })
  it('drops empty modules and keeps uids stable and unique for repeated lines', () => {
    const m = parseQuickAdd('# Empty\n# Real\nSame\nSame', today)
    expect(m.map((x) => x.title)).toEqual(['Real'])
    expect(m[0]!.tasks.map((t) => t.uid)).toEqual(['Same#1', 'Same#2'])
    expect(parseQuickAdd('New line\n# Real\nSame\nSame', today)[1]!.tasks.map((t) => t.uid)).toEqual(['Same#1', 'Same#2'])
  })
  it('repeats with {n}', () => {
    expect(expandRepeat('# Week {n}\nRead {n}', 1)).toBe('# Week 1\nRead 1')
    const m = parseQuickAdd('# Week {n}\nRead chapter {n}', today, 3)
    expect(m.map((x) => x.title)).toEqual(['Week 1', 'Week 2', 'Week 3'])
    expect(m.map((x) => x.tasks[0]!.title)).toEqual(['Read chapter 1', 'Read chapter 2', 'Read chapter 3'])
  })
  it('builds a plan that validates: links become resources, a due date makes it fixed', () => {
    const modules = parseQuickAdd('# Bio\nRead 45m https://youtu.be/x\nExam nov 20 1h30m', today)
    modules[0]!.tasks[1]!.type = 'assessment'
    const r = validatePlan(buildPlan({ title: 'Bio', modules }, { id: 'bio', startDate: '2026-11-07' }))
    expect(r.issues.filter((i) => i.severity === 'error').map(formatIssue)).toEqual([])
    expect(r.plan).toMatchObject({ schedulingMode: 'fixed', startDate: '2026-11-07' })
    expect(r.plan?.tasks[0]?.resources).toMatchObject([{ title: 'youtu.be', url: 'https://youtu.be/x', kind: 'video' }])
    expect(r.plan?.tasks[1]).toMatchObject({ type: 'assessment', estimatedMinutes: 90, deadline: '2026-11-20' })
  })
})
