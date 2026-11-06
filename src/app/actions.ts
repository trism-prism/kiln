// Writes the screens share. Each reports through a toast.
import { db, scheduleAll, skipTask, unskipTask, updateRecord } from '../data'
import { toLocalISODate } from '../lib/date'
import { toasts } from '../ui/overlay'

const today = () => toLocalISODate(new Date())

function fail(e: unknown) {
  toasts.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
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
