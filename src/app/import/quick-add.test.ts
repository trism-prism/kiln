import { describe, expect, it } from 'vitest'
import { formatIssue, validatePlan } from '../../domain/plan-format'
import { buildPlan } from './builder'
import { dropPastDue, expandRepeat, keptEdits, kindFromUrl, MAX_REPEAT, parseLine, parseQuickAdd, type ParsedLine } from './quick-add'

// Friday.
const today = '2026-11-06'

describe('parseLine', () => {
  const cases: [string, Partial<ParsedLine>][] = [
    ['Read chapter 3', { title: 'Read chapter 3', minutes: undefined, due: undefined, priority: undefined, links: [] }],
    ['Read chapter 3 45m', { title: 'Read chapter 3', minutes: '45' }],
    ['Lab 1h30m', { title: 'Lab', minutes: '90' }],
    ['Lab 1h 30m', { title: 'Lab', minutes: '90' }],
    ['Lab 1 hour 30 minutes', { title: 'Lab', minutes: '90' }],
    ['Lab 1.5h', { title: 'Lab', minutes: '90' }],
    ['Lab 2 hrs', { title: 'Lab', minutes: '120' }],
    ['Lab 45 mins', { title: 'Lab', minutes: '45' }],
    ['Quiz on friday,', { title: 'Quiz on', due: '2026-11-13' }],
    ['Exam nov 20.', { title: 'Exam', due: '2026-11-20' }],
    ['Exam (due fri)', { title: 'Exam (due', due: '2026-11-13' }],
    ['Read https://x.org/Cell,', { title: 'Read', links: ['https://x.org/Cell'] }],
    ['Read (see https://x.org/a)', { title: 'Read (see', links: ['https://x.org/a'] }],
    ['Exam 2026-12-01.', { due: '2026-12-01' }],
    ['#1 Sum', { title: '#1 Sum' }],
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
    ['Exam nov 20 2027', { title: 'Exam', due: '2027-11-20' }],
    ['Exam Nov 20, 2027 1h', { title: 'Exam', due: '2027-11-20', minutes: '60' }],
    ['Exam nov 20 2025', { title: 'Exam', due: '2025-11-20' }],
    ['Exam feb 29 2027', { title: 'Exam feb 29 2027', due: undefined }],
    ['Exam nov 20 200 pages', { title: 'Exam 200 pages', due: '2026-11-20' }],
    // A year counts from last year to 10 years ahead; any other number is part of the title.
    ['Essay nov 20 2000 words', { title: 'Essay 2000 words', due: '2026-11-20' }],
    ['Exam nov 20 2036', { title: 'Exam', due: '2036-11-20' }],
    ['Exam nov 20 2037', { title: 'Exam 2037', due: '2026-11-20' }],
    ['Exam jan 5 2025', { title: 'Exam', due: '2025-01-05' }],
    ['Exam jan 5 2024', { title: 'Exam 2024', due: '2027-01-05' }],
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
    ['https://docs.google.com/document/d/1', 'docs'],
    ['https://example.com/', 'other'],
    ['not a url', 'other'],
  ])('%s is %s', (url, kind) => expect(kindFromUrl(url)).toBe(kind))
})

describe('dropPastDue', () => {
  it('clears a past due date and counts it, keeps today and later', () => {
    const m = parseQuickAdd(['Exam 2026-01-05', 'Quiz today', 'Final 2026-12-01'].join('\n'), today)
    const got = dropPastDue(m, today)
    expect(got.dropped).toBe(1)
    expect(got.modules[0]!.tasks.map((t) => t.due)).toEqual(['', today, '2026-12-01'])
  })
})

describe('parseQuickAdd', () => {
  it('a heading needs a space after the #; "#1 Sum" stays a task', () => {
    const m = parseQuickAdd(['#1 Sum', '#  Real', 'Task'].join('\n'), today)
    expect(m.map((x) => x.title)).toEqual(['Tasks', 'Real'])
    expect(m[0]!.tasks[0]!.title).toBe('#1 Sum')
  })
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
  it.each([
    ['# Week 1', ['# Week 1', '# Week 2', '# Week 3']],
    ['Read chapter 1.', ['Read chapter 1.', 'Read chapter 2.', 'Read chapter 3.']],
    ['Lab 1h', ['Lab 1h', 'Lab 1h', 'Lab 1h']],
    ['Lab 1 hour', ['Lab 1 hour', 'Lab 1 hour', 'Lab 1 hour']],
    ['Chapter 10', ['Chapter 10', 'Chapter 10', 'Chapter 10']],
    ['Read pages 1-20', ['Read pages 1-20', 'Read pages 1-20', 'Read pages 1-20']],
    ['Quiz nov 1', ['Quiz nov 1', 'Quiz nov 1', 'Quiz nov 1']],
    ['Set {n}', ['Set 1', 'Set 2', 'Set 3']],
    ['Part 1 of 3', ['Part 1 of 3', 'Part 1 of 3', 'Part 1 of 3']],
    ['Page 1 / 3', ['Page 1 / 3', 'Page 1 / 3', 'Page 1 / 3']],
    ['Standup 1 pm', ['Standup 1 pm', 'Standup 1 pm', 'Standup 1 pm']],
    ['Exam 1 nov', ['Exam 1 nov', 'Exam 1 nov', 'Exam 1 nov']],
    ['Read the 1st essay', ['Read the 1st essay', 'Read the 1st essay', 'Read the 1st essay']],
    ['Lab 1.5 hours', ['Lab 1.5 hours', 'Lab 1.5 hours', 'Lab 1.5 hours']],
    ['Unit 1.5 review', ['Unit 1.5 review', 'Unit 1.5 review', 'Unit 1.5 review']],
  ])('repeat 3 counts up standalone 1s: %s', (line, want) => {
    expect(expandRepeat(line, 3).split('\n')).toEqual(want)
  })
  it(`repeats at most ${MAX_REPEAT} times`, () => {
    const lines = expandRepeat('Week 1', 100).split('\n')
    expect(lines).toHaveLength(MAX_REPEAT)
    expect(lines.at(-1)).toBe(`Week ${MAX_REPEAT}`)
  })
  it('a line of only a date, minutes or "!" keeps its text as the title', () => {
    const m = parseQuickAdd(['fri', '45m', '!', '- nov 20'].join('\n'), today)
    expect(m[0]!.tasks.map((t) => [t.title, t.due, t.minutes, t.priority])).toEqual([
      ['fri', '2026-11-13', '30', 'core'],
      ['45m', '', '45', 'core'],
      ['!', '', '30', 'core'],
      ['nov 20', '2026-11-20', '30', 'core'],
    ])
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

describe('keptEdits', () => {
  const at = (text: string) => parseQuickAdd(text, today)
  const edits = { 'Read#1': { minutes: '10' }, 'Read#2': { minutes: '20' }, 'Quiz#1': { minutes: '5' } }
  it('keeps every edit while each text has as many lines as before', () => {
    expect(keptEdits(edits, at('Read\nRead\nQuiz'), at('# Week\nRead\nQuiz\nRead'))).toEqual({ edits, changed: 0, recounted: 0 })
  })
  it('drops all edits on a text whose number of lines changed, and only those', () => {
    // Deleting either "Read" line would otherwise give the other one "Read#1"'s edit.
    expect(keptEdits(edits, at('Read\nRead\nQuiz'), at('Read\nQuiz'))).toEqual({ edits: { 'Quiz#1': { minutes: '5' } }, changed: 0, recounted: 2 })
    expect(keptEdits(edits, at('Read\nRead\nQuiz'), at('Read\nRead\nRead\nQuiz'))).toEqual({ edits: { 'Quiz#1': { minutes: '5' } }, changed: 0, recounted: 2 })
  })
  it('drops the edits of a line that is gone', () => {
    expect(keptEdits(edits, at('Read\nRead\nQuiz'), at('Read\nRead'))).toEqual({ edits: { 'Read#1': { minutes: '10' }, 'Read#2': { minutes: '20' } }, changed: 1, recounted: 0 })
    // Both lines of a pair gone: their line changed, so the usual notice.
    expect(keptEdits(edits, at('Read\nRead\nQuiz'), at('Quiz'))).toEqual({ edits: { 'Quiz#1': { minutes: '5' } }, changed: 2, recounted: 0 })
  })
})
