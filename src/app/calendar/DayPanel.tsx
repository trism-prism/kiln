// The day panel: everything on one day, with links to the task pages and a "Move to..." date field
// on each open item (the keyboard and touch way to reschedule; dragging is the mouse way).
import { useState, type FormEvent } from 'react'
import { Badge } from '../../ui/surface'
import { Button } from '../../ui/button'
import { Sheet } from '../../ui/overlay'
import { formatDay } from '../../lib/date'
import type { TodoItem } from '../../domain/todo'
import { DifficultyBadge, LeetCodeLink, TitleLink, minutesText } from '../parts'
import type { DragPayload } from './CalendarView'

function MoveField({ item, date, today, onMove, onDone }: { item: TodoItem; date: string; today: string; onMove: (p: DragPayload, to: string) => void; onDone: () => void }) {
  const [to, setTo] = useState(date < today ? today : date)
  const valid = to >= today && to !== date
  const hint = `move-hint-${item.key}`
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onMove({ kind: item.kind as 'task' | 'practice', id: item.id, title: item.title, from: date }, to)
    onDone()
    // The row leaves the list, so its focus would fall to the page: keep it in the panel.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="dialog"]')?.focus())
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="date"
        aria-label={`Move ${item.title} to`}
        min={today}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : hint}
        className="h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text"
      />
      <Button type="submit" variant="secondary" isDisabled={!valid}>
        Move
      </Button>
      <Button variant="quiet" onPress={onDone}>
        Cancel
      </Button>
      {!valid && (
        <p id={hint} className="basis-full text-xs text-text-muted">
          Pick a day from today on, other than this one.
        </p>
      )}
    </form>
  )
}

function Row({ item, date, today, onMove }: { item: TodoItem; date: string; today: string; onMove: (p: DragPayload, to: string) => void }) {
  const [moving, setMoving] = useState(false)
  const movable = !item.done && item.kind !== 'review'
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.href ? (
              <TitleLink href={item.href} className={`text-sm font-medium ${item.done ? 'text-text-muted' : ''}`}>
                {item.title}
              </TitleLink>
            ) : (
              <span className={`text-sm font-medium ${item.done ? 'text-text-muted' : ''}`}>{item.title}</span>
            )}
            {item.done && <Badge>Done</Badge>}
            {item.overdue && <Badge tone="danger">Overdue</Badge>}
            {item.leetcode && <DifficultyBadge difficulty={item.leetcode.difficulty} />}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{[item.planTitle, item.typeLabel, minutesText(item.minutes)].filter(Boolean).join(' · ')}</p>
        </div>
        {item.leetcode && !item.done && <LeetCodeLink slug={item.leetcode.slug} title={item.title} />}
      </div>
      {movable &&
        (moving ? (
          <MoveField item={item} date={date} today={today} onMove={onMove} onDone={() => setMoving(false)} />
        ) : (
          <Button variant="quiet" className="-ml-3 mt-1 h-8" aria-label={`Move to… ${item.title}`} onPress={() => setMoving(true)}>
            Move to…
          </Button>
        ))}
    </li>
  )
}

export function DayPanel({
  date,
  items,
  today,
  budget,
  blackout,
  onClose,
  onMove,
}: {
  date: string | null
  items: TodoItem[]
  today: string
  budget: number
  blackout: boolean
  onClose: () => void
  onMove: (p: DragPayload, to: string) => void
}) {
  const used = items.reduce((n, i) => n + i.minutes, 0)
  return (
    <Sheet title={date ? formatDay(date, true) : ''} isOpen={date !== null} onOpenChange={(o) => !o && onClose()}>
      {date && (
        <div className="grid gap-1">
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <span className={used > budget ? 'font-medium text-warning' : ''}>
              {minutesText(used)} planned of {minutesText(budget)}
            </span>
            {blackout && <Badge>Day off</Badge>}
            {date === today && <Badge tone="accent">Today</Badge>}
          </p>
          {items.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">Nothing planned for this day.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <Row key={i.key} item={i} date={date} today={today} onMove={onMove} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}
