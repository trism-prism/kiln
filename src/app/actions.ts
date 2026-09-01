// Writes the screens share. Each reports through a toast.
import { db, revertWrite, scheduleAll, skipTask, unskipTask, updateRecord } from '../data'
import { formatDay, toLocalISODate } from '../lib/date'
import { toasts } from '../ui/overlay'

const today = () => toLocalISODate(new Date())

function fail(e: unknown) {
  toasts.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
}

/** Runs a write and reports a failure in a toast instead of losing it. */
export async function safely(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    fail(e)
  }
}

/** Moves overdue open tasks (all plans share the daily budget) to the next days with room. */
export async function rescheduleOverdue(): Promise<void> {
  try {
    const out = await scheduleAll(db, today(), { mode: 'reschedule' })
    const late = out.violations.filter((v) => v.kind === 'plan-deadline').length
    toasts.add(
      { title: 'Overdue work rescheduled', description: late ? `${late} plan${late === 1 ? '' : 's'} will miss the deadline at this pace.` : undefined },
      { timeout: 6000 },
    )
  } catch (e) {
    fail(e)
  }
}

/** Places tasks in the backlog again (all plans). Tasks that the plan's skip-optional switch holds back stay there. */
export async function scheduleBacklogAgain(): Promise<void> {
  try {
    await scheduleAll(db, today())
    toasts.add({ title: 'Backlog scheduled again' }, { timeout: 5000 })
  } catch (e) {
    fail(e)
  }
}

export async function toggleSkip(taskId: string, skip: boolean, title: string): Promise<void> {
  try {
    await (skip ? skipTask : unskipTask)(db, taskId)
    toasts.add(
      {
        title: skip ? `Skipped: ${title}` : `Reopened: ${title}`,
        action: { label: 'Undo', onPress: () => void (skip ? unskipTask : skipTask)(db, taskId).catch(fail) },
      },
      { timeout: 8000 },
    )
  } catch (e) {
    fail(e)
  }
}

/** Fixes a task on a day: the scheduler keeps pinned tasks where they are. */
export async function pinTask(taskId: string, date: string | undefined): Promise<void> {
  try {
    await updateRecord(db, 'tasks', taskId, date ? { pinnedDate: date, scheduledDate: date, backlog: undefined } : { pinnedDate: undefined })
    toasts.add({ title: date ? `Pinned to ${date}` : 'Unpinned' }, { timeout: 4000 })
  } catch (e) {
    fail(e)
  }
}

/**
 * Moves a task (pinning it to the day, like pinTask) or a daily problem to another day. Toasts the
 * move with Undo, and a second toast with `warnings` (broken dependencies) when there are any.
 */
export async function moveItem(item: { kind: 'task' | 'practice'; id: string; title: string }, date: string, warnings: string[] = []): Promise<void> {
  try {
    let undo: () => Promise<boolean>
    if (item.kind === 'task') {
      const before = await db.tasks.get(item.id)
      const after = before && !before.deleted ? await updateRecord(db, 'tasks', item.id, { pinnedDate: date, scheduledDate: date, backlog: undefined }) : undefined
      if (!before || !after) throw new Error('That task no longer exists.')
      undo = () => revertWrite(db, { restore: [['tasks', before, after.updatedAt]] })
    } else {
      const before = await db.practiceItems.get(item.id)
      const after = before && !before.deleted ? await updateRecord(db, 'practiceItems', item.id, { date }) : undefined
      if (!before || !after) throw new Error('That problem no longer exists.')
      undo = () => revertWrite(db, { restore: [['practiceItems', before, after.updatedAt]] })
    }
    toasts.add(
      {
        title: `Moved to ${formatDay(date)}`,
        description: item.title,
        action: {
          label: 'Undo',
          onPress: () =>
            void undo()
              .then((ok) => ok || toasts.add({ title: 'Could not undo', description: 'It was changed after the move.' }, { timeout: 6000 }))
              .catch(fail),
        },
      },
      { timeout: 8000 },
    )
    if (warnings.length) toasts.add({ title: 'Dependency warning', description: warnings.join(' ') }, { timeout: 12000 })
  } catch (e) {
    fail(e)
  }
}
