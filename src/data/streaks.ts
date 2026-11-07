// Completions for the streak and the heatmap. Reads only.
import type { StudyEvent } from '../domain/streaks'
import type { KilnDB } from './db'

/**
 * Every completion: tasks marked done, daily problems marked done, personal to-dos marked done (which is
 * also how "Log study time" records a session), and reviews logged. A card's first rating (state New) is
 * the completion of its task or problem, which is counted above, so only later ratings count as reviews.
 * Minutes: the task's estimate, the problem's minutes, the to-do's minutes (0 without), the card's review
 * minutes. Imported past tasks are done without `completedAt`, so they never count.
 */
export async function studyEvents(db: KilnDB): Promise<StudyEvent[]> {
  const out: StudyEvent[] = []
  for (const t of await db.tasks.toArray()) {
    if (!t.deleted && t.status === 'done' && t.completedAt) out.push({ at: t.completedAt, minutes: t.estimatedMinutes })
  }
  // Finished daily problems count even if the plan's daily practice is later switched off: completed work stays history.
  for (const p of await db.practiceItems.toArray()) {
    if (!p.deleted && p.status === 'done' && p.completedAt) out.push({ at: p.completedAt, minutes: p.minutes })
  }
  for (const t of await db.personalTodos.toArray()) {
    if (!t.deleted && t.done && t.completedAt) out.push({ at: t.completedAt, minutes: t.minutes ?? 0 })
  }
  const cardMinutes = new Map((await db.reviewCards.toArray()).map((c) => [c.id, c.minutes ?? 10]))
  for (const l of await db.reviewLogs.toArray()) {
    if (!l.deleted && l.state !== 0) out.push({ at: l.reviewedAt, minutes: cardMinutes.get(l.cardId) ?? 10 })
  }
  return out
}
