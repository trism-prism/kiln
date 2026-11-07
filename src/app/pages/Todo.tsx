import { useMemo, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { filterTodoItems, rangeBounds, todoView, type TodoItem } from '../../domain/todo'
import { Button, Link } from '../../ui/button'
import { Checkbox } from '../../ui/form'
import { Badge, EmptyState, Skeleton } from '../../ui/surface'
import { Page } from '../Page'
import { DifficultyBadge, LeetCodeLink, TitleLink, itemMeta } from '../parts'
import { useToday, useTodoItems, useTodoPrefs } from '../queries'
import { useCompleter, type Completable } from '../rating'
import { safely, setTodoDone } from '../actions'
import { PersonalActions } from '../todo/PersonalActions'
import { Preferences } from '../todo/Preferences'
import { TodoEditor } from '../todo/TodoEditor'
import { formatDay } from '../../lib/date'

function Row({ item, onComplete, pending }: { item: TodoItem; onComplete: (i: Completable) => void; pending: boolean }) {
  const muted = item.done
  const personal = item.kind === 'personal'
  return (
    <li className="flex items-start gap-3 py-3">
      {item.kind === 'event' ? (
        <span aria-hidden="true" className="size-5 shrink-0" />
      ) : personal ? (
        <Checkbox isSelected={item.done} onChange={(v) => void setTodoDone(item.id, v)} className="mt-0.5">
          <span className="sr-only">{`Mark done: ${item.title}`}</span>
        </Checkbox>
      ) : (
        <Checkbox isSelected={item.done} isDisabled={item.done || pending} onChange={() => onComplete(item as Completable)} className="mt-0.5">
          <span className="sr-only">{item.kind === 'review' ? `Rate the review of ${item.title.replace('Review: ', '')}` : `Mark done: ${item.title}`}</span>
        </Checkbox>
      )}
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
        <p className="mt-0.5 text-xs text-text-muted">{itemMeta(item)}</p>
      </div>
      {item.leetcode && !item.done && (
        <div className="shrink-0 pt-0.5">
          <LeetCodeLink slug={item.leetcode.slug} title={item.title} language={item.leetcode.language} />
        </div>
      )}
      {personal && <PersonalActions item={item} />}
    </li>
  )
}

function Group({ id, heading, sub, tone, items, onComplete, pending }: { id: string; heading: string; sub?: string; tone?: 'danger'; items: TodoItem[]; onComplete: (i: Completable) => void; pending: (id: string) => boolean }) {
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
          <Row key={i.key} item={i} onComplete={onComplete} pending={pending(i.id)} />
        ))}
      </ul>
    </section>
  )
}

export default function TodoPage() {
  const today = useToday()
  const data = useTodoItems(today)
  const [prefs, savePrefs] = useTodoPrefs()
  const { complete, pending, sheet } = useCompleter()
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const view = useMemo(() => {
    if (!data || !prefs) return undefined
    const items = filterTodoItems(data.items, prefs, new Set(data.favorites))
    return todoView(items, rangeBounds(prefs, today, data.weekStartsOn), today)
  }, [data, prefs, today])

  return (
    <Page title="To Do">
      {!data || !prefs || !view ? (
        <div aria-hidden="true" className="grid gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={() => setPrefsOpen(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              To-do list preferences
            </Button>
            <Button variant="secondary" onPress={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" />
              Add to-do
            </Button>
          </div>
          {view.overdue.length === 0 && view.days.length === 0 ? (
            !data.hasPlans && data.items.length === 0 ? (
              <EmptyState title="No plans yet" action={<Link href="/import" variant="primary">Import a plan</Link>}>
                Import a study plan and its tasks show up here on the day they are due. You can also add your own to-dos.
              </EmptyState>
            ) : (
              <EmptyState title="Nothing to show">Nothing falls in the days you chose. Change the days or the visible items in the preferences.</EmptyState>
            )
          ) : (
            <div className="grid gap-8">
              {view.overdue.length > 0 && (
                <Group id="overdue" heading={`Overdue (${view.overdue.length})`} tone="danger" items={view.overdue} onComplete={complete} pending={pending} />
              )}
              {view.days.map((d) => (
                <Group key={d.date} id={`day-${d.date}`} heading={d.label} sub={d.label === d.dateText ? undefined : d.dateText} items={d.items} onComplete={complete} pending={pending} />
              ))}
            </div>
          )}
          <Preferences prefs={prefs} onChange={(p) => void safely(() => savePrefs(p))} isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
          <TodoEditor isOpen={adding} onClose={() => setAdding(false)} />
        </div>
      )}
      {sheet}
    </Page>
  )
}
