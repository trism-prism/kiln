// Schema 5: the studyItems table (study time plans' sessions). A new table only: older data is untouched.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { KilnDB } from './db'
import { uuidv7 } from './uuid'

describe('migration to version 5', () => {
  it('reopens a version 4 database with its rows intact and an empty studyItems table', async () => {
    const name = `test-${uuidv7()}`
    const v4 = new Dexie(name)
    v4.version(4).stores({
      plans: 'id, key, updatedAt',
      modules: 'id, [planId+key], planId, updatedAt',
      tasks: 'id, [planId+key], planId, moduleId, scheduledDate, pinnedDate, status, *topics, updatedAt',
      reviewCards: 'id, taskId, planId, due, updatedAt',
      reviewLogs: 'id, cardId, reviewedAt, updatedAt',
      practiceLog: 'id, date, slug, updatedAt',
      practiceItems: 'id, [planId+date+slug], date, planId, updatedAt',
      settings: 'id, updatedAt',
      meta: 'key',
      personalTodos: 'id, date, updatedAt',
      events: 'id, date, planId, feedId, uid, updatedAt',
      planVersions: 'id, planId, updatedAt',
      feeds: 'id, updatedAt',
    })
    const plan = { id: 'p1', key: 'p1', title: 'P', schedulingMode: 'auto', sources: [], weight: 3, share: 'even', startDate: '2026-11-09', partTotal: 1, partsIn: [1], updatedAt: 7, deleted: false, deviceId: 'd' }
    const todo = { id: 't1', title: 'Errand', done: false, updatedAt: 7, deleted: false, deviceId: 'd' }
    await v4.table('plans').add(plan)
    await v4.table('personalTodos').add(todo)
    v4.close()

    const db = new KilnDB(name)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.plans.toArray()).toEqual([plan])
    expect(await db.personalTodos.toArray()).toEqual([todo])
    expect(await db.studyItems.count()).toBe(0)
    db.close()
  })
})
