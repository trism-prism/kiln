// Test helper: the real plan fixtures, validated the way the import flow does it.
import { validatePlan, type Plan } from '../domain/plan-format'
import dsa1 from '../../fixtures/plans/dsa-part1.json?raw'
import dsa2 from '../../fixtures/plans/dsa-part2.json?raw'
import dsa3 from '../../fixtures/plans/dsa-part3.json?raw'
import sd from '../../fixtures/plans/system-design.json?raw'

export const fixtureTexts = { dsa1, dsa2, dsa3, sd }

/** Validates parts in order, each with the earlier parts as priorParts. Returns plans and error messages. */
export function validateParts(texts: string[]) {
  const tasks = new Map<string, Plan['tasks'][number]['priority']>()
  const sources = new Set<string>()
  const plans: Plan[] = []
  const errors: string[] = []
  for (const text of texts) {
    const r = validatePlan(text, { priorParts: { tasks, sources } })
    errors.push(...r.issues.filter((i) => i.severity === 'error').map((i) => JSON.stringify(i)))
    if (!r.plan) break
    plans.push(r.plan)
    r.plan.tasks.forEach((t) => tasks.set(t.id, t.priority))
    r.plan.sources.forEach((s) => sources.add(s.id))
  }
  return { plans, errors }
}
