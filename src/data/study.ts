// Study time plans' sessions: the scheduler's generated sessions stored per plan and day (studyItems), so they
// can be listed, counted in the badge and checked off. Ids are `${planId}:${date}`: two devices that generate
// the same session write the same record, so a sync never makes duplicates. topUpStudy and refreshStudy, which run
// the scheduler, are in schedule.ts (this file is imported by it).
import { STUDY_WINDOW_DAYS as DOMAIN_WINDOW, type GeneratedStudy } from '../domain/scheduler'
import { addDaysISO } from '../lib/date'
import type { KilnDB } from './db'
import { getDeviceId, listPlans, revertWrite, stampAfter, updateRecord } from './repo'
import type { PlanRecord, StudyItemRecord } from './types'

/** Sessions are stored from today through today + this many days (To Do shows at most "In 4 Weeks"). */
export const STUDY_WINDOW_DAYS = DOMAIN_WINDOW

/** Tombstoned sessions dated more than this many days back are removed outright (they would only fill sync). */
export const STUDY_TOMBSTONE_DAYS = 60

export const studyItemId = (planId: string, date: string) => `${planId}:${date}`

export const isStudyPlan = (p: Pick<PlanRecord, 'studyMinutesPerWeek'>) => p.studyMinutesPerWeek !== undefined

/**
 * Stores the scheduler's sessions. Call inside a transaction that includes studyItems. Rules:
 * - Rows dated before today are never written: a missed open session is simply ignored by every reader, and
 *   writing it would give a stale copy a fresh stamp that could beat another device's completion in a sync.
 * - Done sessions are never touched, and a tombstoned done session is never revived.
 * - From today through the window: a wanted session with no row is added, an open row with other minutes is
 *   updated in place, an open row not wanted is tombstoned, a tombstoned open row wanted again is revived.
 * - Open rows of a plan that is not a live study plan (deleted, or not in `plans`) are tombstoned.
 * - Tombstones dated more than STUDY_TOMBSTONE_DAYS back are deleted.
 */
export async function persistStudy(db: KilnDB, deviceId: string, today: string, generated: GeneratedStudy[], plans: PlanRecord[]): Promise<void> {
  const study = new Set(plans.filter(isStudyPlan).map((p) => p.id))
  const end = addDaysISO(today, STUDY_WINDOW_DAYS)
  const prune = addDaysISO(today, -STUDY_TOMBSTONE_DAYS)
  const wanted = new Map<string, GeneratedStudy>()
  for (const g of generated) if (study.has(g.planId) && g.date >= today && g.date <= end) wanted.set(studyItemId(g.planId, g.date), g)

  const stamp = (r: StudyItemRecord) => ({ updatedAt: stampAfter(r.updatedAt), deviceId })
  const out: StudyItemRecord[] = []
  const gone: string[] = []
  for (const r of await db.studyItems.toArray()) {
    const g = wanted.get(r.id)
    wanted.delete(r.id)
    if (r.date < today) {
      if (r.deleted && r.date < prune) gone.push(r.id)
    } else if (r.deleted) {
      if (g && r.status === 'open') out.push({ ...r, deleted: false, minutes: g.minutes, completedAt: undefined, ...stamp(r) })
    } else if (r.status === 'done') continue
    else if (!g) out.push({ ...r, deleted: true, ...stamp(r) })
    else if (r.minutes !== g.minutes) out.push({ ...r, minutes: g.minutes, ...stamp(r) })
  }
  for (const [id, g] of wanted) out.push({ id, planId: g.planId, date: g.date, minutes: g.minutes, status: 'open', deleted: false, updatedAt: stampAfter(), deviceId })
  await db.studyItems.bulkPut(out)
  await db.studyItems.bulkDelete(gone)
}

export interface StudyResult {
  item: StudyItemRecord
  /** Puts the session back to open, unless it changed since. */
  undo: () => Promise<boolean>
}

/** Marks a session done. Nothing is rescheduled: the session counted as planned, so the week's other days stay. */
export async function completeStudy(db: KilnDB, id: string, now: number): Promise<StudyResult> {
  await getDeviceId(db)
  return db.transaction('rw', db.studyItems, async () => {
    const before = await db.studyItems.get(id)
    if (!before || before.deleted) throw new Error('This study session is no longer planned')
    const item = (await updateRecord(db, 'studyItems', id, { status: 'done', completedAt: now }))!
    return { item, undo: () => revertWrite(db, { restore: [['studyItems', before, item.updatedAt]] }) }
  })
}

/** True when a live study time plan exists. */
export const hasStudyPlan = async (db: KilnDB) => (await listPlans(db)).some(isStudyPlan)
