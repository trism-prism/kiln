import { describe, expect, it } from 'vitest'
import { formatIssue } from './issues'
import { MAX_ISSUES, validatePlan } from './validate'

const FENCE = '```'

function basePlan(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'demo',
    title: 'Demo plan',
    schedulingMode: 'auto',
    modules: [{ id: 'm1', title: 'Module one', order: 1 }],
    tasks: [
      {
        id: 'intro', moduleId: 'm1', order: 1, title: 'Intro', type: 'lesson', estimatedMinutes: 30,
        topics: ['basics'], objectives: ['Know it'], verificationQuestions: ['Why?'],
        resources: [{ title: 'Book', kind: 'book', minutes: 20 }],
      },
      {
        id: 'two-sum', moduleId: 'm1', order: 2, title: 'Two Sum', type: 'practice', estimatedMinutes: 40,
        topics: ['arrays-hashing'], description: 'Solve it.', dependsOn: ['intro'],
        practice: { provider: 'leetcode', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy' },
      },
    ],
  }
}

type Mutate = (p: { tasks: Record<string, unknown>[]; modules: Record<string, unknown>[] } & Record<string, unknown>) => void
function texts(mutate: Mutate, input: unknown = basePlan()) {
  mutate(input as Parameters<Mutate>[0])
  return validatePlan(input).issues.map(formatIssue)
}

describe('validatePlan', () => {
  it('accepts a valid plan and applies defaults', () => {
    const r = validatePlan(basePlan())
    expect(r.issues).toEqual([])
    expect(r.plan?.tasks[0]?.priority).toBe('core')
    expect(r.plan?.tasks[1]?.resources).toEqual([])
  })

  it('reads a Markdown file with one json block', () => {
    const text = `# My plan\n\n${FENCE}json\n${JSON.stringify(basePlan(), null, 2)}\n${FENCE}\n\nnotes`
    expect(validatePlan(text).plan?.id).toBe('demo')
  })

  it('reports input and JSON problems and returns no plan', () => {
    expect(validatePlan('nothing here').issues.map(formatIssue)).toEqual(['input: no json block found'])
    expect(validatePlan('{\n  "a": 1,\n}').issues.map(formatIssue)).toEqual(['json: line 3, column 1: unexpected "}"'])
  })

  it('renders shape errors in the spec wording', () => {
    const out = texts((p) => {
      delete p.tasks[1]?.estimatedMinutes
      p.schedulingMode = 'weekly'
      p.tasks[0]!.type = 'reading'
      p.tasks[0]!.estimatedMinutes = 200
      p.tasks[0]!.resources = [{ title: 'Doc', kind: 'docs', url: 'not a url' }]
    })
    expect(out).toContain('plan "Demo plan": schedulingMode must be one of: auto, fixed')
    expect(out).toContain('tasks[1] "Two Sum": estimatedMinutes is required')
    expect(out).toContain('tasks[0] "Intro": type must be one of: lesson, practice, review, project, assessment, milestone')
    expect(out).toContain('tasks[0] "Intro": estimatedMinutes must be an integer from 5 to 180')
    expect(out).toContain('tasks[0].resources[0] "Doc": url must be an absolute http(s) URL')
  })

  it('allows 0 minutes only for milestones', () => {
    const out = texts((p) => {
      p.tasks.push({ id: 'done', moduleId: 'm1', order: 3, title: 'Phase done', type: 'milestone', estimatedMinutes: 0 })
      p.tasks[1]!.estimatedMinutes = 0
    })
    expect(out).toEqual(['tasks[1] "Two Sum": estimatedMinutes must be an integer from 5 to 180'])
    expect(texts((p) => (p.tasks[0]!.type = 'milestone'), basePlan())).toEqual(
      expect.not.arrayContaining([expect.stringContaining('estimatedMinutes')]),
    )
  })

  it('rejects a newer schema version with a clear message', () => {
    expect(texts((p) => (p.schemaVersion = 2))).toEqual([
      'plan "Demo plan": schemaVersion is 2; this plan was made for a newer version of Kiln',
    ])
  })

  it('adds meaning errors to shape errors in one list, in file order', () => {
    const out = texts((p) => {
      p.tasks[1]!.dependsOn = ['nope']
      p.tasks[0]!.title = 'x'.repeat(5)
      delete p.tasks[0]!.type
      p.title = 'Demo plan'
    })
    expect(out).toEqual([
      'tasks[0] "xxxxx": type is required',
      'tasks[1] "Two Sum": dependsOn[0] "nope" does not match any task id',
    ])
  })

  it('warns once with the number of videos that have no link, counting a source link', () => {
    const video = (extra: Record<string, unknown> = {}) => ({ title: 'V', kind: 'video', minutes: 10, ...extra })
    const out = texts((p) => {
      p.sources = [{ id: 'course', title: 'Course', kind: 'course', url: 'https://example.com/c' }, { id: 'book', title: 'Book', kind: 'book' }]
      p.tasks[0]!.resources = [video(), video({ url: 'https://example.com/v' }), video({ sourceId: 'course' }), video({ sourceId: 'book' })]
    })
    expect(out.filter((m) => m.includes('without a link'))).toEqual(['warning: plan "Demo plan": 2 videos without a link'])
  })

  it('treats null and empty strings as absent and trims text', () => {
    const r = validatePlan(
      (() => {
        const p = basePlan()
        const t = (p.tasks as Record<string, unknown>[])[1]!
        t.title = '  Two Sum  '
        t.description = ''
        t.notBeforeDay = null
        ;(p as Record<string, unknown>).goal = null
        return p
      })(),
    )
    expect(r.plan?.tasks[1]?.title).toBe('Two Sum')
    expect(r.plan?.tasks[1]?.description).toBeUndefined()
    expect(r.plan?.goal).toBeUndefined()
    expect(r.issues.map(formatIssue)).toEqual(['warning: tasks[1] "Two Sum": description is missing'])
  })

  it('reports an empty required text as missing', () => {
    expect(texts((p) => (p.tasks[0]!.title = '   '))).toEqual(['tasks[0]: title is required'])
  })

  it('normalizes topics', () => {
    const r = validatePlan(
      (() => {
        const p = basePlan()
        ;(p.tasks as Record<string, unknown>[])[0]!.topics = ['Sliding Window', 'sliding_window', 'Arrays-Hashing']
        return p
      })(),
    )
    expect(r.plan?.tasks[0]?.topics).toEqual(['sliding-window', 'arrays-hashing'])
  })

  it('warns about unknown and derived fields and drops them', () => {
    const input = basePlan()
    input.totalEstimate = 600
    ;(input.tasks as Record<string, unknown>[])[0]!.week = 3
    const r = validatePlan(input)
    expect(r.issues.map(formatIssue)).toEqual([
      'warning: tasks[0] "Intro": week is not a known field and was dropped',
      'warning: plan "Demo plan": totalEstimate is derived by Kiln and was ignored',
    ])
    expect(r.plan).toBeDefined()
    expect(r.plan).not.toHaveProperty('totalEstimate')
    expect(r.plan?.tasks[0]).not.toHaveProperty('week')
  })

  it('returns no plan when there is an error, but keeps the warnings', () => {
    const r = validatePlan(
      (() => {
        const p = basePlan()
        ;(p.tasks as Record<string, unknown>[])[0]!.week = 3
        ;(p.tasks as Record<string, unknown>[])[1]!.dependsOn = ['two-sum']
        return p
      })(),
    )
    expect(r.plan).toBeUndefined()
    expect(r.issues.map((i) => i.severity)).toEqual(['warning', 'error'])
  })

  it('deduplicates dependsOn and warns', () => {
    const input = basePlan()
    ;(input.tasks as Record<string, unknown>[])[1]!.dependsOn = ['intro', 'intro']
    const r = validatePlan(input)
    expect(r.plan?.tasks[1]?.dependsOn).toEqual(['intro'])
    expect(r.issues.map(formatIssue)).toEqual([
      'warning: tasks[1] "Two Sum": dependsOn[1] "intro" is listed twice and was deduplicated',
    ])
  })

  it('reports meaning errors from the spec', () => {
    const out = texts((p) => {
      p.tasks[0]!.fixedDate = '2026-03-01'
      p.tasks[1]!.id = 'intro'
    })
    expect(out).toContain(
      'tasks[0] "Intro": fixedDate is not allowed when schedulingMode is "auto"; use "fixed" or pin the date in Kiln after import',
    )
    expect(out).toContain('tasks[1] "Two Sum": id "intro" is also used by tasks[0]')
  })

  it('caps the list at 100 problems and still withholds the plan', () => {
    const p = basePlan()
    p.tasks = Array.from({ length: 150 }, (_, i) => ({ id: `t${i}`, moduleId: 'm1', order: i + 1, title: `T${i}`, type: 'lesson' }))
    const r = validatePlan(p)
    expect(r.issues).toHaveLength(MAX_ISSUES)
    expect(r.plan).toBeUndefined()
  })

  it('orders list-item problems by index', () => {
    const out = texts((p) => {
      p.tasks[0]!.id = 'a'
      p.tasks[0]!.dependsOn = ['a', 'Bad Id']
    })
    const own = out.filter((t) => t.startsWith('tasks[0]') && t.includes('dependsOn'))
    expect(own).toHaveLength(3)
    expect(own[0]).toContain('dependsOn[0]')
    expect(own.slice(1).every((t) => t.includes('dependsOn[1]'))).toBe(true)
  })

  it('puts a missing required field where the schema has it, not first', () => {
    const out = texts((p) => {
      delete p.tasks[0]!.type
      p.tasks[0]!.estimatedMinutes = 'x'
      p.tasks[0]!.id = 'Bad Id'
    })
    const fields = out.map((t) => /: (\w+)/.exec(t)?.[1])
    expect(fields.slice(0, 3)).toEqual(['id', 'type', 'estimatedMinutes'])
  })

  it('drops empty and null list items, and topics that normalize to nothing', () => {
    const r = validatePlan(
      (() => {
        const p = basePlan()
        const t = (p.tasks as Record<string, unknown>[])[0]!
        t.objectives = ['Know it', '  ', null, '']
        t.topics = ['Basics', '!!!', 'basics']
        return p
      })(),
    )
    expect(r.issues).toEqual([])
    expect(r.plan?.tasks[0]?.objectives).toEqual(['Know it'])
    expect(r.plan?.tasks[0]?.topics).toEqual(['basics'])
  })

  it('keeps the 0-to-180 wording for milestones and 5-to-180 for other types', () => {
    const out = texts((p) => {
      p.tasks.push({ id: 'done', moduleId: 'm1', order: 3, title: 'Phase done', type: 'milestone', estimatedMinutes: 200 })
      p.tasks[0]!.estimatedMinutes = 200
    })
    expect(out).toContain('tasks[2] "Phase done": estimatedMinutes must be an integer from 0 to 180')
    expect(out).toContain('tasks[0] "Intro": estimatedMinutes must be an integer from 5 to 180')
  })

  it('cuts labels at 40 characters without splitting an emoji', () => {
    const emoji = String.fromCodePoint(0x1f600)
    const out = texts((p) => {
      p.tasks[0]!.title = emoji.repeat(45)
      delete p.tasks[0]!.type
    })
    expect(out).toEqual([`tasks[0] "${emoji.repeat(40)}": type is required`])
  })

  it('rejects a non-object top level', () => {
    expect(validatePlan([]).issues.map(formatIssue)).toEqual(['plan: must be an object'])
  })
})
