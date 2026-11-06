// Plan edits and version restores: progress kept, deleted tasks come back, summaries.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Plan } from '../domain/plan-format'
import { fixtureTexts, validateParts } from './fixtures'
import { getPlan, importPlan, listModules, listTasks, setTaskStatus } from './repo'
import { newDb } from './test-db'
import { describeChanges, listPlanVersions, planFromRecords, restoreVersion, savePlanEdit } from './versions'

const TODAY = '2026-11-09'
const sd = () => validateParts([fixtureTexts.sd]).plans[0]!

async function setup() {
  const db = newDb()
  const { planId } = await importPlan(db, sd(), { startDate: TODAY })
  const content = async () => planFromRecords((await getPlan(db, planId))!, await listModules(db, planId), await listTasks(db, planId))
  return { db, planId, content }
}

describe('describeChanges', () => {
  const base = sd()
  const [t1, t2, t3] = base.tasks
  it('counts renames and additions per kind', () => {
    const after: Plan = {
      ...base,
      tasks: [...base.tasks.map((t) => (t === t1 || t === t2 ? { ...t, title: `${t.title} (new)` } : t)), { ...t3!, id: 'extra-task', order: 999 }],
    }
    expect(describeChanges(base, after)).toBe('Renamed 2 tasks, added 1')
  })
  it('reports removals, edits, reorders and plan details', () => {
    const swapped = base.tasks.map((t) => (t === t1 ? { ...t, order: t2!.order } : t === t2 ? { ...t, order: t1!.order } : t))
    const after: Plan = { ...base, title: 'Other', tasks: swapped.filter((t) => t !== t3).map((t) => (t === swapped[3] ? { ...t, estimatedMinutes: 7 } : t)) }
    expect(describeChanges(base, after)).toBe('Renamed the plan, removed 1 task, edited 1, reordered tasks')
  })
  it('says when nothing changed, and renumbering alone is not a reorder', () => {
    expect(describeChanges(base, base)).toBe('No changes')
    expect(describeChanges(base, { ...base, modules: base.modules.map((m) => ({ ...m, order: m.order * 10 })) })).toBe('No changes')
  })
})

describe('savePlanEdit and restoreVersion', () => {
  it('saves by key keeping progress, snapshots before the first edit, and restores an older version', async () => {
    const { db, planId, content } = await setup()
    const before = await content()
    const [done, removed] = (await listTasks(db, planId)).sort((a, b) => a.order - b.order)
    await setTaskStatus(db, done!.id, 'done')
    await setTaskStatus(db, removed!.id, 'done')

    const edited: Plan = {
      ...before,
      tasks: [...before.tasks.filter((t) => t.id !== removed!.key).map((t) => (t.id === done!.key ? { ...t, title: 'Renamed' } : t)), { ...before.tasks[0]!, id: 'added-task', title: 'Added', order: 500 }],
    }
    const pin = '2026-11-20'
    const v = await savePlanEdit(db, planId, edited, { 'added-task': pin })
    expect(v.summary).toBe('Renamed 1 task, added 1, removed 1')

    const live = await listTasks(db, planId)
    expect(live.find((t) => t.id === done!.id)).toMatchObject({ title: 'Renamed', status: 'done' })
    expect(live.find((t) => t.id === removed!.id)).toBeUndefined()
    expect(live.find((t) => t.key === 'added-task')).toMatchObject({ pinnedDate: pin, scheduledDate: pin })

    const versions = await listPlanVersions(db, planId)
    expect(versions.map((x) => x.summary)).toEqual(['Renamed 1 task, added 1, removed 1', 'Before your first edit'])

    // Restore the original: the deleted task comes back done, the added one goes, the rename is undone.
    const r = await restoreVersion(db, planId, versions[1]!)
    expect(r).toMatchObject({ label: 'Restored', summary: 'Renamed 1 task, added 1, removed 1' })
    const after = await listTasks(db, planId)
    expect(after.find((t) => t.id === removed!.id)?.status).toBe('done')
    expect(after.find((t) => t.id === done!.id)).toMatchObject({ title: before.tasks.find((t) => t.id === done!.key)!.title, status: 'done' })
    expect(after.some((t) => t.key === 'added-task')).toBe(false)
    expect(describeChanges(before, await content())).toBe('No changes')
    expect(await listPlanVersions(db, planId)).toHaveLength(3)
  })

  it('deletes and restores whole modules', async () => {
    const { db, planId, content } = await setup()
    const before = await content()
    const gone = before.modules[0]!.id
    await savePlanEdit(db, planId, { ...before, modules: before.modules.slice(1), tasks: before.tasks.filter((t) => t.moduleId !== gone) })
    expect((await listModules(db, planId)).some((m) => m.key === gone)).toBe(false)
    const [, original] = await listPlanVersions(db, planId)
    await restoreVersion(db, planId, original!)
    expect((await listModules(db, planId)).some((m) => m.key === gone)).toBe(true)
    expect((await listTasks(db, planId)).length).toBe(before.tasks.length)
  })
})
