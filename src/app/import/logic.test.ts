/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newDbForTests, fixtureTexts, importPlan } from './test-support'
import { validatePlan, formatIssue } from '../../domain/plan-format'
import { analyze, decideMatch, detect, effectiveId, peekJson, slugify, splitIssues, summarize, type Details } from './logic'
import { buildPlan, emptyDraft, emptyTask } from './builder'

const csv = readFileSync(new URL('../../../public/kiln-plan-template.csv', import.meta.url), 'utf8')
const details: Details = { title: 'Template', id: '', goal: '', startDate: '2026-11-09', deadline: '' }

describe('detect', () => {
  it('reads pasted sheet cells (comma or tab) as a sheet and everything else as JSON', () => {
    expect(detect({ kind: 'text', text: csv })).toBe('sheet')
    expect(detect({ kind: 'text', text: csv.replace(/,/g, '\t') })).toBe('sheet')
    expect(detect({ kind: 'text', text: fixtureTexts.sd })).toBe('json')
    expect(detect({ kind: 'text', text: '# Plan\n```json\n{}\n```' })).toBe('json')
  })
  it('goes by file type for .csv and .xlsx', () => {
    expect(detect({ kind: 'text', text: 'anything', fileName: 'Plan.CSV' })).toBe('sheet')
    expect(detect({ kind: 'xlsx', data: new ArrayBuffer(0), fileName: 'x.xlsx' })).toBe('sheet')
  })
  it('peeks at the id and part of a JSON plan, also inside a Markdown block', () => {
    expect(peekJson(fixtureTexts.dsa2)).toMatchObject({ id: 'dsa-zero-to-hero-python', part: { index: 2, total: 3 } })
    expect(peekJson('text\n```json\n{"id":"a"}\n```')).toEqual({ id: 'a', part: undefined })
    expect(peekJson('not json')).toEqual({})
  })
})

describe('analyze', () => {
  it('validates the CSV template as a sheet and reports a bad row', async () => {
    const db = newDbForTests()
    const ok = await analyze(db, { kind: 'text', text: csv }, details)
    expect(ok.detected).toBe('sheet')
    expect(ok.result.plan?.id).toBe('template')
    expect(ok.existing).toBeUndefined()
    const bad = await analyze(db, { kind: 'text', text: csv.replace(',lesson,60,', ',lesson,,') }, details)
    expect(bad.result.plan).toBeUndefined()
    expect(splitIssues(bad.result.issues).errors.map(formatIssue)).toEqual([
      'row 2 "Hash maps and lookups": estimatedMinutes is required',
    ])
  })

  it('a later part validates only with the stored earlier parts', async () => {
    const db = newDbForTests()
    const alone = await analyze(db, { kind: 'text', text: fixtureTexts.dsa2 }, details)
    expect(alone.existing).toBeUndefined()
    await importPlan(db, validatePlan(fixtureTexts.dsa1).plan!, { startDate: '2026-11-09' })
    const withPrior = await analyze(db, { kind: 'text', text: fixtureTexts.dsa2 }, details)
    expect(splitIssues(withPrior.result.issues).errors.map(formatIssue)).toEqual([])
    expect(withPrior.existing?.key).toBe('dsa-zero-to-hero-python')
    expect(withPrior.existingTaskKeys.size).toBeGreaterThan(10)
  })

  it('a stored sheet id matches an existing plan', async () => {
    const db = newDbForTests()
    const first = await analyze(db, { kind: 'text', text: csv }, details)
    await importPlan(db, first.result.plan!, { startDate: '2026-11-09' })
    const again = await analyze(db, { kind: 'text', text: csv }, details)
    expect(again.existing?.key).toBe('template')
    expect([...again.keys]).toEqual(['template'])
  })
})

describe('decideMatch', () => {
  const planOf = (text: string) => validatePlan(text).plan!
  const stored = async (...texts: string[]) => {
    const db = newDbForTests()
    for (const t of texts) await importPlan(db, planOf(t), { startDate: '2026-11-09' })
    return (await db.plans.toArray())[0]
  }

  it('new plan', () => {
    expect(decideMatch(planOf(fixtureTexts.sd), undefined, 'update')).toMatchObject({ kind: 'new', choices: [] })
  })
  it('a later part with no stored plan is blocked', () => {
    const m = decideMatch(planOf(fixtureTexts.dsa2), undefined, 'update')
    expect(m.kind).toBe('blocked')
    expect(m.label).toContain('Import part 1 first')
  })
  it('an existing id offers update or copy, and follows the choice', async () => {
    const existing = await stored(fixtureTexts.sd)
    const plan = planOf(fixtureTexts.sd)
    expect(decideMatch(plan, existing, 'update')).toMatchObject({ kind: 'update', choices: ['update', 'copy'] })
    expect(decideMatch(plan, existing, 'copy')).toMatchObject({ kind: 'copy', choices: ['update', 'copy'] })
  })
  it('adds a part, and updates a part that is already in', async () => {
    const existing = await stored(fixtureTexts.dsa1)
    const part2 = decideMatch(planOf(fixtureTexts.dsa2), existing, 'copy')
    expect(part2).toMatchObject({ kind: 'part', choices: [] })
    expect(part2.label).toBe('Add part 2 of 3 to "DSA Zero to Hero in Python"')
    expect(decideMatch(planOf(fixtureTexts.dsa1), existing, 'copy')).toMatchObject({ kind: 'copy' })
    const both = await stored(fixtureTexts.dsa1, fixtureTexts.dsa2)
    expect(decideMatch(planOf(fixtureTexts.dsa2), both, 'copy')).toMatchObject({ kind: 'update', choices: [] })
  })
})

describe('summarize and ids', () => {
  it('adds up minutes by priority', () => {
    const s = summarize(validatePlan(fixtureTexts.sd).plan!)
    expect(s.tasks).toBe(34)
    expect(s.modules).toBe(5)
    expect(s.minutesByPriority.core + s.minutesByPriority.recommended + s.minutesByPriority.optional).toBe(s.totalMinutes)
  })
  it('makes slugs and falls back to "plan"', () => {
    expect(slugify('  DSA: Zero to Hero!  ')).toBe('dsa-zero-to-hero')
    expect(effectiveId({ id: '', title: '???' })).toBe('plan')
    expect(effectiveId({ id: ' my-id ', title: 'x' })).toBe('my-id')
  })
})

describe('builder', () => {
  const draft = () => {
    const d = emptyDraft()
    d.title = 'Hand made'
    const m = d.modules[0]!
    m.title = 'Basics'
    Object.assign(m.tasks[0]!, { title: 'Read chapter one', minutes: '45', topics: 'arrays, hash maps' })
    const second = emptyTask()
    Object.assign(second, { title: 'Two Sum', type: 'practice', minutes: '30', slug: 'two-sum', dependsOn: [m.tasks[0]!.uid] })
    m.tasks.push(second)
    return d
  }
  const opts = { id: 'hand-made', startDate: '2026-11-09' }
  const errors = (r: ReturnType<typeof validatePlan>) => r.issues.filter((i) => i.severity === 'error').map(formatIssue)

  it('makes a plan that validates', () => {
    const r = validatePlan(buildPlan(draft(), opts))
    expect(errors(r)).toEqual([])
    expect(r.plan?.schedulingMode).toBe('auto')
    expect(r.plan?.tasks.map((t) => t.id)).toEqual(['read-chapter-one', 'two-sum'])
    expect(r.plan?.tasks[1]).toMatchObject({ dependsOn: ['read-chapter-one'], practice: { slug: 'two-sum', difficulty: 'easy' } })
    expect(r.plan?.tasks[0]?.topics).toEqual(['arrays', 'hash-maps'])
  })

  it('pins a date: the plan becomes fixed and takes the start date', () => {
    const d = draft()
    d.modules[0]!.tasks[0]!.pinned = '2026-11-12'
    const r = validatePlan(buildPlan(d, opts))
    expect(errors(r)).toEqual([])
    expect(r.plan).toMatchObject({ schedulingMode: 'fixed', startDate: '2026-11-09' })
    expect(r.plan?.tasks[0]?.fixedDate).toBe('2026-11-12')
  })

  it('keeps ids unique when titles repeat, and reports a missing duration as the validator does', () => {
    const d = draft()
    d.modules[0]!.tasks[1]!.title = 'Read chapter one'
    d.modules[0]!.tasks[0]!.minutes = ''
    const r = validatePlan(buildPlan(d, opts))
    expect(r.issues.map(formatIssue)).toContain('tasks[0] "Read chapter one": estimatedMinutes is required')
    const plan = buildPlan(d, opts) as { tasks: { id: string }[] }
    expect(plan.tasks.map((t) => t.id)).toEqual(['read-chapter-one', 'read-chapter-one-2'])
  })

  it('an unknown LeetCode slug is a warning from the validator', async () => {
    const d = draft()
    d.modules[0]!.tasks[1]!.slug = 'not-a-real-problem'
    const a = await analyze(newDbForTests(), { kind: 'build', draft: d }, { ...details, id: 'hand-made' })
    expect(splitIssues(a.result.issues).warnings.map(formatIssue).join('\n')).toContain('not-a-real-problem')
  })
})
