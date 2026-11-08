// Writes the screens share. Each reports through a toast.
import { db, importPlan, insertRecord, listPlans, type PersonalTodoRecord, revertWrite, scheduleAll, setPersonalTodoDone, skipTask, softDelete, unskipTask, updateRecord } from '../data'
import { formatIssue, validatePlan } from '../domain/plan-format'
import { BACKLOG } from '../domain/scheduler'
import { formatDay, toLocalISODate } from '../lib/date'
import { toasts } from '../ui/overlay'
import { slugify } from './import/slug'
import { describeMoves } from './moveSummary'
import { minutesText } from './parts'

const today = () => toLocalISODate(new Date())

function fail(e: unknown, title = 'Could not save') {
  toasts.add({ title, description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
}

/** Runs a write and reports a failure in a toast instead of losing it. */
export async function safely(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    fail(e)
  }
}

/**
 * Moves overdue open tasks (all plans share the daily budget) to the next days with room, and says where
 * they went. Returns false when it failed (already reported in a toast).
 */
export async function rescheduleOverdue(): Promise<boolean> {
  try {
    const now = today()
    const overdue = (await db.tasks.toArray()).filter((t) => !t.deleted && t.status === 'open' && !!t.scheduledDate && t.scheduledDate < now)
    const out = await scheduleAll(db, now, { mode: 'reschedule' })
    const late = out.violations.filter((v) => v.kind === 'plan-deadline').length
    toasts.add(
      {
        title: describeMoves('Moved', 'overdue task', 'Nothing was overdue', new Map(overdue.map((t) => [t.id, t.scheduledDate])), out.assignments),
        description: late ? `${late} plan${late === 1 ? '' : 's'} will miss the deadline at this pace.` : undefined,
      },
      { timeout: 6000 },
    )
    return true
  } catch (e) {
    fail(e, 'Could not reschedule')
    return false
  }
}

/** Places tasks in the backlog again (all plans). Tasks that the plan's skip-optional switch holds back stay there. */
export async function scheduleBacklogAgain(): Promise<void> {
  try {
    const waiting = (await db.tasks.toArray()).filter((t) => !t.deleted && t.status === 'open' && t.backlog)
    const out = await scheduleAll(db, today())
    const title = describeMoves('Placed', 'backlog task', 'Nothing was in the backlog', new Map(waiting.map((t) => [t.id, BACKLOG])), out.assignments)
    toasts.add({ title }, { timeout: 5000 })
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

// ---- personal to-dos: every write reschedules, since dated minutes are fixed load on their day ----

export interface TodoFields {
  title: string
  date?: string
  minutes?: number
}

/** Adds a personal to-do, or changes the one with `id`. */
export async function savePersonalTodo(fields: TodoFields, id?: string): Promise<boolean> {
  try {
    if (id) {
      const saved = await updateRecord(db, 'personalTodos', id, { title: fields.title, date: fields.date, minutes: fields.minutes })
      if (!saved) throw new Error('That to-do no longer exists.')
    } else await insertRecord(db, 'personalTodos', { ...fields, done: false })
    await scheduleAll(db, today())
    return true
  } catch (e) {
    fail(e)
    return false
  }
}

/**
 * Records study done outside any plan as a personal to-do that is already done, completed at noon of
 * `date` so it counts for that day. Reports it with Undo. Returns false when it failed (already reported).
 */
export async function logStudyTime(title: string, minutes: number, date: string): Promise<boolean> {
  let rec: PersonalTodoRecord
  try {
    const [y, m, d] = date.split('-').map(Number)
    rec = await insertRecord(db, 'personalTodos', { title, date, minutes, done: true, completedAt: new Date(y!, m! - 1, d!, 12).getTime() })
  } catch (e) {
    fail(e)
    return false
  }
  // Saved from here on: a failed reschedule is reported, but the sheet must still close, or Save again adds a copy.
  try {
    await scheduleAll(db, today())
  } catch (e) {
    fail(e, 'Could not reschedule')
  }
  toasts.add(
    {
      title: `Logged ${minutesText(minutes)} of ${title}`,
      action: {
        label: 'Undo',
        onPress: () =>
          void revertWrite(db, { remove: [['personalTodos', rec.id, rec.updatedAt]] })
            .then(async (ok) => {
              if (!ok) toasts.add({ title: 'Could not undo', description: 'It was changed after it was logged.' }, { timeout: 6000 })
              else await scheduleAll(db, today())
            })
            .catch(fail),
      },
    },
    { timeout: 8000 },
  )
  return true
}

export async function setTodoDone(id: string, done: boolean): Promise<void> {
  try {
    await setPersonalTodoDone(db, id, done)
    await scheduleAll(db, today())
  } catch (e) {
    fail(e)
  }
}

/** Deletes a personal to-do, with Undo. */
export async function deletePersonalTodo(id: string, title: string): Promise<void> {
  try {
    const before = await db.personalTodos.get(id)
    if (!before || before.deleted) throw new Error('That to-do no longer exists.')
    await softDelete(db, 'personalTodos', id)
    const after = (await db.personalTodos.get(id))!
    await scheduleAll(db, today())
    toasts.add(
      {
        title: `Deleted: ${title}`,
        action: {
          label: 'Undo',
          onPress: () =>
            void revertWrite(db, { restore: [['personalTodos', before, after.updatedAt]] })
              .then(async (ok) => {
                if (!ok) toasts.add({ title: 'Could not undo', description: 'It was changed after it was deleted.' }, { timeout: 6000 })
                else await scheduleAll(db, today())
              })
              .catch(fail),
        },
      },
      { timeout: 8000 },
    )
  } catch (e) {
    fail(e)
  }
}

export interface StudyFields {
  title: string
  minutesPerWeek: number
  /** yyyy-mm-dd; used when the plan is added. */
  startDate: string
  /** yyyy-mm-dd, or undefined for no end date. */
  deadline?: string
}

/**
 * Adds a study time plan (id "study-<subject>", "-2", "-3"... while taken) and plans its sessions. Returns the
 * plan's record id, or undefined when nothing was saved (reported). A failed reschedule after the save is reported
 * but still returns the id, so the sheet closes instead of adding a second copy.
 */
export async function addStudyPlan(f: StudyFields): Promise<string | undefined> {
  let planId: string
  try {
    const keys = new Set((await listPlans(db)).map((p) => p.key))
    const base = `study-${slugify(f.title, 50) || 'plan'}`
    let id = base
    for (let n = 2; keys.has(id); n++) id = `${base}-${n}`
    const checked = validatePlan({ schemaVersion: 1, id, title: f.title, subject: f.title, schedulingMode: 'auto', studyMinutesPerWeek: f.minutesPerWeek, modules: [], tasks: [] })
    if (!checked.plan) throw new Error(checked.issues.map(formatIssue)[0] ?? 'The plan is not valid')
    planId = (await importPlan(db, checked.plan, { startDate: f.startDate, deadline: f.deadline })).planId
  } catch (e) {
    fail(e)
    return undefined
  }
  try {
    await scheduleAll(db, today())
  } catch (e) {
    fail(e, 'Could not reschedule')
  }
  toasts.add({ title: `Added "${f.title}"` })
  return planId
}

/** Saves a study time plan's subject, weekly time and end date (no version: the plan has no modules or tasks). */
export async function saveStudyPlan(planId: string, f: Omit<StudyFields, 'startDate'>): Promise<boolean> {
  try {
    if (!(await updateRecord(db, 'plans', planId, { title: f.title, subject: f.title, studyMinutesPerWeek: f.minutesPerWeek, deadline: f.deadline }))) throw new Error('The plan is missing or deleted')
  } catch (e) {
    fail(e)
    return false
  }
  try {
    await scheduleAll(db, today())
  } catch (e) {
    fail(e, 'Could not reschedule')
  }
  toasts.add({ title: `Saved "${f.title}"` })
  return true
}
