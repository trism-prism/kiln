// Completions for the streak and the heatmap. Reads only.
import type { StudyEvent } from '../domain/streaks'
import type { KilnDB } from './db'

/**
 * Every completion: tasks marked done, daily problems marked done, study sessions marked done, personal to-dos with minutes marked done
 * (which is also how "Log study time" records a session), and reviews logged. A card's first rating (state New) is
 * the completion of its task or problem, which is counted above, so only later ratings count as reviews.
 * Minutes: the task's estimate, the problem's minutes, the to-do's minutes, the card's review
 * minutes. Imported past tasks are done without `completedAt`, so they never count.
 */
export async function studyEvents(db: KilnDB): Promise<StudyEvent[]> {
  // One explicit read transaction, which Dexie's live-query cache skips. With the cache, this query and the
  // calendar's (both under the calendar page, this one for the streak chip) read the same whole tables, and the
  // next click handler started inside the calendar querier's zone (Dexie.Promise.PSD.subscr set), so Undo after
  // a move threw "Readwrite transaction in liveQuery context". With the cache off, or this transaction, the click
  // starts in the global zone. e2e/calendar.spec.ts "dragging a task..." and "Move to..." fail without it.
  const [tasks, problems, todos, cards, logs, sessions] = await db.transaction('r', [db.tasks, db.practiceItems, db.personalTodos, db.reviewCards, db.reviewLogs, db.studyItems], () =>
    Promise.all([db.tasks.toArray(), db.practiceItems.toArray(), db.personalTodos.toArray(), db.reviewCards.toArray(), db.reviewLogs.toArray(), db.studyItems.toArray()]),
  )
  const out: StudyEvent[] = []
  for (const t of tasks) {
    if (!t.deleted && t.status === 'done' && t.completedAt) out.push({ at: t.completedAt, minutes: t.estimatedMinutes })
  }
  // Finished daily problems count even if the plan's daily practice is later switched off: completed work stays history.
  for (const p of problems) {
    if (!p.deleted && p.status === 'done' && p.completedAt) out.push({ at: p.completedAt, minutes: p.minutes })
  }
  // Study sessions count on the day they were ticked, like tasks; a deleted plan's sessions are tombstoned with it.
  for (const s of sessions) {
    if (!s.deleted && s.status === 'done' && s.completedAt) out.push({ at: s.completedAt, minutes: s.minutes })
  }
  for (const t of todos) {
    // Only study time counts: ticking off an errand with no minutes leaves the streak and heatmap alone.
    if (!t.deleted && t.done && t.completedAt && (t.minutes ?? 0) > 0) out.push({ at: t.completedAt, minutes: t.minutes! })
  }
  const cardMinutes = new Map(cards.map((c) => [c.id, c.minutes ?? 10]))
  for (const l of logs) {
    if (!l.deleted && l.state !== 0) out.push({ at: l.reviewedAt, minutes: cardMinutes.get(l.cardId) ?? 10 })
  }
  return out
}
