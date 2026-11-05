import { describe, expect, it } from 'vitest'
import dsa from './fixtures/dsa-16-week.plan.md?raw'
import { formatIssue } from './issues'
import { validatePlan } from './validate'

describe('dev fixture: 16-week DSA plan', () => {
  const result = validatePlan(dsa)
  const errors = result.issues.filter((i) => i.severity === 'error')
  const warnings = result.issues.filter((i) => i.severity === 'warning')

  it('validates with no errors', () => {
    expect(errors.map(formatIssue)).toEqual([])
    expect(result.plan).toBeDefined()
  })

  it('has the shape of the source plan', () => {
    const plan = result.plan!
    expect(plan.schedulingMode).toBe('auto')
    expect(plan.modules).toHaveLength(16)
    expect(plan.tasks.filter((t) => t.practice?.provider === 'leetcode')).toHaveLength(59)
    expect(plan.modules.map((m) => m.notBeforeDay)).toEqual([1, 8, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85, 92, 99, 106])
  })

  it('has only a few warnings', () => {
    if (warnings.length > 0) console.info(`dsa-16-week: ${warnings.length} warnings\n${warnings.map(formatIssue).join('\n')}`)
    expect(warnings.length).toBeLessThanOrEqual(10)
  })
})
