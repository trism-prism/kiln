import { Link } from '../../ui/button'
import { Badge, EmptyState, ProgressBar, Skeleton } from '../../ui/surface'
import { formatDay } from '../../lib/date'
import { Page } from '../Page'
import { usePlanSummaries, useToday } from '../queries'

export default function PlansPage() {
  const plans = usePlanSummaries(useToday())
  return (
    <Page title="Plans" actions={<Link href="/import" variant="secondary">Import a plan</Link>}>
      {!plans ? (
        <Skeleton className="h-40 w-full" />
      ) : plans.length === 0 ? (
        <EmptyState title="No plans yet" action={<Link href="/import" variant="primary">Import a plan</Link>}>
          Your plans are listed here once you import them.
        </EmptyState>
      ) : (
        <ul className="grid gap-4">
          {plans.map((s) => (
            <li key={s.plan.id} className="grid gap-3 rounded-lg border border-border bg-surface-raised p-5 shadow-sm md:grid-cols-[1fr_16rem] md:items-center">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium">
                    <Link href={`/plans/${s.plan.id}`}>{s.plan.title}</Link>
                  </h2>
                  {s.overdue > 0 && <Badge tone="danger">{s.overdue} overdue</Badge>}
                </div>
                <p className="text-sm text-text-muted">
                  {[
                    `${s.allTotal} tasks`,
                    `weight ${s.plan.weight}`,
                    s.plan.deadline ? `deadline ${formatDay(s.plan.deadline, true)}` : undefined,
                    s.finish ? `projected finish ${formatDay(s.finish, true)}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ProgressBar label="Core tasks" value={s.coreTotal ? Math.round((s.coreDone / s.coreTotal) * 100) : 0} valueLabel={`${s.coreDone} of ${s.coreTotal}`} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
