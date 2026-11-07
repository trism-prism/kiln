import { useLiveQuery } from 'dexie-react-hooks'
import { brushUp, db, masteryByTopic, type BrushUpEntry } from '../../data'
import { formatDay } from '../../lib/date'
import { localDate } from '../../domain/mastery'
import { Button, Link } from '../../ui/button'
import { Badge, EmptyState, Meter, Skeleton } from '../../ui/surface'
import { Page } from '../Page'
import { LeetCodeLink, percent } from '../parts'
import { useMinute, useToday } from '../queries'
import { useCompleter } from '../rating'

const humanize = (topic: string) => {
  const s = topic.replace(/-/g, ' ')
  return s[0]!.toUpperCase() + s.slice(1)
}

function Entry({ e, onReview }: { e: BrushUpEntry; onReview: () => void }) {
  const dueDay = localDate(e.card.due)
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[1fr_14rem_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{e.title}</span>
          {e.due ? <Badge tone="danger">Due</Badge> : <Badge>Due {formatDay(dueDay)}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{e.card.topics.length ? e.card.topics.map(humanize).join(', ') : 'LeetCode problem'}</p>
      </div>
      <Meter label="Recall" value={Math.round(e.retrievability * 100)} valueLabel={percent(e.retrievability)} />
      <div className="flex items-center gap-3">
        {e.card.taskId ? (
          <Link href={`/task/${e.card.taskId}`} aria-label={`Open task: ${e.title}`}>
            Open task
          </Link>
        ) : (
          e.card.slug && <LeetCodeLink slug={e.card.slug} title={e.title} language={e.language} />
        )}
        <Button variant={e.due ? 'primary' : 'secondary'} onPress={onReview} aria-label={`Review now: ${e.title}`}>
          Review now
        </Button>
      </div>
    </li>
  )
}

export default function BrushUpPage() {
  const today = useToday()
  const minute = useMinute()
  const data = useLiveQuery(async () => {
    const now = Date.now()
    return { entries: await brushUp(db, now), topics: await masteryByTopic(db, now) }
  }, [today, minute])
  const { complete } = useCompleter()

  const topics = data ? Object.entries(data.topics).sort(([a, x], [b, y]) => x.mastery - y.mastery || a.localeCompare(b)) : []
  return (
    <Page title="Brush up">
      {!data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-10">
          <section aria-labelledby="weakest" className="grid gap-3">
            <h2 id="weakest" className="text-base font-medium">
              Weakest first
            </h2>
            {data.entries.length === 0 ? (
              <EmptyState title="Nothing to brush up on">
                Topics you rate as shaky come back here, spaced out so you review them just before you would forget.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised px-4 shadow-sm">
                {data.entries.map((e) => (
                  <Entry key={e.card.id} e={e} onReview={() => complete({ kind: 'review', id: e.card.id, title: `Review: ${e.title}` })} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="by-topic" className="grid gap-3">
            <h2 id="by-topic" className="text-base font-medium">
              Mastery by topic
            </h2>
            {topics.length === 0 ? (
              <p className="text-sm text-text-muted">Topics appear here once your plans have lessons and problems.</p>
            ) : (
              <ul className="grid gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-sm md:grid-cols-2">
                {topics.map(([topic, s]) => (
                  <li key={topic}>
                    <Meter label={humanize(topic)} value={Math.round(s.mastery * 100)} valueLabel={`${percent(s.mastery)} · ${s.studied} of ${s.total} studied`} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Page>
  )
}
