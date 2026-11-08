// "From a course calendar": an LMS calendar (.ics file or link) becomes one plan per course.
// Parsing happens on this device; a link is fetched through the Worker (worker/README.md, "Calendar feeds").
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router'
import { CalendarDays, ChevronRight, FileUp, Link2 } from 'lucide-react'
import { Disclosure, DisclosurePanel, FileTrigger, Heading } from 'react-aria-components'
import { db, scheduleAll, type Lms } from '../../data'
import { eventsToImport, feedCourses, importCalendar, listFeeds, planTitles, readCalendar, rowStates, type RowState } from '../../data/calendar'
import { courseKey, courses, displayNames, type TaskRow } from '../../domain/ics'
import { formatDay, isRealISODate, toLocalISODate } from '../../lib/date'
import { API_URL } from '../../pwa/env'
import { feedUrl, fetchFeedText } from '../../pwa/feeds'
import { Button } from '../../ui/button'
import { Checkbox, ListBoxItem, Select, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { DateField } from '../../ui/date'
import { Card } from '../../ui/surface'
import { LMS_GUIDES } from './lms-steps'

const MAX_FILE = 2 * 1024 * 1024
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface Loaded {
  text: string
  /** Set for a link with Keep in sync on. */
  feed?: { id?: string; lms: Lms; url: string }
  /** Plan keys to pre-tick (re-import from a feed). */
  tick?: Set<string>
}

export function CalendarTab() {
  const [params] = useSearchParams()
  const feedParam = params.get('feed')
  const [lms, setLms] = useState<Lms>('canvas')
  const [link, setLink] = useState('')
  const [keep, setKeep] = useState(true)
  const [loaded, setLoaded] = useState<Loaded>()
  const [loads, setLoads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const guide = LMS_GUIDES.find((g) => g.id === lms) ?? LMS_GUIDES[0]!
  const seq = useRef(0)
  const feeds = useLiveQuery(() => listFeeds(db), [])

  const show = (next: Loaded) => {
    setLoaded(next)
    setLoads((n) => n + 1)
  }

  async function fetchLink(raw: string, feedId?: string, chosen: Lms = lms, tick?: Set<string>) {
    const url = feedUrl(raw)
    setError(undefined)
    if (!url) return setError('Paste the calendar link: it starts with https:// or webcal://.')
    const mine = ++seq.current
    setBusy(true)
    try {
      const text = await fetchFeedText(fetch, API_URL, url)
      if (mine === seq.current) show({ text, feed: keep || feedId ? { id: feedId, lms: chosen, url } : undefined, tick })
    } catch (e) {
      if (mine === seq.current) setError(message(e))
    } finally {
      if (mine === seq.current) setBusy(false)
    }
  }

  // Review from the "new assignments" notice: /import?tab=calendar&feed=<id>.
  useEffect(() => {
    if (!feedParam) return
    void (async () => {
      const feed = await db.feeds.get(feedParam)
      if (!feed || feed.deleted) return setError('That calendar link is no longer in Kiln.')
      setLms(feed.lms)
      setLink(feed.url)
      setKeep(true)
      await fetchLink(feed.url, feed.id, feed.lms, await feedCourses(db, feed))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per feed id
  }, [feedParam])

  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setError(undefined)
    if (f.size > MAX_FILE) return setError('The file is larger than 2 MB.')
    const mine = ++seq.current
    try {
      const text = await f.text()
      if (mine === seq.current) show({ text })
    } catch (e) {
      if (mine === seq.current) setError(`Could not read ${f.name}: ${message(e)}`)
    }
  }

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4">
        <Select label="Your school's system" selectedKey={lms} onSelectionChange={(k) => setLms(k as Lms)} className="max-w-xs">
          {LMS_GUIDES.map((g) => (
            <ListBoxItem key={g.id} id={g.id}>
              {g.name}
            </ListBoxItem>
          ))}
        </Select>
        <div className="grid gap-2 text-sm">
          <h3 className="font-medium">Where to find the calendar link in {guide.name}</h3>
          <ol className="grid list-decimal gap-1 pl-5">
            {guide.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-text-muted">
            {guide.mayVary ? 'These steps may vary: Google changes its menus, and some schools turn calendar sharing off. ' : ''}
            Keep this link private: anyone with it can see your calendar. Kiln keeps it on your devices and syncs it end-to-end encrypted.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <TextField label="Calendar link" value={link} onChange={setLink} description="Starts with https:// or webcal://" />
          <div className="grid gap-1">
            <Checkbox isSelected={keep} onChange={setKeep} aria-describedby="calendar-keep-help">
              Keep in sync
            </Checkbox>
            <p id="calendar-keep-help" className="pl-8 text-sm text-text-muted">
              Kiln checks for new assignments when it opens, at most every 6 hours.
            </p>
          </div>
          <div>
            <Button variant="secondary" onPress={() => void fetchLink(link)} isDisabled={busy || link.trim() === ''}>
              <Link2 /> {busy ? 'Reading the calendar...' : 'Read the link'}
            </Button>
          </div>
        </div>
        <div className="grid content-start gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">Or upload a calendar file</p>
            <p id="calendar-file-help" className="text-sm text-text-muted">
              Up to 2 MB.
            </p>
          </div>
          <div>
            <FileTrigger acceptedFileTypes={['.ics', 'text/calendar']} onSelect={(files) => void pick(files as FileList | null)}>
              <Button variant="secondary" aria-describedby="calendar-file-help">
                <FileUp /> Choose .ics file
              </Button>
            </FileTrigger>
          </div>
        </div>
      </div>

      {feeds?.map((f) => {
        const name = LMS_GUIDES.find((g) => g.id === f.lms)?.name ?? 'Calendar'
        if (f.needsLink)
          return (
            <p key={f.id} role="status" className="rounded-md border border-border-strong p-3 text-sm">
              Your {name} calendar link was not in the backup, because it works like a password. Paste it again above to keep that calendar in sync.
            </p>
          )
        if (f.lastResult && !f.lastResult.ok)
          return (
            <p key={f.id} role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">
              Your {name} calendar link stopped working: {f.lastResult.error ?? 'the last check failed'} Paste a new link above, or upload a file.
            </p>
          )
        return null
      })}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {loaded && <CalendarReview key={loads} loaded={loaded} lms={loaded.feed?.lms ?? lms} />}
    </div>
  )
}

type Edit = { include?: boolean; title?: string; minutes?: string; due?: string; dueBad?: boolean }

type Problems = { title?: string; minutes?: string; due?: string }

function rowProblems(r: TaskRow, e: Edit, today: string): Problems {
  const title = (e.title ?? r.title).trim()
  const minutes = Number(e.minutes ?? r.minutes)
  const due = e.due ?? r.due
  const out: Problems = {}
  if (title === '' || title.length > 120) out.title = 'Give it a title of up to 120 characters.'
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) out.minutes = 'Minutes must be a whole number from 5 to 600.'
  // The date field shows its own message.
  if (e.dueBad || !isRealISODate(due) || due < today) out.due = 'Pick today or later'
  return out
}
const hasProblem = (p: Problems) => Object.keys(p).length > 0
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** "Sep 6": past rows are history, so no weekday. */
const shortDay = (iso: string) => formatDay(iso).replace(/^\w+, /, '')
const isAction = (s?: RowState) => s?.status === 'new' || s?.status === 'changed'

function CalendarReview({ loaded, lms }: { loaded: Loaded; lms: Lms }) {
  const navigate = useNavigate()
  const today = toLocalISODate(new Date())
  const { items, rows } = useMemo(() => readCalendar(loaded.text), [loaded.text])
  const upcoming = useMemo(() => rows.filter((r) => r.due >= today), [rows, today])
  // A test's prep row is not history worth keeping, so only the work itself is offered.
  const pastRows = useMemo(() => rows.filter((r) => r.due < today && !r.prep), [rows, today])
  const list = useMemo(() => courses(items, today), [items, today])
  const display = useMemo(() => displayNames(list.map((c) => c.course)), [list])
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(list.filter((c) => !loaded.tick || loaded.tick.has(courseKey(c.course))).map((c) => c.course)),
  )
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  // Past rows to add as completed; a feed that marks an item completed pre-ticks it.
  const [pastOn, setPastOn] = useState<Set<string>>(() => new Set(pastRows.filter((r) => r.completed).map((r) => r.key)))
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  // One query for all three, so the page has a single live querier on plans, tasks and events.
  const known = useLiveQuery(
    async () => ({ states: await rowStates(db, rows), titles: await planTitles(db, list.map((c) => c.course)), events: await eventsToImport(db, items) }),
    [rows, list, items],
  )
  const states = known?.states
  const edit = (key: string, patch: Edit) => setEdits((all) => ({ ...all, [key]: { ...all[key], ...patch } }))
  const shown = (course: string) => display.get(course) ?? course
  const nameOf = (course: string) => names[course] ?? known?.titles.get(course) ?? shown(course)
  const setPast = (keys: string[], on: boolean) => setPastOn((s) => (on ? new Set([...s, ...keys]) : new Set([...s].filter((k) => !keys.includes(k)))))

  if (items.length === 0) return <p role="alert" className="text-sm text-danger">No events found in this calendar.</p>

  const actionable = upcoming.filter((r) => ticked.has(r.course) && isAction(states?.get(r.key)))
  const chosen = actionable.filter((r) => edits[r.key]?.include !== false)
  const pastNew = pastRows.filter((r) => states?.get(r.key)?.status === 'new')
  const pastChosen = pastNew.filter((r) => ticked.has(r.course) && pastOn.has(r.key))
  const problems = chosen.filter((r) => hasProblem(rowProblems(r, edits[r.key] ?? {}, today)))
  const unnamed = [...ticked].filter((c) => nameOf(c).trim() === '')
  // New or moved class times and exams count like tasks: a course of class meetings alone still imports.
  const events = items.filter((it) => ticked.has(it.course) && known?.events.has(it.uid)).length
  const count = chosen.length + pastChosen.length + events
  const renames = [...ticked].filter((c) => known?.titles.has(c) && nameOf(c).trim() !== known.titles.get(c))
  // Why the Import button is off, in words.
  const reason = !states
    ? 'Checking what is already in Kiln...'
    : ticked.size === 0
      ? 'Tick at least one course to import.'
      : unnamed.length > 0
        ? 'Give each ticked course a plan name.'
        : problems.length > 0
          ? `Fix the ${problems.length} row${problems.length === 1 ? '' : 's'} marked in red first, or untick ${problems.length === 1 ? 'it' : 'them'}.`
          : count === 0 && renames.length === 0
            ? 'Nothing new to import.'
            : undefined

  async function run() {
    setBusy(true)
    setFailure(undefined)
    try {
      const final = [
        ...chosen.map((r) => {
          const e = edits[r.key] ?? {}
          return { ...r, title: (e.title ?? r.title).trim(), minutes: Number(e.minutes ?? r.minutes), due: e.due ?? r.due }
        }),
        ...pastChosen.map((r) => ({ ...r, done: true })),
      ]
      const courseNames = Object.fromEntries([...ticked].map((c) => [c, nameOf(c).trim()]))
      const res = await importCalendar(db, { items, rows: final, courses: [...ticked], names: courseNames, startDate: today, feed: loaded.feed })
      let note = ''
      try {
        await scheduleAll(db, today)
      } catch (e) {
        note = ` Scheduling failed (${message(e)}); reschedule from Settings.`
      }
      const events = res.eventsAdded + res.eventsUpdated
      const parts = [
        `${plural(res.tasksAdded, 'task')} added`,
        ...(res.markedDone > 0 ? [`${res.markedDone} marked done`] : []),
        ...(res.datesChanged > 0 ? [`${plural(res.datesChanged, 'due date')} moved`] : []),
        ...(events > 0 ? [plural(events, 'calendar event')] : []),
      ]
      toasts.add({ title: `Imported ${plural(res.planIds.length, 'course')}`, description: `${parts.join(', ')}.${note}` }, { timeout: 6000 })
      void navigate('/plans')
    } catch (e) {
      setFailure(message(e))
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <Card className="grid gap-3">
        <h2 className="text-base font-medium">Courses</h2>
        {list.map((c) => (
          <Checkbox
            key={c.course}
            isSelected={ticked.has(c.course)}
            onChange={(on) => setTicked((s) => (on ? new Set([...s, c.course]) : new Set([...s].filter((x) => x !== c.course))))}
          >
            {c.total > 0
              ? `${shown(c.course)}: ${plural(c.due, 'assignment')} still due (${c.total} in your calendar)`
              : c.classes > 0
                ? `${shown(c.course)}: ${plural(c.classes, 'class time')}`
                : shown(c.course)}
          </Checkbox>
        ))}
        {lms === 'canvas' && <p className="text-sm text-text-muted">Canvas only lists assignments with a due date.</p>}
      </Card>

      {list
        .filter((c) => ticked.has(c.course))
        .map((c) => {
          const mine = upcoming.filter((r) => r.course === c.course)
          const offered = mine.filter((r) => isAction(states?.get(r.key)))
          const already = mine.length - offered.length
          const past = pastNew.filter((r) => r.course === c.course)
          const pastTicked = past.filter((r) => pastOn.has(r.key)).length
          const name = nameOf(c.course)
          return (
            <Card key={c.course} className="grid gap-3">
              {/* The course, for when the plan name no longer says which one this is. */}
              <h2 className={name.trim() === shown(c.course) ? 'sr-only' : 'text-sm text-text-muted'}>{shown(c.course)}</h2>
              <TextField
                label="Plan name"
                value={name}
                onChange={(v) => setNames((all) => ({ ...all, [c.course]: v }))}
                isInvalid={name.trim() === ''}
                errorMessage="Give the plan a name."
                maxLength={120}
                className="max-w-md"
              />
              {offered.length === 0 && <p className="text-sm text-text-muted">{states ? 'No new assignments.' : 'Checking...'}</p>}
              {offered.length > 0 && (
                // Phones: each row is two lines (tick and title, then minutes and due), so nothing scrolls sideways.
                <div className="md:overflow-x-auto">
                  <table className="block w-full text-left text-sm md:table">
                    <caption className="sr-only">Assignments in {name || shown(c.course)}</caption>
                    <thead className="hidden text-text-muted md:table-header-group">
                      <tr>
                        <th className="p-1 font-medium">Import</th>
                        <th className="p-1 font-medium">Title</th>
                        <th className="p-1 font-medium">Minutes</th>
                        <th className="p-1 font-medium">Due</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group">
                      {offered.map((r) => {
                        const e = edits[r.key] ?? {}
                        const st = states?.get(r.key)
                        const problem = e.include !== false ? rowProblems(r, e, today) : {}
                        const fieldProps = (f: keyof Problems) => ({ 'aria-invalid': problem[f] ? true : undefined, 'aria-describedby': problem[f] ? `${r.key}-${f}-error` : undefined })
                        const input = 'h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-text'
                        return (
                          <tr
                            key={r.key}
                            className="grid grid-cols-[auto_6rem_minmax(0,1fr)] border-t border-border py-1 align-top first:border-t-0 md:table-row md:border-0 md:py-0"
                            data-testid="calendar-row"
                          >
                            <td className="p-1">
                              <input type="checkbox" aria-label={`Import ${r.title}`} className="mt-2.5 size-4 accent-accent" checked={e.include !== false} onChange={(ev) => edit(r.key, { include: ev.target.checked })} />
                            </td>
                            {st?.status === 'changed' ? (
                              <td className="col-span-2 p-1 pt-2.5" colSpan={3}>
                                {r.title}: due date moved from {st.oldDue ? formatDay(st.oldDue) : 'none'} to {formatDay(r.due)}
                              </td>
                            ) : (
                              <>
                                <td className="col-span-2 min-w-0 p-1 md:min-w-48">
                                  <input aria-label={`Title of ${r.title}`} className={input} value={e.title ?? r.title} onChange={(ev) => edit(r.key, { title: ev.target.value })} {...fieldProps('title')} />
                                  {problem.title && <p id={`${r.key}-title-error`} className="pt-1 text-danger">{problem.title}</p>}
                                </td>
                                <td className="col-start-2 p-1 md:w-24">
                                  <span aria-hidden="true" className="block pb-1 text-xs text-text-muted md:hidden">
                                    Minutes
                                  </span>
                                  <input aria-label={`Minutes for ${r.title}`} className={input} inputMode="numeric" value={e.minutes ?? String(r.minutes)} onChange={(ev) => edit(r.key, { minutes: ev.target.value })} {...fieldProps('minutes')} />
                                  {problem.minutes && <p id={`${r.key}-minutes-error`} className="pt-1 text-danger">{problem.minutes}</p>}
                                </td>
                                <td className="min-w-0 p-1 md:w-44">
                                  <span aria-hidden="true" className="block pb-1 text-xs text-text-muted md:hidden">
                                    Due
                                  </span>
                                  <DateField
                                    size="sm"
                                    placeholder=""
                                    aria-label={`Due date of ${r.title}`}
                                    value={e.due ?? r.due}
                                    min={today}
                                    onChange={(due) => edit(r.key, { due })}
                                    onInvalidChange={(dueBad) => edit(r.key, { dueBad })}
                                  />
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {past.length > 0 && (
                <Disclosure className="grid gap-2">
                  <Heading level={3} className="text-sm font-medium">
                    <Button slot="trigger" variant="quiet" className="group -ml-2 px-2!">
                      <ChevronRight size={16} className="transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" />
                      Already due ({past.length})
                    </Button>
                  </Heading>
                  <DisclosurePanel className="grid gap-3 pl-6">
                    <Checkbox
                      isSelected={pastTicked === past.length}
                      isIndeterminate={pastTicked > 0 && pastTicked < past.length}
                      onChange={(on) => setPast(past.map((r) => r.key), on)}
                    >
                      Add all {past.length} as completed
                    </Checkbox>
                    {past.map((r) => (
                      <Checkbox key={r.key} isSelected={pastOn.has(r.key)} onChange={(on) => setPast([r.key], on)}>
                        <span>
                          {r.title} <span className="text-text-muted">· {shortDay(r.due)}</span>
                        </span>
                      </Checkbox>
                    ))}
                  </DisclosurePanel>
                </Disclosure>
              )}
              {already > 0 && <p className="text-sm text-text-muted">{already} already in Kiln</p>}
            </Card>
          )
        })}

      {failure && (
        <p role="alert" className="text-sm text-danger">
          Could not import: {failure}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onPress={run} isDisabled={busy || !!reason} aria-describedby={reason ? 'calendar-import-reason' : undefined}>
          <CalendarDays /> {busy ? 'Importing...' : `Import ${plural(count, 'item')}`}
        </Button>
        {reason && (
          <span id="calendar-import-reason" className="text-sm text-text-muted">
            {reason}
          </span>
        )}
      </div>
    </div>
  )
}
