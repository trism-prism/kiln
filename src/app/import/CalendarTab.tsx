// "From a course calendar": an LMS calendar (.ics file or link) becomes one plan per course.
// Parsing happens on this device; a link is fetched through the Worker (worker/README.md, "Calendar feeds").
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router'
import { CalendarDays, FileUp, Link2 } from 'lucide-react'
import { FileTrigger } from 'react-aria-components'
import { db, scheduleAll, type Lms } from '../../data'
import { feedCourses, importCalendar, listFeeds, readCalendar, rowStates } from '../../data/calendar'
import { courseKey, courses, type TaskRow } from '../../domain/ics'
import { formatDay, isRealISODate, toLocalISODate } from '../../lib/date'
import { API_URL } from '../../pwa/env'
import { feedUrl, fetchFeedText } from '../../pwa/feeds'
import { Button } from '../../ui/button'
import { Checkbox, ListBoxItem, Select, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
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
            {guide.mayVary ? 'These steps may vary: Google changes its menus, and some schools turn calendar sharing off. ' : 'Menus can differ between schools. '}
            The link is private: anyone who has it can read your calendar. Kiln keeps it only on your devices (sync carries it end-to-end encrypted).
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <TextField label="Calendar link" value={link} onChange={setLink} description="Starts with https:// or webcal://" />
          <Checkbox isSelected={keep} onChange={setKeep}>
            Keep in sync (check the link for new assignments when Kiln opens)
          </Checkbox>
          <div>
            <Button variant="secondary" onPress={() => void fetchLink(link)} isDisabled={busy || link.trim() === ''}>
              <Link2 /> {busy ? 'Reading the calendar...' : 'Read the link'}
            </Button>
          </div>
        </div>
        <div className="grid content-start gap-3">
          <p className="text-sm font-medium">Or upload a calendar file</p>
          <p className="text-sm text-text-muted">An .ics file you downloaded from your calendar, up to 2 MB. It is read on this device.</p>
          <div>
            <FileTrigger acceptedFileTypes={['.ics', 'text/calendar']} onSelect={(files) => void pick(files as FileList | null)}>
              <Button variant="secondary">
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
      {loaded && <CalendarReview key={loads} loaded={loaded} />}
    </div>
  )
}

type Edit = { include?: boolean; title?: string; minutes?: string; due?: string }

type Problems = { title?: string; minutes?: string; due?: string }

function rowProblems(r: TaskRow, e: Edit, today: string): Problems {
  const title = (e.title ?? r.title).trim()
  const minutes = Number(e.minutes ?? r.minutes)
  const due = e.due ?? r.due
  const out: Problems = {}
  if (title === '' || title.length > 120) out.title = 'Give it a title of up to 120 characters.'
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) out.minutes = 'Minutes must be a whole number from 5 to 600.'
  if (!isRealISODate(due) || due < today) out.due = 'The due date must be today or later.'
  return out
}
const hasProblem = (p: Problems) => Object.keys(p).length > 0

function CalendarReview({ loaded }: { loaded: Loaded }) {
  const navigate = useNavigate()
  const today = toLocalISODate(new Date())
  const { items, rows } = useMemo(() => readCalendar(loaded.text), [loaded.text])
  const upcoming = useMemo(() => rows.filter((r) => r.due >= today), [rows, today])
  const list = useMemo(() => courses(items), [items])
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(list.filter((c) => !loaded.tick || loaded.tick.has(courseKey(c.course))).map((c) => c.course)),
  )
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const states = useLiveQuery(() => rowStates(db, upcoming), [upcoming])
  const edit = (key: string, patch: Edit) => setEdits((all) => ({ ...all, [key]: { ...all[key], ...patch } }))

  if (items.length === 0) return <p role="alert" className="text-sm text-danger">No events found in this calendar.</p>

  const actionable = upcoming.filter((r) => ticked.has(r.course) && ['new', 'changed'].includes(states?.get(r.key)?.status ?? ''))
  const chosen = actionable.filter((r) => edits[r.key]?.include !== false)
  const problems = chosen.filter((r) => hasProblem(rowProblems(r, edits[r.key] ?? {}, today)))
  const past = rows.length - upcoming.length
  // Why the Import button is off, in words.
  const reason = !states
    ? 'Checking what is already in Kiln...'
    : ticked.size === 0
      ? 'Tick at least one course to import.'
      : problems.length > 0
        ? `Fix the ${problems.length} row${problems.length === 1 ? '' : 's'} marked in red first, or untick ${problems.length === 1 ? 'it' : 'them'}.`
        : undefined

  async function run() {
    setBusy(true)
    setFailure(undefined)
    try {
      const final = chosen.map((r) => {
        const e = edits[r.key] ?? {}
        return { ...r, title: (e.title ?? r.title).trim(), minutes: Number(e.minutes ?? r.minutes), due: e.due ?? r.due }
      })
      const res = await importCalendar(db, { items, rows: final, courses: [...ticked], startDate: today, feed: loaded.feed })
      let note = ''
      try {
        await scheduleAll(db, today)
      } catch (e) {
        note = ` Scheduling failed (${message(e)}); reschedule from Settings.`
      }
      const parts = [
        `${res.tasksAdded} task${res.tasksAdded === 1 ? '' : 's'} added`,
        ...(res.datesChanged > 0 ? [`${res.datesChanged} due date${res.datesChanged === 1 ? '' : 's'} moved`] : []),
        ...(res.eventsAdded + res.eventsUpdated > 0 ? [`${res.eventsAdded + res.eventsUpdated} calendar event${res.eventsAdded + res.eventsUpdated === 1 ? '' : 's'}`] : []),
      ]
      toasts.add({ title: `Imported ${res.planIds.length} course${res.planIds.length === 1 ? '' : 's'}`, description: `${parts.join(', ')}.${note}` }, { timeout: 6000 })
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
        <p className="text-sm text-text-muted">Each course you tick becomes a plan. Assignments become tasks scheduled before their due dates; class times and exams go on the calendar.</p>
        {list.map((c) => (
          <Checkbox
            key={c.course}
            isSelected={ticked.has(c.course)}
            onChange={(on) => setTicked((s) => (on ? new Set([...s, c.course]) : new Set([...s].filter((x) => x !== c.course))))}
          >
            {c.course}: {c.tasks} assignment{c.tasks === 1 ? '' : 's'}, {c.events} class time{c.events === 1 ? '' : 's'} or exam{c.events === 1 ? '' : 's'}
          </Checkbox>
        ))}
        {past > 0 && <p className="text-sm text-text-muted">{past} assignment{past === 1 ? ' was' : 's were'} due before today and {past === 1 ? 'is' : 'are'} left out.</p>}
      </Card>

      {list
        .filter((c) => ticked.has(c.course))
        .map((c) => {
          const mine = upcoming.filter((r) => r.course === c.course)
          const shown = mine.filter((r) => ['new', 'changed'].includes(states?.get(r.key)?.status ?? ''))
          const already = mine.length - shown.length
          return (
            <Card key={c.course} className="grid gap-3">
              <h2 className="text-base font-medium">{c.course}</h2>
              {shown.length === 0 && <p className="text-sm text-text-muted">{states ? 'No new assignments.' : 'Checking...'}</p>}
              {shown.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Assignments in {c.course}</caption>
                    <thead className="text-text-muted">
                      <tr>
                        <th className="p-1 font-medium">Import</th>
                        <th className="p-1 font-medium">Title</th>
                        <th className="p-1 font-medium">Minutes</th>
                        <th className="p-1 font-medium">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => {
                        const e = edits[r.key] ?? {}
                        const st = states?.get(r.key)
                        const problem = e.include !== false ? rowProblems(r, e, today) : {}
                        const fieldProps = (f: keyof Problems) => ({ 'aria-invalid': problem[f] ? true : undefined, 'aria-describedby': problem[f] ? `${r.key}-${f}-error` : undefined })
                        const input = 'h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-text'
                        return (
                          <tr key={r.key} className="align-top" data-testid="calendar-row">
                            <td className="p-1">
                              <input type="checkbox" aria-label={`Import ${r.title}`} className="mt-2.5 size-4 accent-accent" checked={e.include !== false} onChange={(ev) => edit(r.key, { include: ev.target.checked })} />
                            </td>
                            {st?.status === 'changed' ? (
                              <td className="p-1 pt-2.5" colSpan={3}>
                                {r.title}: due date moved from {st.oldDue ? formatDay(st.oldDue) : 'none'} to {formatDay(r.due)}
                              </td>
                            ) : (
                              <>
                                <td className="min-w-48 p-1">
                                  <input aria-label={`Title of ${r.title}`} className={input} value={e.title ?? r.title} onChange={(ev) => edit(r.key, { title: ev.target.value })} {...fieldProps('title')} />
                                  {problem.title && <p id={`${r.key}-title-error`} className="pt-1 text-danger">{problem.title}</p>}
                                </td>
                                <td className="w-24 p-1">
                                  <input aria-label={`Minutes for ${r.title}`} className={input} inputMode="numeric" value={e.minutes ?? String(r.minutes)} onChange={(ev) => edit(r.key, { minutes: ev.target.value })} {...fieldProps('minutes')} />
                                  {problem.minutes && <p id={`${r.key}-minutes-error`} className="pt-1 text-danger">{problem.minutes}</p>}
                                </td>
                                <td className="w-40 p-1">
                                  <input aria-label={`Due date of ${r.title}`} type="date" className={input} value={e.due ?? r.due} min={today} onChange={(ev) => edit(r.key, { due: ev.target.value })} {...fieldProps('due')} />
                                  {problem.due && <p id={`${r.key}-due-error`} className="pt-1 text-danger">{problem.due}</p>}
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
              {already > 0 && <p className="text-sm text-text-muted">{already} already in Kiln (re-importing keeps your progress).</p>}
            </Card>
          )
        })}

      {failure && (
        <p role="alert" className="text-sm text-danger">
          Could not import: {failure}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onPress={run} isDisabled={busy || !states || ticked.size === 0 || problems.length > 0} aria-describedby={reason ? 'calendar-import-reason' : undefined}>
          <CalendarDays /> {busy ? 'Importing...' : `Import ${chosen.length} assignment${chosen.length === 1 ? '' : 's'}`}
        </Button>
        {reason && (
          <span id="calendar-import-reason" className="text-sm text-text-muted">
            {reason}
          </span>
        )}
        {loaded.feed && <span className="text-sm text-text-muted">Kiln will check this link for changes when it opens (at most every 6 hours).</span>}
      </div>
    </div>
  )
}
