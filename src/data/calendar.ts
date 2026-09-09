// LMS calendar import into the database: plans per course (through importPlan, so progress is kept),
// events matched by UID, and the synced feed record for "Keep in sync". Domain logic is in domain/ics.
import { classify, courseKey, coursePlan, eventItems, parseIcs, shortHash, taskRows, type CalendarItem, type TaskRow } from '../domain/ics'
import type { KilnDB } from './db'
import { getDeviceId, getPlanByKey, importPlan, insertRecord, updateRecord } from './repo'
import type { EventRecord, FeedRecord, Lms, TaskRecord } from './types'

export type RowStatus = 'new' | 'changed' | 'same' | 'deleted'
export interface RowState {
  status: RowStatus
  /** The stored due date, for a changed row. */
  oldDue?: string
}

/** A row and the tasks it became (`key`, `key-2`, ... for split sessions). */
const ownTasks = (tasks: TaskRecord[], key: string) => tasks.filter((t) => t.key === key || t.key.startsWith(`${key}-`))

async function tasksOfCourse(db: KilnDB, course: string): Promise<TaskRecord[]> {
  const plan = await getPlanByKey(db, courseKey(course))
  return plan ? db.tasks.where('planId').equals(plan.id).toArray() : []
}

/** What importing each row would do: add it, change its due date, nothing, or nothing because the person deleted it. */
export async function rowStates(db: KilnDB, rows: TaskRow[]): Promise<Map<string, RowState>> {
  const byCourse = new Map<string, TaskRecord[]>()
  for (const c of new Set(rows.map((r) => r.course))) byCourse.set(c, await tasksOfCourse(db, c))
  const out = new Map<string, RowState>()
  for (const r of rows) {
    const mine = ownTasks(byCourse.get(r.course) ?? [], r.key)
    const first = mine.find((t) => t.key === r.key)
    if (!first) out.set(r.key, { status: 'new' })
    else if (first.deleted) out.set(r.key, { status: 'deleted' })
    else if (first.deadline !== r.due) out.set(r.key, { status: 'changed', oldDue: first.deadline })
    else out.set(r.key, { status: 'same' })
  }
  return out
}

/** Reads a calendar file: every item and the grid rows. */
export function readCalendar(text: string): { items: CalendarItem[]; rows: TaskRow[] } {
  const items = classify(parseIcs(text))
  return { items, rows: taskRows(items) }
}

export interface CalendarImport {
  items: CalendarItem[]
  /** Grid rows as edited, only the ticked ones, of ticked courses. */
  rows: TaskRow[]
  /** Ticked courses: their class times and exams go on the calendar. */
  courses: string[]
  /** Day 1 for new plans (today). Rows due earlier cannot be imported. */
  startDate: string
  /** Keep in sync: the link, and the feed record when re-importing from one. */
  feed?: { id?: string; lms: Lms; url: string }
}

export interface CalendarImportResult {
  planIds: string[]
  tasksAdded: number
  datesChanged: number
  eventsAdded: number
  eventsUpdated: number
  feedId?: string
}

const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/**
 * Imports ticked rows and events. New rows go through importPlan (a new course creates its plan; an
 * existing one keeps its title, goal and progress). Changed rows only get the new due date, so
 * the person's edits to titles and minutes stay. Tasks are then put in due order.
 */
export async function importCalendar(db: KilnDB, input: CalendarImport): Promise<CalendarImportResult> {
  // One transaction: a course that fails leaves nothing half-imported. The device id is read first (it opens its own transaction).
  await getDeviceId(db)
  return db.transaction('rw', db.tables, async () => importAll(db, input))
}

async function importAll(db: KilnDB, input: CalendarImport): Promise<CalendarImportResult> {
  const res: CalendarImportResult = { planIds: [], tasksAdded: 0, datesChanged: 0, eventsAdded: 0, eventsUpdated: 0 }
  const planOf = new Map<string, string>()
  const states = await rowStates(db, input.rows)

  for (const course of input.courses) {
    const rows = input.rows.filter((r) => r.course === course)
    const fresh = rows.filter((r) => states.get(r.key)?.status === 'new')
    let plan = await getPlanByKey(db, courseKey(course))
    if (fresh.length > 0) {
      const built = coursePlan(course, fresh, input.startDate, plan?.title)
      if (!built.plan) throw new Error(`${course}: ${built.issues[0]?.path ?? ''} ${built.issues[0]?.message ?? 'invalid'}`.trim())
      const file = plan
        ? { ...built.plan, schedulingMode: plan.schedulingMode, description: plan.description, goal: plan.goal, subject: plan.subject, level: plan.level, audience: plan.audience, sources: plan.sources, dailyPractice: plan.dailyPractice }
        : built.plan
      const r = await importPlan(db, file, { startDate: input.startDate })
      res.tasksAdded += r.tasksAdded
      plan = await getPlanByKey(db, courseKey(course))
    }
    if (!plan) continue
    planOf.set(course, plan.id)
    res.planIds.push(plan.id)

    const tasks = await db.tasks.where('planId').equals(plan.id).toArray()
    for (const r of rows.filter((x) => states.get(x.key)?.status === 'changed')) {
      for (const t of ownTasks(tasks, r.key).filter((t) => !t.deleted)) await updateRecord(db, 'tasks', t.id, { deadline: r.due })
      res.datesChanged++
    }
    // Due order: the scheduler places a plan's tasks in order, so the earliest due comes first.
    const live = (await db.tasks.where('planId').equals(plan.id).toArray()).filter((t) => !t.deleted)
    live.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.order - b.order || a.key.localeCompare(b.key))
    for (const [i, t] of live.entries()) if (t.order !== i + 1) await updateRecord(db, 'tasks', t.id, { order: i + 1 })
  }

  const feedId = input.feed ? await saveFeed(db, input.feed, res) : undefined
  for (const it of eventItems(input.items).filter((i) => input.courses.includes(i.course))) {
    const ev = it.event
    const fields = defined({
      title: it.title.slice(0, 300),
      date: ev.date,
      endDate: ev.endDate,
      allDay: ev.allDay,
      start: ev.start,
      end: ev.end,
      course: it.course.slice(0, 120),
      url: ev.url && ev.url.length <= 2048 ? ev.url : undefined,
      notes: ev.description?.slice(0, 4000),
      planId: planOf.get(it.course),
      feedId,
      uid: it.uid.slice(0, 1000),
    }) as Omit<EventRecord, 'id' | 'updatedAt' | 'deleted' | 'deviceId'>
    const old = (await db.events.where('uid').equals(fields.uid as string).toArray()).find((e) => !e.deleted)
    if (!old) {
      await insertRecord(db, 'events', fields)
      res.eventsAdded++
    } else {
      const keys = ['title', 'date', 'endDate', 'allDay', 'start', 'end', 'course', 'url', 'notes'] as const
      // planId and feedId are only compared when this import sets them (an upload sets no feed, and must not look like a change).
      const kept = (['planId', 'feedId'] as const).filter((k) => fields[k] !== undefined)
      if ([...keys, ...kept].some((k) => old[k] !== fields[k])) {
        // Fields the feed no longer has are cleared.
        await updateRecord(db, 'events', old.id, { endDate: undefined, start: undefined, end: undefined, url: undefined, notes: undefined, ...fields })
        res.eventsUpdated++
      }
    }
  }
  return { ...res, ...(feedId ? { feedId } : {}) }
}

async function saveFeed(db: KilnDB, feed: NonNullable<CalendarImport['feed']>, res: CalendarImportResult): Promise<string> {
  const lastResult = { ok: true, added: res.tasksAdded, changed: res.datesChanged }
  const all = (await db.feeds.toArray()).filter((f) => !f.deleted)
  // The same id or link; else a feed restored from a backup (no link) that made one of these plans: it gets its link back.
  const old =
    (feed.id ? all.find((f) => f.id === feed.id) : undefined) ??
    all.find((f) => f.url === feed.url) ??
    all.find((f) => f.needsLink && f.planIds.some((id) => res.planIds.includes(id)))
  if (old) {
    await updateRecord(db, 'feeds', old.id, { lms: feed.lms, url: feed.url, needsLink: false, planIds: [...new Set([...old.planIds, ...res.planIds])], lastFetchedAt: Date.now(), lastResult })
    return old.id
  }
  const rec = await insertRecord(db, 'feeds', { lms: feed.lms, url: feed.url, planIds: res.planIds, lastFetchedAt: Date.now(), lastResult })
  return rec.id
}

/** Live feeds. */
export async function listFeeds(db: KilnDB): Promise<FeedRecord[]> {
  return (await db.feeds.toArray()).filter((f) => !f.deleted)
}

/** Courses of the plans a feed made (to pre-tick them on re-import). */
export async function feedCourses(db: KilnDB, feed: FeedRecord): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const id of feed.planIds) {
    const p = await db.plans.get(id)
    if (p && !p.deleted) keys.add(p.key)
  }
  return keys
}

/** New rows and changed due dates in a fetched feed, for the feed's courses, due today or later. */
export interface FeedChanges {
  added: number
  changed: number
  /** Class times and exams of the feed's courses that now start at another time. */
  moved: number
  /** Names exactly what is new, so the same news is announced once ('' when there is none). */
  fingerprint: string
}

export async function feedChanges(db: KilnDB, feed: FeedRecord, text: string, today: string): Promise<FeedChanges> {
  const keys = await feedCourses(db, feed)
  const { items, rows: all } = readCalendar(text)
  const rows = all.filter((r) => keys.has(courseKey(r.course)) && r.due >= today)
  const states = await rowStates(db, rows)
  const marks: string[] = []
  let added = 0
  let changed = 0
  for (const r of rows) {
    const s = states.get(r.key)
    if (s?.status === 'new') {
      added++
      marks.push(`n:${r.key}`)
    }
    if (s?.status === 'changed') {
      changed++
      marks.push(`c:${r.key}:${r.due}`)
    }
  }
  let moved = 0
  for (const it of eventItems(items).filter((i) => keys.has(courseKey(i.course)) && (i.event.endDate ?? i.event.date) >= today)) {
    const old = (await db.events.where('uid').equals(it.uid.slice(0, 1000)).toArray()).find((e) => !e.deleted)
    const ev = it.event
    if (old && (old.date !== ev.date || old.endDate !== ev.endDate || old.start !== ev.start || old.end !== ev.end)) {
      moved++
      marks.push(`m:${it.uid}:${ev.start ?? ev.date}`)
    }
  }
  return { added, changed, moved, fingerprint: marks.length === 0 ? '' : shortHash(marks.sort().join('|')) }
}
