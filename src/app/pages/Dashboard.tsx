import { Button, Link } from '../../ui/button'
import { Badge, Card, EmptyState, Meter, ProgressBar, Skeleton } from '../../ui/surface'
import { formatDay } from '../../lib/date'
import { rescheduleOverdue } from '../actions'
import { StreakChip } from '../calendar/Streak'
import { canSeed, loadSamplePlans } from '../devSeed'
import { Page } from '../Page'
import { percent } from '../parts'
import { usePlanSummaries, useStudy, useToday, type PlanSummary } from '../queries'

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)

function PlanCard({ s }: { s: PlanSummary }) {
  const { plan } = s
  const late = s.finish !== undefined && plan.deadline !== undefined && s.finish > plan.deadline
  return (
    <Card className="grid content-start gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-medium">
          <Link href={`/plans/${plan.id}`} className="text-text no-underline data-hovered:underline">
            {plan.title}
          </Link>
        </h2>
        {s.overdue > 0 && <Badge tone="danger">{s.overdue} overdue</Badge>}
      </div>
      <p className="text-sm text-text-muted">
        {s.todayCount > 0 ? `${s.todayCount} to do today` : 'Nothing left today'}
        {s.next ? (
          <>
            {' · Next: '}
            <Link href={`/task/${s.next.id}`}>{s.next.title}</Link>
            {s.next.scheduledDate && ` (${formatDay(s.next.scheduledDate)})`}
          </>
        ) : (
          ' · No open tasks'
        )}
      </p>
      <ProgressBar label="Essential tasks" value={pct(s.coreDone, s.coreTotal)} valueLabel={`${s.coreDone} of ${s.coreTotal}`} />
      <p className="-mt-2 text-xs text-text-muted">All tasks: {s.allDone} of {s.allTotal} done</p>
      <Meter label="Mastery" value={Math.round(s.mastery * 100)} valueLabel={percent(s.mastery)} />
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        {s.finish ? `Expected finish ${formatDay(s.finish, true)}` : 'No finish date yet'}
        {late && <Badge tone="warning">After the {formatDay(plan.deadline!, true)} deadline</Badge>}
      </p>
    </Card>
  )
}

export default function DashboardPage() {
  const today = useToday()
  const plans = usePlanSummaries(today)
  const study = useStudy(today)
  const overdue = plans?.reduce((n, s) => n + s.overdue, 0) ?? 0

  return (
    <Page title="Dashboard" actions={overdue > 0 ? <Button variant="secondary" onPress={() => void rescheduleOverdue()}>Reschedule overdue ({overdue})</Button> : undefined}>
      {!plans ? (
        <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          title="No plans yet"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/import" variant="primary">Import a plan</Link>
              {canSeed && (
                <Button variant="secondary" onPress={() => void loadSamplePlans()}>
                  Load sample plans
                </Button>
              )}
            </div>
          }
        >
          Import a study plan and Kiln turns it into a daily list with due dates, reviews and one LeetCode problem a day.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {study && (
            <div>
              <StreakChip stats={study.stats} />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((s) => (
              <PlanCard key={s.plan.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </Page>
  )
}
