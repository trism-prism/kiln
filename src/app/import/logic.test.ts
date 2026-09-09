/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newDbForTests, fixtureTexts, importPlan } from './test-support'
import { validatePlan, formatIssue } from '../../domain/plan-format'
import { analyze, decideMatch, defaultChoice, detect, effectiveId, peekJson, slugify, splitIssues, summarize, type Details } from './logic'
import { buildPlan, type Draft, type DraftTask } from './builder'

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

const task = (fields: Partial<DraftTask>): DraftTask => ({ uid: `u${Math.random()}`, title: 'Task', type: 'lesson', minutes: '30', priority: 'core', due: '', links: '', ...fields })

describe('builder', () => {
  const draft = (): Draft => ({
    title: 'Hand made',
    modules: [{ uid: 'm', title: 'Basics', tasks: [task({ title: 'Read chapter one', minutes: '45' }), task({ title: 'Two Sum', type: 'practice' })] }],
  })
  const opts = { id: 'hand-made', startDate: '2026-11-09' }
  const errors = (r: ReturnType<typeof validatePlan>) => r.issues.filter((i) => i.severity === 'error').map(formatIssue)

  it('makes an auto plan that validates', () => {
    const r = validatePlan(buildPlan(draft(), opts))
    expect(errors(r)).toEqual([])
    expect(r.plan?.schedulingMode).toBe('auto')
    expect(r.plan?.tasks.map((t) => t.id)).toEqual(['read-chapter-one', 'two-sum'])
  })

  it('a due date makes the plan fixed with the start date', () => {
    const d = draft()
    d.modules[0]!.tasks[0]!.due = '2026-11-12'
    const r = validatePlan(buildPlan(d, opts))
    expect(errors(r)).toEqual([])
    expect(r.plan).toMatchObject({ schedulingMode: 'fixed', startDate: '2026-11-09' })
    expect(r.plan?.tasks[0]?.deadline).toBe('2026-11-12')
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

  it('analyze validates a built plan under the given id', async () => {
    const a = await analyze(newDbForTests(), { kind: 'build', draft: draft() }, { ...details, id: 'hand-made' })
    expect(splitIssues(a.result.issues).errors).toEqual([])
    expect(a.result.plan?.id).toBe('hand-made')
  })
})

describe('defaultChoice', () => {
  it('updates when the title matches and copies when it differs', async () => {
    const db = newDbForTests()
    const plan = validatePlan(fixtureTexts.sd).plan!
    await importPlan(db, plan, { startDate: '2026-11-09' })
    const existing = (await db.plans.toArray())[0]
    expect(defaultChoice(existing, plan)).toBe('update')
    expect(defaultChoice(existing, { title: 'Another plan with the same id' })).toBe('copy')
    expect(defaultChoice(undefined, plan)).toBe('update')
  })
})

describe('builder minutes', () => {
  const run = (minutes: string, type: DraftTask['type'] = 'lesson') =>
    validatePlan(buildPlan({ title: 'T', modules: [{ uid: 'm', title: 'M', tasks: [task({ minutes, type })] }] }, { id: 't', startDate: '2026-11-09' }))
      .issues.filter((i) => i.severity === 'error')
      .map(formatIssue)
  it('accepts whole minutes from 5 to 180', () => {
    expect(run('5')).toEqual([])
    expect(run('180')).toEqual([])
  })
  it('rejects 4, 181, decimals, negatives and text', () => {
    for (const bad of ['4', '181', '1.5', '-5', 'abc', '']) expect(run(bad)).toHaveLength(1)
    expect(run('4')[0]).toContain('from 5 to 180')
  })
  it('allows 0 for a milestone, also when left blank', () => {
    expect(run('0', 'milestone')).toEqual([])
    expect(run('', 'milestone')).toEqual([])
    expect(run('0')).toHaveLength(1)
  })
})
