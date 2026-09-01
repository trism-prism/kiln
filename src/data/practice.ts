// Daily LeetCode problems the scheduler generates: stored per (plan, date, slug) so they are stable
// between runs and can be checked off. Finished ones also go to practiceLog, which feeds the ramp.
import {
  LEETCODE_REVIEW_MINUTES,
  localDate,
  newCard,
  rate,
  RATING_VALUE,
  type RatingName,
  type SchedulerOptions,
} from '../domain/mastery'
import type { GeneratedPractice } from '../domain/scheduler'
import type { KilnDB } from './db'
import { getDeviceId, insertRecord, revertWrite, updateRecord } from './repo'
import type { PracticeItemRecord, PracticeLogRecord, ReviewCardRecord, ReviewLogRecord } from './types'
import { uuidv7 } from './uuid'

const APP_OPTS: SchedulerOptions = { fuzz: true }
const key = (r: { date: string; slug: string }) => `${r.date}|${r.slug}`

export const leetcodeUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`

/**
 * Stores the scheduler's generated problems for `plans`. Call inside a transaction that includes
 * practiceItems. Rules:
 * - Finished items and items before `today` are never touched (except open past ones when
 *   `dropOverdue` is set, which a reschedule uses: it generates fresh problems from today).
 * - Today's stored items stay as they are, so the day's list does not change under the learner.
 * - Open items after today follow the new output, but only as far as the output reaches: the scheduler
 *   generates problems only while it still has tasks to place, so a run with nothing to place (all
 *   tasks already dated) generates none and must not wipe the stored ones. Within that reach an item
 *   is kept when the same, tombstoned when not, and new ones are added.
 */
export async function persistPractice(
  db: KilnDB,
  deviceId: string,
  today: string,
  generated: GeneratedPractice[],
  plans: { id: string; generates: boolean }[],
  dropOverdue: boolean,
): Promise<void> {
  const stamp = { updatedAt: Date.now(), deviceId }
  const all = (await db.practiceItems.toArray()).filter((r) => !r.deleted)
  const out: PracticeItemRecord[] = []
  for (const { id: planId, generates } of plans) {
    const mine = all.filter((r) => r.planId === planId)
    const wanted = generated.filter((g) => g.planId === planId && g.date >= today)
    const wantedKeys = new Set(wanted.map(key))
    // A plan with no generated problems at all (daily practice removed or not from NeetCode) keeps none.
    const reach = generates ? wanted.reduce((m, g) => (g.date > m ? g.date : m), '') : '9999-12-31'
    const kept = new Set<string>()
    const hasToday = mine.some((r) => r.date === today)
    for (const r of mine) {
      const stale = r.status === 'open' && ((r.date < today && dropOverdue) || (r.date > today && r.date <= reach && !wantedKeys.has(key(r))))
      if (stale) out.push({ ...r, deleted: true, ...stamp })
      else kept.add(key(r))
    }
    // A problem already stored on another day is not offered again.
    const keptSlugs = new Set(mine.filter((r) => kept.has(key(r))).map((r) => r.slug))
    for (const g of wanted) {
      if (kept.has(key(g)) || keptSlugs.has(g.slug) || (g.date === today && hasToday)) continue
      keptSlugs.add(g.slug)
      out.push({
        id: uuidv7(),
        planId,
        date: g.date,
        slug: g.slug,
        title: g.title,
        difficulty: g.difficulty,
        topic: g.topic,
        minutes: g.minutes,
        status: 'open',
        deleted: false,
        ...stamp,
      })
    }
  }
  await db.practiceItems.bulkPut(out)
}

export interface PracticeResult {
  item: PracticeItemRecord
  card: ReviewCardRecord
  log: ReviewLogRecord
  /** Puts the item, the practice log row and the card back as they were. */
  undo: () => Promise<boolean>
}

/**
 * Marks a generated daily problem done with a rating, the way completeTask does for a plan problem:
 * the first time it writes a practiceLog row (the streak and the ramp read it) and creates the
 * re-solve review card (15/25/35 minutes by difficulty); again, it only rates the existing card.
 * Atomic.
 */
export async function completePractice(
  db: KilnDB,
  itemId: string,
  rating: RatingName,
  now: number,
  opts: SchedulerOptions = APP_OPTS,
): Promise<PracticeResult> {
  await getDeviceId(db)
  return db.transaction('rw', db.practiceItems, db.practiceLog, db.reviewCards, db.reviewLogs, async () => {
    const before = await db.practiceItems.get(itemId)
    if (!before || before.deleted) throw new Error(`Practice item ${itemId} not found`)
    const item = (await updateRecord(db, 'practiceItems', itemId, { status: 'done', rating: RATING_VALUE[rating], completedAt: now }))!

    const existing = (await db.reviewCards.toArray())
      .filter((c) => !c.deleted && !c.taskId && c.slug === item.slug)
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    const { card, log } = rate(existing ?? newCard(now), rating, now, opts)
    const rec = existing
      ? (await updateRecord(db, 'reviewCards', existing.id, { ...card, suspended: false }))!
      : await insertRecord(db, 'reviewCards', {
          ...card,
          planId: item.planId,
          slug: item.slug,
          topics: item.topic ? [item.topic] : [],
          minutes: LEETCODE_REVIEW_MINUTES[item.difficulty],
        })
    const logRec = await insertRecord(db, 'reviewLogs', { cardId: rec.id, ...log })

    let practiceRow: PracticeLogRecord | undefined
    if (before.status !== 'done') {
      practiceRow = await insertRecord(db, 'practiceLog', {
        date: localDate(now),
        planId: item.planId,
        slug: item.slug,
        title: item.title,
        difficulty: item.difficulty,
        topic: item.topic,
        rating: RATING_VALUE[rating],
        completedAt: now,
      })
    }
    const undo = () =>
      revertWrite(db, {
        restore: existing ? [['practiceItems', before, item.updatedAt], ['reviewCards', existing, rec.updatedAt]] : [['practiceItems', before, item.updatedAt]],
        remove: [
          ['reviewLogs', logRec.id],
          ...(existing ? [] : [['reviewCards', rec.id] as ['reviewCards', string]]),
          ...(practiceRow ? [['practiceLog', practiceRow.id] as ['practiceLog', string]] : []),
        ],
      })
    return { item, card: rec, log: logRec, undo }
  })
}
