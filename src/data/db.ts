import { cardMinutes } from '../domain/mastery'
import Dexie, { type EntityTable } from 'dexie'
import { SHARE_WEIGHT, shareFromWeight } from './plan-settings'
import type {
  EventRecord,
  FeedRecord,
  MetaRecord,
  ModuleRecord,
  PersonalTodoRecord,
  PlanRecord,
  PlanVersionRecord,
  PracticeItemRecord,
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
  practiceItems!: EntityTable<PracticeItemRecord, 'id'>
  settings!: EntityTable<SettingsRecord, 'id'>
  personalTodos!: EntityTable<PersonalTodoRecord, 'id'>
  events!: EntityTable<EventRecord, 'id'>
  planVersions!: EntityTable<PlanVersionRecord, 'id'>
  feeds!: EntityTable<FeedRecord, 'id'>
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
    // review-time estimate. No index changes. Raw writes without updatedAt/deviceId on purpose: the
    // upgrade runs on every device, and bumping updatedAt would make every row win the next sync.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const tasks = tx.table('tasks')
        for (const c of await tx.table('reviewCards').toArray()) {
          const task = c.taskId ? await tasks.get(c.taskId) : undefined
          delete c.elapsedDays
          c.learningSteps ??= 0
          c.minutes ??= (task && cardMinutes(task)) ?? 10
          await tx.table('reviewCards').put(c)
        }
        await tx.table('reviewLogs').toCollection().modify((l: Record<string, unknown>) => {
          delete l.elapsedDays
          l.learningSteps ??= 0
        })
      })

    // 3: generated daily problems are stored (practiceItems) so they are stable and can be checked off.
    // A new table: nothing to migrate.
    this.version(3).stores({
      practiceItems: 'id, [planId+date+slug], date, planId, updatedAt',
    })

    // 4: personal to-dos, calendar events, plan versions and calendar feeds; plans get `share` from
    // their weight (1-2 less, 3 even, 4-5 more) and the weight moves to the share's (2, 3, 5).
    // Raw writes without updatedAt/deviceId, as in version 2.
    this.version(4)
      .stores({
        personalTodos: 'id, date, updatedAt',
        events: 'id, date, planId, feedId, uid, updatedAt',
        planVersions: 'id, planId, updatedAt',
        feeds: 'id, updatedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('plans').toCollection().modify((p: PlanRecord) => {
          p.share ??= shareFromWeight(p.weight)
          p.weight = SHARE_WEIGHT[p.share]
        })
      })
  }
}

/** The app's database. Tests make their own with `new KilnDB(name)`. */
export const db = new KilnDB()
