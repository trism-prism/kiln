import { describe, expect, it } from 'vitest'
import { fixtureTexts, validateParts } from './fixtures'
import { previewImport } from './preview'
import { importPlan, listPlans, listTasks } from './repo'
import { resetLocalData } from './reset'
import { newDb } from './test-db'

const TODAY = '2026-11-09'
const [dsa1] = validateParts([fixtureTexts.dsa1]).plans

describe('previewImport', () => {
  it('returns dated tasks and writes nothing', async () => {
    const db = newDb()
    const p = await previewImport(db, dsa1!, { startDate: TODAY }, TODAY)
    expect(p.result.created).toBe(true)
    expect(p.tasks.length).toBeGreaterThan(10)
    expect(p.tasks.some((t) => t.scheduledDate !== undefined)).toBe(false) // part 1 of 3 is not scheduled yet
    expect(await listPlans(db)).toEqual([])
    expect(await db.tasks.count()).toBe(0)
  })

  it('schedules a complete plan and leaves the stored plan alone', async () => {
    const db = newDb()
    const sd = validateParts([fixtureTexts.sd]).plans[0]!
    const p = await previewImport(db, sd, { startDate: TODAY }, TODAY)
    expect(p.tasks.filter((t) => t.scheduledDate).length).toBeGreaterThan(10)
    expect(p.output.projectedFinish[p.result.planId]).toBeTruthy()
    expect(await db.tasks.count()).toBe(0)
    // a real import afterwards is unaffected
    await importPlan(db, sd, { startDate: TODAY })
    expect(await db.plans.count()).toBe(1)
  })
})

describe('resetLocalData', () => {
  it('clears the synced tables', async () => {
    const db = newDb()
    await importPlan(db, dsa1!, { startDate: TODAY })
    expect((await listTasks(db, (await listPlans(db))[0]!.id)).length).toBeGreaterThan(0)
    await resetLocalData(db)
    expect(await db.plans.count()).toBe(0)
    expect(await db.tasks.count()).toBe(0)
  })
})
