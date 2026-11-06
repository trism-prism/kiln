import { useState } from 'react'
import { TODO_RANGES, todoView, type TodoItem, type TodoRange } from '../../domain/todo'
import { Link } from '../../ui/button'
import { Checkbox } from '../../ui/form'
import { Badge, EmptyState, Skeleton } from '../../ui/surface'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'
import { Page } from '../Page'
import { DifficultyBadge, LeetCodeLink, TitleLink, minutesText } from '../parts'
import { useToday, useTodoItems } from '../queries'
import { useCompleter, type Completable } from '../rating'
import { formatDay } from '../../lib/date'

function Row({ item, onComplete }: { item: TodoItem; onComplete: (i: Completable) => void }) {
  const muted = item.done
  return (
    <li className="flex items-start gap-3 py-3">
      <Checkbox isSelected={item.done} isDisabled={item.done} onChange={() => onComplete(item)} className="mt-0.5">
        <span className="sr-only">{item.kind === 'review' ? item.title : `Mark done: ${item.title}`}</span>
      </Checkbox>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.href ? (
            <TitleLink href={item.href} className={`text-sm font-medium ${muted ? 'text-text-muted' : ''}`}>
              {item.title}
            </TitleLink>
          ) : (
            <span className={`text-sm font-medium ${muted ? 'text-text-muted' : ''}`}>{item.title}</span>
          )}
          {item.done && <Badge>Done</Badge>}
          {item.overdue && <Badge tone="danger">Overdue, was {formatDay(item.date)}</Badge>}
          {item.leetcode && <DifficultyBadge difficulty={item.leetcode.difficulty} />}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          {[item.planTitle, item.typeLabel, minutesText(item.minutes)].filter(Boolean).join(' · ')}
        </p>
      </div>
      {item.leetcode && !item.done && (
        <div className="shrink-0 pt-0.5">
          <LeetCodeLink slug={item.leetcode.slug} title={item.title} />
        </div>
      )}
    </li>
  )
}

function Group({ id, heading, sub, tone, items, onComplete }: { id: string; heading: string; sub?: string; tone?: 'danger'; items: TodoItem[]; onComplete: (i: Completable) => void }) {
  return (
    <section aria-labelledby={id} className="grid gap-1">
      <div className="flex items-baseline gap-3">
        <h2 id={id} className={`text-base font-medium ${tone === 'danger' ? 'text-danger' : ''}`}>
          {heading}
        </h2>
        {sub && <span className="text-sm text-text-muted">{sub}</span>}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised px-4 shadow-sm">
        {items.map((i) => (
          <Row key={i.key} item={i} onComplete={onComplete} />
        ))}
      </ul>
    </section>
  )
}

function RangePanel({ range, items, today, onComplete }: { range: (typeof TODO_RANGES)[number]; items: TodoItem[]; today: string; onComplete: (i: Completable) => void }) {
  const view = todoView(items, range.id, today)
  if (view.overdue.length === 0 && view.days.length === 0) {
    return (
      <EmptyState title={range.empty}>
        {range.id.startsWith('past')
          ? 'Tasks that were due in this window, finished or not, are listed here.'
          : 'Tasks from your plans show up here on the day they are due. Overdue tasks stay at the top until you finish them.'}
      </EmptyState>
    )
  }
  return (
    <div className="grid gap-8">
      {view.overdue.length > 0 && (
        <Group id="overdue" heading={`Overdue (${view.overdue.length})`} tone="danger" items={view.overdue} onComplete={onComplete} />
      )}
      {view.days.map((d) => (
        <Group key={d.date} id={`day-${d.date}`} heading={d.label} sub={d.label === d.dateText ? undefined : d.dateText} items={d.items} onComplete={onComplete} />
      ))}
    </div>
  )
}

export default function TodoPage() {
  const today = useToday()
  const data = useTodoItems(today)
  const { complete, sheet } = useCompleter()
  const [range, setRange] = useState<TodoRange>('today')

  return (
    <Page title="To Do">
      {!data ? (
        <div aria-hidden="true" className="grid gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !data.hasPlans ? (
        <EmptyState title="No plans yet" action={<Link href="/import" variant="primary">Import a plan</Link>}>
          Import a study plan and its tasks show up here on the day they are due.
        </EmptyState>
      ) : (
        <Tabs selectedKey={range} onSelectionChange={(k) => setRange(k as TodoRange)}>
          <TabList aria-label="Range">
            {TODO_RANGES.map((r) => (
              <Tab key={r.id} id={r.id}>
                {r.label}
              </Tab>
            ))}
          </TabList>
          {TODO_RANGES.map((r) => (
            <TabPanel key={r.id} id={r.id}>
              <RangePanel range={r} items={data.items} today={today} onComplete={complete} />
            </TabPanel>
          ))}
        </Tabs>
      )}
      {sheet}
    </Page>
  )
}
