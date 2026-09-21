// The completion flow shared by To Do, the task page and brush-up: write with the default rating
// ("good"), then toast with Undo. There is no rating step; reviews are opt-in per plan.
import { useState } from 'react'
import { completePractice, completeStudy, completeTask, db, reviewCard } from '../data'
import type { RatingName } from '../domain/mastery'
import { toasts } from '../ui/overlay'

/** What the completion flow needs from a task, a daily problem, a study session or a review. */
export interface Completable {
  kind: 'task' | 'practice' | 'study' | 'review'
  id: string
  title: string
}

function fail(e: unknown) {
  toasts.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
}

async function run(item: Completable, rating: RatingName) {
  const now = Date.now()
  try {
    if (item.kind === 'practice') {
      const r = await completePractice(db, item.id, rating, now)
      return { r, text: `Done: ${item.title}` }
    }
    if (item.kind === 'study') {
      const r = await completeStudy(db, item.id, now)
      return { r, text: `Done: ${item.title}` }
    }
    if (item.kind === 'review') {
      const r = await reviewCard(db, item.id, rating, now)
      return { r, text: `Reviewed: ${item.title.replace(/^Review: /, '')}` }
    }
    const r = await completeTask(db, item.id, rating, now)
    return { r, text: `Done: ${item.title}` }
  } catch (e) {
    fail(e)
  }
}

/** Completes `item` with `rating` and shows an Undo toast. */
export async function complete(item: Completable, rating: RatingName) {
  const done = await run(item, rating)
  if (!done) return
  toasts.add(
    { title: done.text, action: { label: 'Undo', onPress: () => void done.r.undo().then((ok) => ok || toasts.add({ title: 'Not undone', description: 'It was changed after that.' }, { timeout: 6000 })).catch(fail) } },
    { timeout: 8000 },
  )
}

/**
 * `complete(item)` writes straight away (rating "good"). `pending(id)` is true while that item's
 * write is in flight, so its checkbox can be disabled (no double completion).
 */
export function useCompleter(): {
  complete: (item: Completable) => void
  pending: (id: string) => boolean
} {
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  return {
    complete: (item) => {
      if (busy.has(item.id)) return
      setBusy((b) => new Set(b).add(item.id))
      void complete(item, 'good').finally(() =>
        setBusy((b) => {
          const n = new Set(b)
          n.delete(item.id)
          return n
        }),
      )
    },
    pending: (id) => busy.has(id),
  }
}
