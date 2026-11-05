import { describe, expect, it } from 'vitest'
import { formatIssue } from '../plan-format'
import { importSheetText, looksLikeSheet } from './sheet'

const HEADER =
  'moduleId,moduleTitle,moduleOrder,moduleSummary,moduleNotBeforeDay,id,title,type,estimatedMinutes,topics,description,resources,practiceProvider,practiceSlug,practiceUrl,practiceTitle,practiceDifficulty,dependsOn,fixedDate,order,priority,mystery'
const info = { title: 'Arrays course', goal: 'Pass the interview' }

// Builds a CSV line from named cells so the tests stay readable.
function row(cells: Record<string, string>): string {
  return HEADER.split(',')
    .map((h) => {
      const v = cells[h] ?? ''
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    })
    .join(',')
}

const lesson = row({
  moduleId: 'arrays', moduleTitle: 'Arrays', moduleOrder: '2', moduleSummary: 'Basics', moduleNotBeforeDay: '8',
  id: 'hash-maps', title: 'Hash maps', type: 'Lesson', estimatedMinutes: '60', topics: 'arrays-hashing | Sliding Window',
  description: 'Line one\nline two', resources: 'Intro video ; https://example.com/v ; Video ; 35 ; Chapter 1 ; no | Book ;  ; book ; 20',
})
const problem = row({
  moduleId: 'arrays', id: 'two-sum', title: 'Two Sum', type: 'practice', estimatedMinutes: '40', topics: 'arrays-hashing',
  description: 'Solve it', practiceProvider: 'leetcode', practiceSlug: 'two-sum', practiceDifficulty: 'Easy', dependsOn: 'hash-maps',
})

const errorsOf = (r: { issues: Parameters<typeof formatIssue>[0][] }) => r.issues.filter((i) => i.severity === 'error').map(formatIssue)

function run(lines: string[], planInfo = info) {
  const r = importSheetText([HEADER, ...lines].join('\n'), planInfo)
  return { ...r, text: r.issues.map(formatIssue) }
}

describe('importSheetText', () => {
  it('maps rows to a plan', () => {
    const r = run([lesson, problem])
    expect(r.text).toContain('warning: row 1: column "mystery" is not a known column and was ignored')
    const plan = r.plan!
    expect(plan).toMatchObject({ id: 'arrays-course', title: 'Arrays course', goal: 'Pass the interview', schedulingMode: 'auto' })
    expect(plan.modules).toEqual([{ id: 'arrays', title: 'Arrays', order: 2, summary: 'Basics', notBeforeDay: 8 }])
    expect(plan.tasks[0]).toMatchObject({
      id: 'hash-maps', order: 1, type: 'lesson', estimatedMinutes: 60, priority: 'core', description: 'Line one\nline two',
      topics: ['arrays-hashing', 'sliding-window'],
      resources: [
        { title: 'Intro video', url: 'https://example.com/v', kind: 'video', minutes: 35, section: 'Chapter 1', required: false },
        { title: 'Book', kind: 'book', minutes: 20, required: true },
      ],
    })
    expect(plan.tasks[1]).toMatchObject({
      order: 2,
      dependsOn: ['hash-maps'],
      practice: { provider: 'leetcode', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy' },
    })
  })

  it('numbers modules and tasks by appearance when order is blank', () => {
    const r = run([
      row({ moduleId: 'a', moduleTitle: 'A', id: 'a1', title: 'A1', type: 'review', estimatedMinutes: '20' }),
      row({ moduleId: 'b', moduleTitle: 'B', id: 'b1', title: 'B1', type: 'review', estimatedMinutes: '20' }),
      row({ moduleId: 'a', id: 'a2', title: 'A2', type: 'review', estimatedMinutes: '20' }),
    ])
    expect(r.plan?.modules.map((m) => m.order)).toEqual([1, 2])
    expect(r.plan?.tasks.map((t) => [t.id, t.order])).toEqual([['a1', 1], ['b1', 1], ['a2', 2]])
  })

  it('reads semicolon-separated sheets and skips blank rows', () => {
    const cells = (line: string) => line.split(',').join(';')
    const semi = [cells(HEADER), cells(row({ moduleId: 'a', moduleTitle: 'A', id: 'a1', title: 'A1', type: 'review', estimatedMinutes: '20' })), ';;;;', ''].join('\n')
    const r = importSheetText(semi, info)
    expect(r.plan?.tasks).toHaveLength(1)
  })

  it('detects pasted sheet text by its headers', () => {
    expect(looksLikeSheet(`${HEADER}\n${lesson}`)).toBe(true)
    expect(looksLikeSheet('moduleId\tid\ttitle\ttype\testimatedMinutes\n')).toBe(true)
    expect(looksLikeSheet('MODULEID;ID;TITLE;TYPE;ESTIMATEDMINUTES')).toBe(true)
    expect(looksLikeSheet('{"schemaVersion": 1}')).toBe(false)
    expect(looksLikeSheet('id,title,type\n')).toBe(false)
  })

  it('reports problems as rows with the task title', () => {
    const bad = row({
      moduleId: 'arrays', id: 'bad', title: 'Bad task', type: 'practice', estimatedMinutes: '', description: 'x', topics: 'a',
      resources: 'Doc ; ; film | Other ; ; book ; abc', practiceProvider: 'leetcode', dependsOn: 'hash-maps | nope | hash-maps',
    })
    const r = run([lesson, problem, bad])
    expect(r.plan).toBeUndefined()
    expect(r.text).toContain('row 4 "Bad task": estimatedMinutes is required')
    expect(r.text).toContain('row 4 "Bad task": resources item 1: kind must be one of: video, article, book, course, docs, tool, visualizer, problem, other')
    expect(r.text).toContain('row 4 "Bad task": resources item 2: minutes must be an integer from 0 to 600')
    expect(r.text).toContain('row 4 "Bad task": practiceSlug is required when provider is "leetcode"')
    expect(r.text).toContain('row 4 "Bad task": practiceDifficulty is required')
    expect(r.text).toContain('row 4 "Bad task": dependsOn item 2 "nope" does not match any task id')
    expect(r.text).toContain('warning: row 4 "Bad task": dependsOn item 3 "hash-maps" is listed twice and was deduplicated')
    expect(r.issues.every((i) => i.path.startsWith('row '))).toBe(true)
  })

  it('reports module columns by name and conflicting repeats', () => {
    const r = run([
      lesson,
      row({ moduleId: 'arrays', moduleTitle: 'Other title', id: 'x', title: 'X', type: 'review', estimatedMinutes: '20' }),
      row({ moduleId: 'zero', moduleTitle: 'Z', moduleOrder: '0', id: 'z', title: 'Z', type: 'review', estimatedMinutes: '20' }),
    ])
    expect(r.text).toContain('row 3 "X": moduleTitle "Other title" differs from "Arrays" on row 2')
    expect(r.text).toContain('row 4 "Z": moduleOrder must be an integer from 1 to 1000')
  })

  it('fails on missing required columns, a bad required flag and lone practice columns', () => {
    const missing = importSheetText('id,title\nx,y', info)
    expect(missing.issues.map(formatIssue)).toEqual([
      'row 1: required column "moduleId" is missing',
      'row 1: required column "type" is missing',
      'row 1: required column "estimatedMinutes" is missing',
    ])
    const r = run([
      row({
        moduleId: 'a', moduleTitle: 'A', id: 'a1', title: 'A1', type: 'lesson', estimatedMinutes: '20',
        resources: 'R ; ; book ; 5 ; ; maybe', practiceSlug: 'two-sum',
      }),
    ])
    expect(r.text).toContain('row 2 "A1": resources item 1: required must be yes or no')
    expect(r.text).toContain('row 2 "A1": practiceProvider is required when other practice columns are filled')
  })

  it('any date makes it a fixed plan and needs the start date', () => {
    const dated = row({
      moduleId: 'a', moduleTitle: 'A', id: 'exam', title: 'Exam', type: 'assessment', estimatedMinutes: '60',
      fixedDate: '2026-12-11', description: 'x', topics: 't',
    })
    const sheet = [HEADER, dated].join('\n')
    const noStart = importSheetText(sheet, info)
    expect(errorsOf(noStart)).toEqual(['plan "Arrays course": startDate is required when schedulingMode is "fixed"'])
    const ok = importSheetText(sheet, { ...info, startDate: '2026-11-09' })
    expect(ok.plan).toMatchObject({ schedulingMode: 'fixed', startDate: '2026-11-09' })
    expect(ok.plan?.tasks[0]?.fixedDate).toBe('2026-12-11')
    const early = importSheetText(sheet, { ...info, startDate: '2026-12-20' })
    expect(errorsOf(early)).toEqual(['row 2 "Exam": fixedDate 2026-12-11 is before startDate (2026-12-20)'])
  })

  it('needs a plan title', () => {
    const r = importSheetText([HEADER, lesson].join('\n'), { title: '  ' })
    expect(r.issues.map(formatIssue)).toContain('plan: title is required')
  })
})
