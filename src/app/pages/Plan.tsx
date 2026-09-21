import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  db,
  getSettings,
  isStudyPlan,
  listPlans,
  practiceOn,
  reviewsOn,
  scheduleAll,
  setPlanShare,
  SHARE_LABEL,
  shareFromWeight,
  SHARES,
  softDeletePlan,
  updateRecord,
  type PlanRecord,
  type Share,
  type TaskRecord,
} from '../../data'
import { cardMinutes } from '../../domain/mastery'
import { dayLabel, shortDate } from '../../domain/todo'
import { formatDay, isRealISODate, toLocalISODate } from '../../lib/date'
import { Button, Link } from '../../ui/button'
import { ListBoxItem, Select, Switch, TextField } from '../../ui/form'
import { Sheet, toasts } from '../../ui/overlay'
import { Badge, Card, EmptyState, ProgressBar, Skeleton, Stat } from '../../ui/surface'
import { rescheduleOverdue, safely, scheduleBacklogAgain } from '../actions'
import { Page } from '../Page'
import { PlanEditor } from '../plan/PlanEditor'
import { shareExample } from '../plan/share-example'
import { FavoriteButton, History } from '../plan/PlanExtras'
import { StudyTimeSheet } from '../plan/StudyTimeSheet'
import { minutesText, StudyPlanned, StudyWeekBar, TitleLink } from '../parts'
import { PRIORITY_LABEL } from '../priority'
import { usePlanDetail, useStudyDetail, useToday, type PlanDetail } from '../queries'

function TaskRow({ t, today }: { t: TaskRecord; today: string }) {
  const overdue = t.status === 'open' && !!t.scheduledDate && t.scheduledDate < today
  const done = t.status === 'done'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
      <TitleLink href={`/task/${t.id}`} className={`min-w-0 flex-1 basis-60 font-medium ${done || t.status === 'skipped' ? 'text-text-muted' : ''}`}>
        {t.title}
      </TitleLink>
      <span className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {done && <Badge tone="success">Done</Badge>}
        {t.status === 'skipped' && <Badge>Skipped</Badge>}
        {overdue && <Badge tone="danger">Overdue</Badge>}
        <Badge>{PRIORITY_LABEL[t.priority]}</Badge>
        <span>{t.scheduledDate ? formatDay(t.scheduledDate) : t.backlog ? 'Backlog' : 'Not scheduled'}</span>
        <span>{minutesText(t.estimatedMinutes)}</span>
      </span>
    </li>
  )
}

function Modules({ detail, today }: { detail: PlanDetail; today: string }) {
  const firstOpen = detail.modules.findIndex((m) => m.tasks.some((t) => t.status === 'open'))
  return (
    <div className="grid gap-3">
      {detail.modules.map(({ module, tasks }, i) => {
        const counted = tasks.filter((t) => t.status !== 'skipped')
        const done = counted.filter((t) => t.status === 'done').length
        return (
          <details key={module.id} open={i === firstOpen} className="rounded-lg border border-border bg-surface-raised shadow-sm">
            <summary className="flex min-h-12 cursor-default items-center gap-3 rounded-lg px-4 py-2 font-medium outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
              <span className="min-w-0 flex-1">{module.title}</span>
              <span className="text-sm font-normal text-text-muted tabular-nums">
                {done} of {counted.length} done
              </span>
            </summary>
            {tasks.length > 0 && (
              <ul className="divide-y divide-border border-t border-border px-4">
                {tasks.map((t) => (
                  <TaskRow key={t.id} t={t} today={today} />
                ))}
              </ul>
            )}
          </details>
        )
      })}
    </div>
  )
}

function Settings({ detail, today }: { detail: PlanDetail; today: string }) {
  const { plan } = detail
  const [deadline, setDeadline] = useState(plan.deadline ?? '')
  // Plans with no lessons (course calendars) have nothing to review, so they get no switch.
  const hasReviewable = detail.modules.some((m) => m.tasks.some((t) => cardMinutes(t) !== undefined))
  const others = useLiveQuery(async () => ({ plans: await listPlans(db), settings: await getSettings(db) }))
  // A half-typed date reads as empty, so only a complete date is saved; Clear removes the deadline.
  const commitDeadline = () => {
    if (deadline !== plan.deadline && isRealISODate(deadline)) void safely(() => updateRecord(db, 'plans', plan.id, { deadline: deadline }))
  }
  const rescheduleAfter = (write: () => Promise<unknown>) =>
    void safely(async () => {
      await write()
      await scheduleAll(db, toLocalISODate(new Date()))
    })
  const example = others && shareExample(plan, others.plans, others.settings, today)
  return (
    <Card className="grid h-fit gap-5">
      <h2 className="text-base font-medium">Plan settings</h2>
      {others && others.plans.filter((p) => !isStudyPlan(p)).length > 1 && (
        <Select
          label="Share of study time"
          description={example ? `${example[0]!.toUpperCase()}${example.slice(1)}.` : undefined}
          selectedKey={plan.share ?? shareFromWeight(plan.weight)}
          onSelectionChange={(k) => rescheduleAfter(() => setPlanShare(db, plan.id, k as Share))}
        >
          {SHARES.map((s) => (
            <ListBoxItem key={s} id={s}>
              {SHARE_LABEL[s]}
            </ListBoxItem>
          ))}
        </Select>
      )}
      <Switch isSelected={!!plan.skipOptional} onChange={(on) => rescheduleAfter(() => updateRecord(db, 'plans', plan.id, { skipOptional: on }))}>
        Skip optional work
      </Switch>
      <Switch isSelected={practiceOn(plan)} onChange={(on) => rescheduleAfter(() => updateRecord(db, 'plans', plan.id, { dailyPracticeOn: on }))}>
        Daily practice problem
      </Switch>
      {hasReviewable && (
        <Switch isSelected={reviewsOn(plan)} onChange={(on) => rescheduleAfter(() => updateRecord(db, 'plans', plan.id, { reviewsOn: on }))}>
          Schedule reviews
        </Switch>
      )}
      <TextField
        label="Deadline (optional)"
        type="date"
        value={deadline}
        onChange={setDeadline}
        onBlur={commitDeadline}
        description="Takes effect the next time you reschedule."
      />
      {plan.deadline && (
        <Button
          variant="quiet"
          className="w-fit"
          onPress={() => {
            setDeadline('')
            void safely(() => updateRecord(db, 'plans', plan.id, { deadline: undefined }))
          }}
        >
          Clear deadline
        </Button>
      )}
    </Card>
  )
}

/** A study time plan's main column: this week and the next 7 days of sessions. Checking off happens in To Do. */
function StudySessions({ plan, today }: { plan: PlanRecord; today: string }) {
  const d = useStudyDetail(plan.id, today)
  if (!d) return <Skeleton className="h-40 w-full" />
  const ended = plan.deadline !== undefined && plan.deadline < today
  return (
    <div className="grid min-w-0 content-start gap-8">
      <div className="grid gap-2">
        <StudyWeekBar week={d.week} />
        <StudyPlanned week={d.week} minutesPerWeek={plan.studyMinutesPerWeek ?? 0} />
      </div>
      <section aria-labelledby="sessions" className="grid gap-3">
        <h2 id="sessions" className="text-base font-medium">
          Sessions
        </h2>
        {ended ? (
          <p className="text-sm text-text-muted">This plan ended on {formatDay(plan.deadline!, true)}.</p>
        ) : d.next.length === 0 ? (
          <p className="text-sm text-text-muted">No sessions in the next 7 days.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised px-4 shadow-sm">
            {d.next.map((s) => {
              const { label, dateText } = dayLabel(s.date, today)
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`min-w-0 flex-1 font-medium ${s.status === 'done' ? 'text-text-muted' : ''}`}>{label === 'Today' || label === 'Tomorrow' ? label : dateText}</span>
                  {s.status === 'done' && <Badge tone="success">Done</Badge>}
                  <span className="text-text-muted tabular-nums">{minutesText(s.minutes)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function StudySettings({ plan, today }: { plan: PlanRecord; today: string }) {
  return (
    <Card className="grid h-fit gap-4">
      <h2 className="text-base font-medium">Plan settings</h2>
      <dl className="grid gap-y-2 text-sm">
        <Stat label="Time per week" value={minutesText(plan.studyMinutesPerWeek ?? 0)} />
        <Stat label="Ends" value={plan.deadline ? shortDate(plan.deadline, today) : 'No end date'} />
      </dl>
    </Card>
  )
}

function DeleteDialog({ detail, isOpen, onOpenChange }: { detail: PlanDetail; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  return (
    <Sheet title="Delete this plan?" isOpen={isOpen} onOpenChange={onOpenChange}>
      {({ close }) => (
        <div className="grid gap-4">
          <p className="text-sm">
            {isStudyPlan(detail.plan)
              ? `${detail.plan.title} and its study history are removed from this device. Export a backup first if you might want them back.`
              : `${detail.plan.title} and its tasks, reviews and history are removed from this device. Export a backup first if you might want them back.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onPress={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onPress={() =>
                void safely(async () => {
                  await softDeletePlan(db, detail.plan.id)
                  close()
                  toasts.add({ title: `Deleted ${detail.plan.title}` }, { timeout: 5000 })
                  navigate('/plans')
                })
              }
            >
              Delete plan
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

type PlanActionsProps = {
  className: string
  editRef: RefObject<HTMLButtonElement | null>
  editing: boolean
  /** Study time plans have nothing to reschedule (nothing of theirs is ever overdue). */
  study: boolean
  onEdit: () => void
  onDelete: () => void
}

/** Rendered twice: in the top bar from md up, and as a row above the content on phones. */
function PlanActions({ className, editRef, editing, study, onEdit, onDelete }: PlanActionsProps) {
  return (
    <div className={`${className} shrink-0 items-center gap-2`}>
      {!editing && (
        <Button variant="secondary" ref={editRef} onPress={onEdit}>
          Edit plan
        </Button>
      )}
      {!study && (
        <Button variant="secondary" onPress={() => void rescheduleOverdue()}>
          Reschedule
        </Button>
      )}
      <Button variant="danger-outline" onPress={onDelete}>
        {/* No icon on phones, so the row fits a 360px screen. */}
        <Trash2 size={16} aria-hidden="true" className="hidden md:block" /> Delete plan
      </Button>
    </div>
  )
}

export default function PlanPage() {
  const { planId } = useParams()
  const detail = usePlanDetail(planId)
  const today = useToday()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingStudy, setEditingStudy] = useState(false)
  const barEdit = useRef<HTMLButtonElement>(null)
  const rowEdit = useRef<HTMLButtonElement>(null)
  // Closing the editor returns focus to the button that opened it (the copy that is on screen).
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing) [barEdit, rowEdit].find((r) => r.current?.checkVisibility())?.current?.focus()
    wasEditing.current = editing
  }, [editing])

  if (detail === undefined) {
    return (
      <Page title="Plan">
        <Skeleton className="h-48 w-full" />
      </Page>
    )
  }
  if (detail === null) {
    return (
      <Page title="Plan">
        <EmptyState title="Plan not found" action={<Link href="/plans">Back to Plans</Link>}>
          It may have been deleted.
        </EmptyState>
      </Page>
    )
  }

  const all = detail.modules.flatMap((m) => m.tasks).filter((t) => t.status !== 'skipped')
  const done = all.filter((t) => t.status === 'done').length
  const study = isStudyPlan(detail.plan)
  const actions = { editing, study, onEdit: () => (study ? setEditingStudy(true) : setEditing(true)), onDelete: () => setConfirming(true) }
  return (
    <Page
      title={detail.plan.title}
      actions={
        // flex-1 with basis 0: the h1 truncates first, the star stays next to it, the buttons go right.
        <div className="flex flex-1 items-center gap-2">
          <FavoriteButton plan={detail.plan} />
          <PlanActions className="ml-auto hidden md:flex" editRef={barEdit} {...actions} />
        </div>
      }
    >
      {/* Never wraps: tight padding fits 320px, then the buttons grow to share the row. It scrolls sideways
          only if a longer label can't fit. p-1 keeps focus rings unclipped. */}
      <PlanActions className="-m-1 mb-5 flex overflow-x-auto p-1 *:grow *:px-2 md:hidden" editRef={rowEdit} {...actions} />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        {study ? (
          <StudySessions plan={detail.plan} today={today} />
        ) : editing ? (
          <div className="min-w-0">
            <PlanEditor detail={detail} onClose={() => setEditing(false)} />
          </div>
        ) : (
          <div className="grid min-w-0 content-start gap-8">
            <ProgressBar label="All tasks" value={all.length ? Math.round((done / all.length) * 100) : 0} valueLabel={`${done} of ${all.length}`} />
            <section aria-labelledby="modules" className="grid gap-3">
              <h2 id="modules" className="text-base font-medium">
                Modules
              </h2>
              <Modules detail={detail} today={today} />
            </section>
            {detail.backlog.length > 0 && (
              <section aria-labelledby="backlog" className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="backlog" className="text-base font-medium">
                    Backlog
                  </h2>
                  <Button variant="secondary" onPress={() => void scheduleBacklogAgain()}>
                    Schedule again
                  </Button>
                </div>
                <p className="text-sm text-text-muted">The scheduler set these aside to keep the plan on time, or you chose to skip optional work. They have no date.</p>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised px-4">
                  {detail.backlog.map((t) => (
                    <TaskRow key={t.id} t={t} today={today} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        <div className="grid content-start gap-8">
          {study ? <StudySettings plan={detail.plan} today={today} /> : <Settings detail={detail} today={today} />}
          {!editing && !study && <History planId={detail.plan.id} />}
        </div>
      </div>
      <DeleteDialog detail={detail} isOpen={confirming} onOpenChange={setConfirming} />
      {study && <StudyTimeSheet isOpen={editingStudy} today={today} onClose={() => setEditingStudy(false)} plan={detail.plan} />}
    </Page>
  )
}
