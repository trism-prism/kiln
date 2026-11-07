// Plan edits and version restores: progress kept, deleted tasks come back, summaries.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Plan } from '../domain/plan-format'
import { fixtureTexts, validateParts } from './fixtures'
import { getPlan, importPlan, listModules, listTasks, setTaskStatus, updateRecord } from './repo'
import { newDb } from './test-db'
import { describeChanges, editBase, listPlanVersions, MAX_VERSIONS, PLAN_CHANGED, planFromRecords, restoreVersion, savePlanEdit, snapshotPlan } from './versions'

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

describe('review fixes', () => {
  const baseOf = async (db: ReturnType<typeof newDb>, planId: string) => editBase((await getPlan(db, planId))!, await listModules(db, planId), await listTasks(db, planId))

  it('editing a split plan keeps its parts, so it stays incomplete', async () => {
    const db = newDb()
    const [p1, p2] = validateParts([fixtureTexts.dsa1, fixtureTexts.dsa2, fixtureTexts.dsa3]).plans
    const { planId } = await importPlan(db, p1!, { startDate: TODAY })
    await importPlan(db, p2!, { startDate: TODAY })
    expect(await getPlan(db, planId)).toMatchObject({ partTotal: 3, partsIn: [1, 2] })
    const content = planFromRecords((await getPlan(db, planId))!, await listModules(db, planId), await listTasks(db, planId))
    await savePlanEdit(db, planId, { ...content, title: 'Edited' })
    expect(await getPlan(db, planId)).toMatchObject({ title: 'Edited', partTotal: 3, partsIn: [1, 2] })
    await restoreVersion(db, planId, (await listPlanVersions(db, planId))[1]!)
    expect(await getPlan(db, planId)).toMatchObject({ partTotal: 3, partsIn: [1, 2] })
  })

  it('a stale editor keeps what another device added and refuses when a record changed', async () => {
    const { db, planId, content } = await setup()
    const before = await content()
    const base = await baseOf(db, planId)
    // Another device adds a task.
    await importPlan(db, { ...before, tasks: [...before.tasks, { ...before.tasks[0]!, id: 'from-elsewhere', title: 'Elsewhere', order: 900 }] }, { startDate: TODAY })
    const gone = before.tasks[1]!
    await savePlanEdit(db, planId, { ...before, title: 'Mine', tasks: before.tasks.filter((t) => t.id !== gone.id) }, {}, base)
    const live = await listTasks(db, planId)
    expect(live.some((t) => t.key === 'from-elsewhere')).toBe(true)
    expect(live.some((t) => t.key === gone.id)).toBe(false)
    expect((await getPlan(db, planId))!.title).toBe('Mine')

    // Now a base record changes underneath: refused, nothing written.
    const base2 = await baseOf(db, planId)
    const target = (await listTasks(db, planId))[0]!
    await updateRecord(db, 'tasks', target.id, { title: 'Changed elsewhere' })
    const stale = await content()
    await expect(savePlanEdit(db, planId, { ...stale, title: 'Overwrite' }, {}, base2)).rejects.toThrow(PLAN_CHANGED)
    expect((await getPlan(db, planId))!.title).toBe('Mine')
    expect((await listTasks(db, planId)).find((t) => t.id === target.id)!.title).toBe('Changed elsewhere')
  })

  it('progress made on another device while the editor is open does not block the save and is kept', async () => {
    const { db, planId, content } = await setup()
    const before = await content()
    const base = await baseOf(db, planId)
    const target = (await listTasks(db, planId)).sort((a, b) => a.order - b.order)[0]!
    await setTaskStatus(db, target.id, 'done')
    await savePlanEdit(db, planId, { ...before, tasks: before.tasks.map((t) => (t.id === target.key ? { ...t, title: 'Edited while done elsewhere' } : t)) }, {}, base)
    expect((await listTasks(db, planId)).find((t) => t.id === target.id)).toMatchObject({ title: 'Edited while done elsewhere', status: 'done' })
  })

  it('a version made with the clock behind is still the newest, and only 20 are kept', async () => {
    const { db, planId } = await setup()
    const first = await snapshotPlan(db, planId, { summary: 'first' })
    const spy = vi.spyOn(Date, 'now').mockReturnValue(first.createdAt - 100_000)
    const skewed = await snapshotPlan(db, planId, { summary: 'skewed' })
    spy.mockRestore()
    expect(skewed.createdAt).toBeGreaterThan(first.createdAt)
    expect((await listPlanVersions(db, planId))[0]!.summary).toBe('skewed')
    for (let i = 0; i < 25; i++) await snapshotPlan(db, planId, { summary: `v${i}` })
    const kept = await listPlanVersions(db, planId)
    expect(kept).toHaveLength(MAX_VERSIONS)
    expect(kept[0]!.summary).toBe('v24')
    expect(kept.some((v) => v.summary === 'first')).toBe(false)
  })

  it('the daily practice setting survives an edit', async () => {
    const { db, planId, content } = await setup()
    await updateRecord(db, 'plans', planId, { dailyPracticeOn: false })
    await savePlanEdit(db, planId, { ...(await content()), title: 'Edited' })
    expect((await getPlan(db, planId))!.dailyPracticeOn).toBe(false)
  })
})
