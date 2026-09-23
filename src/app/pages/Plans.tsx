import { isStudyPlan, SHARE_LABEL, shareFromWeight } from '../../data'
import { shortDate } from '../../domain/todo'
import { Link } from '../../ui/button'
import { Badge, EmptyState, ProgressBar, Skeleton } from '../../ui/surface'
import { formatDay } from '../../lib/date'
import { Page } from '../Page'
import { minutesText, StudyPlanned, StudyWeekBar } from '../parts'
import { FavoriteButton } from '../plan/PlanExtras'
import { usePlanSummaries, useToday } from '../queries'

export default function PlansPage() {
  const today = useToday()
  const plans = usePlanSummaries(today)
  // Share of study time is only a choice between task plans (a study time plan has its own weekly time).
  const taskPlans = plans?.filter((s) => !isStudyPlan(s.plan)).length ?? 0
  return (
    // With no plans the empty state carries the one import button, so the header doesn't repeat it.
    <Page title="Plans" actions={plans?.length ? <Link href="/import" variant="secondary">Import a plan</Link> : undefined}>
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
                  <FavoriteButton plan={s.plan} label={`Favorite ${s.plan.title}`} />
                  <h2 className="text-base font-medium">
                    <Link href={`/plans/${s.plan.id}`}>{s.plan.title}</Link>
                  </h2>
                  {s.overdue > 0 && <Badge tone="danger">{s.overdue} overdue</Badge>}
                </div>
                <p className="text-sm text-text-muted">
                  {(s.study
                    ? [`${minutesText(s.plan.studyMinutesPerWeek ?? 0)} a week`, s.plan.deadline ? `ends ${shortDate(s.plan.deadline, today)}` : undefined]
                    : [
                    `${s.allTotal} tasks`,
                    taskPlans > 1 ? `${SHARE_LABEL[s.plan.share ?? shareFromWeight(s.plan.weight)]} share of study time` : undefined,
                    s.plan.deadline ? `deadline ${formatDay(s.plan.deadline, true)}` : undefined,
                    s.finish ? `expected finish ${formatDay(s.finish, true)}` : undefined,
                  ])
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {s.study && <StudyPlanned week={s.study} minutesPerWeek={s.plan.studyMinutesPerWeek ?? 0} />}
              </div>
              {s.study ? (
                <StudyWeekBar week={s.study} />
              ) : (
                <ProgressBar label="Essential tasks" value={s.coreTotal ? Math.round((s.coreDone / s.coreTotal) * 100) : 0} valueLabel={`${s.coreDone} of ${s.coreTotal}`} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
