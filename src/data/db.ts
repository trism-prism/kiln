import Dexie, { type EntityTable } from 'dexie'
import type {
  MetaRecord,
  ModuleRecord,
  PlanRecord,
  PracticeLogRecord,
  ReviewCardRecord,
  ReviewLogRecord,
  SettingsRecord,
  TaskRecord,
} from './types'

export class KilnDB extends Dexie {
  plans!: EntityTable<PlanRecord, 'id'>
  modules!: EntityTable<ModuleRecord, 'id'>
  tasks!: EntityTable<TaskRecord, 'id'>
  reviewCards!: EntityTable<ReviewCardRecord, 'id'>
  reviewLogs!: EntityTable<ReviewLogRecord, 'id'>
  practiceLog!: EntityTable<PracticeLogRecord, 'id'>
  settings!: EntityTable<SettingsRecord, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(name = 'kiln') {
    super(name)

    // Migrations: one `this.version(n)` block per schema change, oldest first, never edited once
    // shipped. List only the tables whose indexes change (Dexie carries the rest forward) and move
    // data in `.upgrade(tx => ...)`. See README.md.
    //
    // IndexedDB cannot index booleans, so `deleted` is filtered in code (see repo.ts).
    this.version(1).stores({
      plans: 'id, key, updatedAt',
      modules: 'id, [planId+key], planId, updatedAt',
      tasks: 'id, [planId+key], planId, moduleId, scheduledDate, pinnedDate, status, *topics, updatedAt',
      reviewCards: 'id, taskId, planId, due, updatedAt',
      reviewLogs: 'id, cardId, reviewedAt, updatedAt',
      practiceLog: 'id, date, slug, updatedAt',
      settings: 'id, updatedAt',
      meta: 'key',
    })

    // 2: review cards follow ts-fsrs 6's card (learningSteps replaces elapsedDays) and keep their
    // review-time estimate. No index changes.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('reviewCards').toCollection().modify((c: Record<string, unknown>) => {
          delete c.elapsedDays
          c.learningSteps ??= 0
          c.minutes ??= 10
        })
        await tx.table('reviewLogs').toCollection().modify((l: Record<string, unknown>) => {
          delete l.elapsedDays
          l.learningSteps ??= 0
        })
      })
  }
}

/** The app's database. Tests make their own with `new KilnDB(name)`. */
export const db = new KilnDB()
