// Steps 3-7 of docs/plan-import.md for one input: validation report, plan details, match, preview, import.
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { RadioGroup, Radio, Label } from 'react-aria-components'
import { Dot } from './Dot'
import { db, importPlan, previewImport, scheduleAll, type ImportPreview } from '../../data'
import type { Plan } from '../../domain/plan-format'
import { addDaysISO, toLocalISODate } from '../../lib/date'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { META_START_DATE } from '../../pwa/onboarding'
import { Report } from './Report'
import {
  analyze,
  decideMatch,
  defaultChoice,
  effectiveId,
  hours,
  isValidId,
  splitIssues,
  summarize,
  type Analysis,
  type Choice,
  type Details,
  type Input,
} from './logic'

const PRIORITIES = ['core', 'recommended', 'optional'] as const

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Results are tagged with what they were computed for, so a slow result never shows for newer input. */
function useAsync<T>(deps: unknown[], run: () => Promise<T>, delay = 0): { value?: T; error?: string; stale: boolean } {
  const [state, setState] = useState<{ deps: unknown[]; value?: T; error?: string }>()
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      run().then(
        (value) => live && setState({ deps, value }),
        (e: unknown) => live && setState({ deps, error: message(e) }),
      )
    }, delay)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is rebuilt every render; deps list what it reads
  }, deps)
  const stale = !state || state.deps.length !== deps.length || state.deps.some((d, i) => d !== deps[i])
  return { value: state?.value, error: state?.error, stale }
}

export function Review({ input }: { input: Input }) {
  const navigate = useNavigate()
  const today = toLocalISODate(new Date())
  // Onboarding remembers the start date the person chose; it is the default while it is still today or later.
  const chosen0 = useLiveQuery(() => db.meta.get(META_START_DATE))?.value
  const tomorrow = chosen0 !== undefined && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(chosen0) && chosen0 >= today ? chosen0 : addDaysISO(today, 1)
  const [title, setTitle] = useState('')
  const [id, setId] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [userStart, setUserStart] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Choice | null>(null)
  const [copyId, setCopyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()

  const details: Details = { title, id: id ?? '', goal, startDate: userStart ?? tomorrow, deadline: deadline ?? '' }
  const analysis = useAsync<Analysis>(
    [input, title, id, goal, details.startDate],
    () => analyze(db, input, details),
    250,
  )
  const a = analysis.stale ? undefined : analysis.value
  const plan = a?.result.plan
  const sheet = a?.detected === 'sheet' || input.kind === 'build'
  const startDate = userStart ?? plan?.startDate ?? tomorrow
  const deadlineValue = deadline ?? plan?.deadline ?? ''

  const choice: Choice = chosen ?? defaultChoice(a?.existing, plan)
  const match = plan && a ? decideMatch(plan, a.existing, choice) : undefined
  const suggestedCopyId = (() => {
    if (!plan || !a) return ''
    let n = 1
    let candidate = `${plan.id}-copy`.slice(0, 64)
    while (a.keys.has(candidate)) candidate = `${plan.id}-copy-${++n}`.slice(0, 64)
    return candidate
  })()
  const newId = copyId ?? suggestedCopyId
  const copyProblem = match?.kind !== 'copy' ? undefined : !isValidId(newId) ? 'Use lowercase letters, digits and hyphens, up to 64 characters.' : a?.keys.has(newId) ? 'A plan with this id already exists.' : undefined
  const isCopy = match?.kind === 'copy'
  // Memoized: it is a dependency of the preview, and a new object every render would re-run it forever.
  const finalPlan = useMemo<Plan | undefined>(() => (plan && isCopy ? { ...plan, id: newId } : plan), [plan, isCopy, newId])

  const dateProblem = !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? 'Choose a start date.'
    : deadlineValue !== '' && deadlineValue < startDate
      ? 'The deadline is before the start date.'
      : undefined
  const titleProblem = a?.detected === 'sheet' && input.kind !== 'build' && title.trim() === '' ? 'Enter a title for the plan.' : undefined
  const ready = !!finalPlan && !!match && match.kind !== 'blocked' && !copyProblem && !dateProblem && !titleProblem

  const preview = useAsync<ImportPreview>(
    [finalPlan, ready, startDate, deadlineValue],
    () => (finalPlan && ready ? previewImport(db, finalPlan, { startDate, deadline: deadlineValue || undefined }, toLocalISODate(new Date())) : Promise.reject(new Error(''))),
    0,
  )
  const p = !ready || preview.stale ? undefined : preview.value

  async function run() {
    if (!finalPlan || busy) return
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await importPlan(db, finalPlan, { startDate, deadline: deadlineValue || undefined })
      const parts = [`${result.tasksAdded} added`, ...(result.tasksUpdated > 0 ? [`${result.tasksUpdated} updated`] : [])]
      let scheduled = ''
      try {
        await scheduleAll(db, toLocalISODate(new Date()))
      } catch (e) {
        // The plan is saved; only the dates are missing, and Settings can reschedule.
        scheduled = ` Scheduling failed (${message(e)}); reschedule from Settings.`
      }
      toasts.add({ title: `Imported "${finalPlan.title}"`, description: `${parts.join(', ')} tasks.${scheduled}` }, { timeout: 6000 })
      void navigate(`/plans/${result.planId}`)
    } catch (e) {
      setFailure(message(e))
      setBusy(false)
    }
  }

  const issues = a?.result.issues ?? []
  const errorCount = splitIssues(issues).errors.length

  return (
    <div className="grid gap-6" aria-busy={analysis.stale}>
      {!analysis.stale && analysis.error && <p role="alert" className="text-sm text-danger">Could not read the input: {analysis.error}</p>}
      {!a && !analysis.error && <p className="text-sm text-text-muted" role="status">Checking the plan...</p>}

      {a && (
        <>
          <Report issues={issues} />
          {errorCount === 0 && plan && <p className="text-sm text-text-muted" role="status">The plan is valid: {plan.tasks.length} tasks in {plan.modules.length} modules.</p>}
        </>
      )}

      {(sheet || plan) && (
        <Card className="grid gap-4">
          <h2 className="text-base font-medium">Plan details</h2>
          {sheet && (
            <div className="grid gap-4 md:grid-cols-2">
              {input.kind !== 'build' && (
                <TextField label="Title" value={title} onChange={setTitle} isRequired />
              )}
              <TextField
                label="Plan id"
                description="Re-importing the same id updates the plan and keeps progress."
                value={id ?? effectiveId({ id: '', title: input.kind === 'build' ? input.draft.title : title })}
                onChange={setId}
              />
              <TextField label="Goal (optional)" value={goal} onChange={setGoal} className="md:col-span-2" />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={setUserStart}
              description={match?.kind === 'update' || match?.kind === 'part' ? 'Not used: this plan already has a start date.' : undefined}
            />
            <TextField
              label="Deadline (optional)"
              type="date"
              value={deadlineValue}
              onChange={setDeadline}
              description={plan?.deadline ? 'Empty uses the deadline in the plan file.' : undefined}
            />
          </div>
          {dateProblem && <p role="alert" className="text-sm text-danger">{dateProblem}</p>}
          {titleProblem && <p role="alert" className="text-sm text-danger">{titleProblem}</p>}
        </Card>
      )}

      {plan && match && (
        <Card className="grid gap-3">
          <h2 className="text-base font-medium">Match</h2>
          <p className="text-sm" data-testid="match">{match.label}</p>
          {match.kind === 'blocked' && <p role="alert" className="text-sm text-danger">This part cannot be imported yet.</p>}
          {match.choices.length > 0 && (
            <RadioGroup value={choice} onChange={(v) => setChosen(v as Choice)} className="grid gap-2 text-sm">
              <Label className="sr-only">What to do with the existing plan</Label>
              <Radio value="update" className="group flex items-start gap-3">
                <Dot />
                <span>Update &quot;{a?.existing?.title}&quot;: keep progress and match tasks by id</span>
              </Radio>
              <Radio value="copy" className="group flex items-start gap-3">
                <Dot />
                <span>Import as a copy with a new id</span>
              </Radio>
            </RadioGroup>
          )}
          {(match.kind === 'update' || match.kind === 'part') && (
            <p className="text-sm text-text-muted">Tasks and modules that are in Kiln but missing from this file are kept, not removed.</p>
          )}
          {match.kind === 'copy' && (
            <TextField label="Id of the copy" value={newId} onChange={setCopyId} isInvalid={!!copyProblem} errorMessage={copyProblem} className="max-w-sm" />
          )}
        </Card>
      )}

      {finalPlan && ready && (
        <PreviewCard plan={finalPlan} preview={p} error={preview.stale ? undefined : preview.error} deadline={deadlineValue} startDate={startDate} existing={a?.existingTaskKeys} />
      )}

      {failure && <p role="alert" className="text-sm text-danger">Could not import: {failure}</p>}
      {plan && (
        <div>
          <Button onPress={run} isDisabled={!ready || busy || !p}>
            {busy ? 'Importing...' : buttonText(match?.kind, finalPlan)}
          </Button>
        </div>
      )}
    </div>
  )
}

function PreviewCard({
  plan,
  preview,
  error,
  deadline,
  startDate,
  existing,
}: {
  plan: Plan
  preview?: ImportPreview
  error?: string
  deadline: string
  startDate: string
  existing?: Set<string>
}) {
  const s = summarize(plan)
  const added = existing ? plan.tasks.filter((t) => !existing.has(t.id)).length : s.tasks
  const planId = preview?.result.planId
  const finish = planId ? preview?.output.projectedFinish[planId] : undefined
  const missed = preview?.output.violations.find((v) => v.kind === 'plan-deadline' && v.planId === planId)
  const lateTasks = preview?.output.violations.filter((v) => v.kind === 'task-deadline' && v.planId === planId).length ?? 0
  const backlog = preview?.tasks.filter((t) => t.backlog).length ?? 0
  const dated = preview?.tasks.filter((t) => t.scheduledDate !== undefined) ?? []
  const practiceDates = preview?.output.practice.filter((g) => g.planId === planId).map((g) => g.date) ?? []
  const first = [...dated.map((t) => t.scheduledDate as string), ...practiceDates].sort()[0] ?? startDate
  const last = addDaysISO(first, 13)
  const days = new Map<string, { title: string; minutes: number }[]>()
  for (const t of dated) {
    const d = t.scheduledDate as string
    if (d >= first && d <= last) days.set(d, [...(days.get(d) ?? []), { title: t.title, minutes: t.estimatedMinutes }])
  }
  for (const g of preview?.output.practice ?? []) {
    if (g.planId === planId && g.date >= first && g.date <= last) {
      days.set(g.date, [...(days.get(g.date) ?? []), { title: `LeetCode: ${g.title} (${g.difficulty})`, minutes: g.minutes }])
    }
  }

  return (
    <Card className="grid gap-4">
      <h2 className="text-base font-medium">Preview</h2>
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Stat label="Modules" value={String(s.modules)} />
        <Stat label="Tasks" value={existing && existing.size > 0 ? `${s.tasks} (${added} new)` : String(s.tasks)} />
        <Stat label="Total time" value={hours(s.totalMinutes)} />
        {PRIORITIES.map((pr) => (
          <Stat key={pr} label={`Time, ${pr}`} value={hours(s.minutesByPriority[pr])} />
        ))}
      </dl>
      {error && <p role="alert" className="text-sm text-danger">Could not build the schedule: {error}</p>}
      {!preview && !error && <p className="text-sm text-text-muted" role="status">Building the schedule...</p>}
      {preview && (
        <div className="grid gap-4">
          <div className="grid gap-1 text-sm" data-testid="projection">
            {!preview.result.complete ? (
              <p>Scheduling starts when every part of the plan is imported.</p>
            ) : (
              <>
                <p>
                  Projected finish: <strong className="font-medium">{finish ? dayLabel(finish) : 'none (nothing to schedule)'}</strong> at your current budget.
                </p>
                {deadline === '' && !plan.deadline ? (
                  <p className="text-text-muted">No deadline set.</p>
                ) : missed && missed.kind === 'plan-deadline' ? (
                  <p className="text-danger">Misses the deadline of {dayLabel(missed.deadline)}: projected finish {dayLabel(missed.projectedFinish)}. Raise your minutes or move the deadline.</p>
                ) : (
                  <p className="text-success">On track for the deadline of {dayLabel(deadline || (plan.deadline as string))}.</p>
                )}
                {lateTasks > 0 && <p className="text-danger">{lateTasks} {lateTasks === 1 ? 'task is' : 'tasks are'} scheduled after {lateTasks === 1 ? 'its' : 'their'} own deadline.</p>}
                {backlog > 0 && <p className="text-text-muted">{backlog} {backlog === 1 ? 'task is' : 'tasks are'} deferred to the backlog to make the deadline.</p>}
              </>
            )}
          </div>
          {preview.result.complete && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">First 14 days</h3>
              {days.size === 0 ? (
                <p className="text-sm text-text-muted">Nothing is scheduled in the first 14 days.</p>
              ) : (
                <ol className="grid gap-3 text-sm">
                  {[...days].sort(([x], [y]) => (x < y ? -1 : 1)).map(([d, items]) => (
                    <li key={d} className="grid gap-1">
                      <span className="font-medium">
                        {dayLabel(d)} <span className="font-normal text-text-muted tabular-nums">{items.reduce((n, i) => n + i.minutes, 0)} min</span>
                      </span>
                      <ul className="grid gap-0.5 text-text-muted">
                        {items.map((i, k) => (
                          <li key={k}>
                            {i.title} <span className="tabular-nums">({i.minutes} min)</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1">
      <dt className="text-text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

/** "Update <title>", "Add part 2 of 3 to <title>", "Import <title>", "Import <title> as a copy". */
function buttonText(kind: string | undefined, plan: Plan | undefined): string {
  const t = `"${plan?.title ?? ''}"`
  if (kind === 'update') return `Update ${t}`
  if (kind === 'part') return `Add part ${plan?.part?.index} of ${plan?.part?.total} to ${t}`
  if (kind === 'copy') return `Import ${t} as a copy`
  return `Import ${t}`
}
