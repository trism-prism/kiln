import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, scheduleAll, softDeletePlan, updateRecord, type TaskRecord } from '../../data'
import { formatDay, isRealISODate, toLocalISODate } from '../../lib/date'
import { Button, Link } from '../../ui/button'
import { ListBoxItem, Select, Switch, TextField } from '../../ui/form'
import { Sheet, toasts } from '../../ui/overlay'
import { Badge, Card, EmptyState, ProgressBar, Skeleton } from '../../ui/surface'
import { rescheduleOverdue, safely, scheduleBacklogAgain } from '../actions'
import { Page } from '../Page'
import { minutesText, TitleLink } from '../parts'
import { PRIORITY_LABEL } from '../priority'
import { usePlanDetail, useToday, type PlanDetail } from '../queries'

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

function Settings({ detail }: { detail: PlanDetail }) {
  const { plan } = detail
  const [deadline, setDeadline] = useState(plan.deadline ?? '')
  // A half-typed date reads as empty, so only a complete date is saved; Clear removes the deadline.
  const commitDeadline = () => {
    if (deadline !== plan.deadline && isRealISODate(deadline)) void safely(() => updateRecord(db, 'plans', plan.id, { deadline: deadline }))
  }
  return (
    <Card className="grid h-fit gap-5">
      <h2 className="text-base font-medium">Plan settings</h2>
      <Select
        label="Weight"
        description="How much of each day this plan gets compared with the others (1 to 5)."
        selectedKey={String(plan.weight)}
        onSelectionChange={(k) => void safely(() => updateRecord(db, 'plans', plan.id, { weight: Number(k) }))}
      >
        {['1', '2', '3', '4', '5'].map((w) => (
          <ListBoxItem key={w} id={w}>
            {w}
          </ListBoxItem>
        ))}
      </Select>
      <Switch
        isSelected={!!plan.skipOptional}
        onChange={(on) =>
          void safely(async () => {
            await updateRecord(db, 'plans', plan.id, { skipOptional: on })
            await scheduleAll(db, toLocalISODate(new Date()))
          })
        }
      >
        Skip optional work
      </Switch>
      <TextField
        label="Deadline"
        type="date"
        value={deadline}
        onChange={setDeadline}
        onBlur={commitDeadline}
        description="Optional. Kiln warns you if your expected finish is later."
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
      <p className="text-sm text-text-muted">Weight and deadline apply the next time you reschedule.</p>
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
            {detail.plan.title} and its tasks, reviews and history are removed from this device. Export a backup first if you might want them back.
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

export default function PlanPage() {
  const { planId } = useParams()
  const detail = usePlanDetail(planId)
  const today = useToday()
  const [confirming, setConfirming] = useState(false)

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
  return (
    <Page
      title={detail.plan.title}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onPress={() => void rescheduleOverdue()}>
            Reschedule
          </Button>
          <Button variant="quiet" onPress={() => setConfirming(true)}>
            Delete plan
          </Button>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
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
        <Settings detail={detail} />
      </div>
      <DeleteDialog detail={detail} isOpen={confirming} onOpenChange={setConfirming} />
    </Page>
  )
}
