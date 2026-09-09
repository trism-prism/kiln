// Month and week calendar: toolbar, a keyboard-navigable day grid, and drag and drop of open tasks
// and daily problems between days. Draws what it is given; the page owns the data and the writes.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleAlert, Repeat } from 'lucide-react'
import { isTextDropItem, useDrag, useDrop } from 'react-aria-components'
import {
  monthGrid,
  navigateDate,
  periodLabel,
  sameMonth,
  shiftMonth,
  weekDates,
  weekdayNames,
  type CalendarView as View,
  type WeekStart,
} from '../../domain/calendar'
import type { TodoItem } from '../../domain/todo'
import { addDaysISO, formatDay, weekdayIndex } from '../../lib/date'
import { Button, IconButton } from '../../ui/button'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'

/** What a drag carries. */
export interface DragPayload {
  kind: 'task' | 'practice'
  id: string
  title: string
  from: string
}

const DRAG_TYPE = 'application/x-kiln-item'
const VISIBLE_CHIPS = { month: 3, week: 8 }

interface Chip {
  key: string
  label: string
  /** Items this chip stands for. */
  count: number
  item?: TodoItem
}

function chipsOf(items: TodoItem[]): Chip[] {
  const chips: Chip[] = items.filter((i) => i.kind !== 'review').map((item) => ({ key: item.key, label: item.title, count: 1, item }))
  const reviews = items.filter((i) => i.kind === 'review').length
  if (reviews) chips.push({ key: 'reviews', label: `${reviews} review${reviews === 1 ? '' : 's'}`, count: reviews })
  return chips
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ItemChip({ chip, date }: { chip: Chip; date: string }) {
  const item = chip.item
  const movable = !!item && !item.done && (item.kind === 'task' || item.kind === 'practice')
  const { dragProps, isDragging } = useDrag({
    isDisabled: !movable,
    getItems: () => [{ [DRAG_TYPE]: JSON.stringify({ kind: item!.kind as DragPayload['kind'], id: item!.id, title: item!.title, from: date } satisfies DragPayload) }],
  })
  const tone = item?.done ? 'text-text-muted line-through' : item?.overdue ? 'font-medium text-danger' : 'text-text'
  return (
    <div
      {...(movable ? dragProps : {})}
      data-chip={item ? `${item.kind}:${item.id}` : 'reviews'}
      data-dragging={isDragging || undefined}
      className={`relative flex items-center gap-1 truncate rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs ${tone} ${movable ? 'cursor-grab active:cursor-grabbing' : ''} data-dragging:opacity-50`}
    >
      {item?.done && <Check size={12} aria-hidden="true" className="shrink-0" />}
      {item?.overdue && <CircleAlert size={12} aria-hidden="true" className="shrink-0" />}
      {!item && <Repeat size={12} aria-hidden="true" className="shrink-0" />}
      <span className="truncate">{chip.label}</span>
    </div>
  )
}

export interface DayCellProps {
  date: string
  view: View
  items: TodoItem[]
  today: string
  inPeriod: boolean
  focused: boolean
  budget: number
  blackout: boolean
  onFocusDate: (date: string) => void
  onOpenDay: (date: string) => void
  onMove: (payload: DragPayload, date: string) => void
}

function DayCell({ date, view, items, today, inPeriod, focused, budget, blackout, onFocusDate, onOpenDay, onMove }: DayCellProps) {
  const ref = useRef<HTMLDivElement>(null)
  const past = date < today
  const { dropProps, isDropTarget } = useDrop({
    ref,
    getDropOperation: (types) => (!past && types.has(DRAG_TYPE) ? 'move' : 'cancel'),
    onDrop: async (e) => {
      for (const it of e.items) {
        if (isTextDropItem(it) && it.types.has(DRAG_TYPE)) {
          try {
            const payload = JSON.parse(await it.getText(DRAG_TYPE)) as DragPayload
            if (payload.from !== date) onMove(payload, date)
          } catch {
            // not one of ours
          }
          return
        }
      }
    },
  })

  const chips = chipsOf(items)
  const limit = VISIBLE_CHIPS[view]
  const shown = chips.slice(0, limit)
  const hidden = chips.slice(limit).reduce((n, c) => n + c.count, 0)
  const used = items.reduce((n, i) => n + i.minutes, 0)
  const over = used > budget
  const overdue = items.filter((i) => i.overdue).length
  const isToday = date === today
  const day = Number(date.slice(8))
  const label = [
    formatDay(date, true),
    isToday ? 'today' : '',
    blackout ? 'day off' : '',
    items.length ? plural(items.length, 'item') : 'nothing planned',
    overdue ? `${overdue} overdue` : '',
    used || budget ? `${used} of ${budget} minutes${over ? ', over budget' : ''}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      {...dropProps}
      ref={ref}
      role="gridcell"
      data-date={date}
      data-drop-target={isDropTarget || undefined}
      onClick={() => onOpenDay(date)}
      className={`relative flex min-h-16 flex-col gap-1 p-1.5 md:min-h-32 md:p-2 ${view === 'week' ? 'min-h-24 md:min-h-56' : ''} ${
        inPeriod ? 'bg-surface-raised' : 'bg-surface'
      } ${blackout ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--kiln-border)_6px_7px)]' : ''} data-drop-target:outline-2 data-drop-target:-outline-offset-2 data-drop-target:outline-accent`}
    >
      <button
        type="button"
        data-day={date}
        tabIndex={focused ? 0 : -1}
        aria-label={label}
        onFocus={() => onFocusDate(date)}
        className="absolute inset-0 cursor-default focus-visible:outline-offset-[-3px]"
      />
      <div aria-hidden="true" className="pointer-events-none relative flex items-center justify-between gap-1 text-xs">
        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-medium tabular-nums ${isToday ? 'bg-accent text-accent-contrast' : inPeriod ? 'text-text' : 'text-text-muted'}`}>
          {view === 'week' ? `${formatDay(date).split(',')[0]} ${day}` : date.endsWith('-01') ? formatDay(date).replace(/^[A-Za-z]+, /, '') : day}
        </span>
        {blackout && <span className="text-text-muted">Off</span>}
        {overdue > 0 && <span className="hidden font-medium text-danger md:inline">{overdue} overdue</span>}
        {/* Phones: too narrow for titles, so a count */}
        {items.length > 0 && view === 'month' && <span className="rounded-full bg-surface-muted px-1.5 tabular-nums text-text md:hidden">{items.length}</span>}
      </div>
      <div className={`relative flex-col gap-1 ${view === 'month' ? 'hidden md:flex' : 'flex'}`} aria-hidden="true">
        {shown.map((c) => (
          <ItemChip key={c.key} chip={c} date={date} />
        ))}
        {hidden > 0 && <span className="pointer-events-none px-1.5 text-xs text-text-muted">+{hidden} more</span>}
      </div>
      <div aria-hidden="true" className="pointer-events-none relative mt-auto grid gap-0.5">
        {view === 'week' && (used > 0 || budget > 0) && (
          <span className={`text-xs tabular-nums ${over ? 'font-medium text-warning' : 'text-text-muted'}`}>
            {used}/{budget} min
          </span>
        )}
        {(used > 0 || over) && (
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <div className={`h-full rounded-full ${over ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${over ? 100 : Math.round((used / budget) * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

export interface CalendarViewProps {
  items: readonly TodoItem[]
  today: string
  view: View
  onViewChange: (view: View) => void
  weekStartsOn: WeekStart
  /** Study minutes per weekday, Monday first. */
  minutesPerWeekday: readonly number[]
  blackoutDates: readonly string[]
  onOpenDay: (date: string) => void
  onMove: (payload: DragPayload, date: string) => void
}

export function CalendarView({ items, today, view, onViewChange, weekStartsOn, minutesPerWeekday, blackoutDates, onOpenDay, onMove }: CalendarViewProps) {
  // `anchor` picks the month or week on show; `focus` is the one day in the tab order. The focus is always on show.
  const [anchor, setAnchor] = useState(today)
  const [focus, setFocus] = useState(today)
  const grid = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  const weeks = useMemo(() => (view === 'month' ? monthGrid(anchor, weekStartsOn) : [weekDates(anchor, weekStartsOn)]), [view, anchor, weekStartsOn])
  const byDate = useMemo(() => {
    const m = new Map<string, TodoItem[]>()
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return m
  }, [items])
  const blackout = useMemo(() => new Set(blackoutDates), [blackoutDates])

  // After a key moves the focus, put the browser focus on the new day once it has rendered.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus()
  }, [focus])

  const focusDay = (date: string) => grid.current?.querySelector<HTMLElement>(`[data-day="${date}"]`)?.focus()
  const goTo = (date: string) => {
    if (date === focus) return focusDay(date) // no state change, so no effect would run
    refocus.current = true
    setFocus(date)
    if (!weeks.flat().includes(date)) setAnchor(date)
  }
  // Previous and next keep the day you are on (same weekday in the week view, same day number in the month view).
  const step = (n: number) => {
    const next = view === 'month' ? shiftMonth(focus, n) : addDaysISO(focus, 7 * n)
    refocus.current = false
    setAnchor(next)
    setFocus(next)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const date = (e.target as HTMLElement).dataset.day
    if (!date || e.ctrlKey || e.metaKey || e.altKey) return
    const next = navigateDate(e.key, date, view, weekStartsOn)
    if (!next) return
    e.preventDefault()
    goTo(next)
  }

  const names = weekdayNames(weekStartsOn)
  const label = periodLabel(anchor, view, weekStartsOn)
  const gridEl = (
    <div ref={grid} role="grid" aria-label={label} onKeyDown={onKeyDown} className="overflow-hidden rounded-lg border border-border shadow-sm">
      <div role="row" className={`grid-cols-7 border-b border-border bg-surface-muted ${view === 'week' ? 'hidden md:grid' : 'grid'}`}>
        {names.map((n) => (
          <div key={n} role="columnheader" className="px-2 py-1.5 text-xs font-medium text-text-muted">
            {n}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className={`grid gap-px bg-border ${view === 'week' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-7'} [&:not(:first-of-type)]:mt-px`}>
          {week.map((date) => (
            <DayCell
              key={date}
              date={date}
              view={view}
              items={byDate.get(date) ?? []}
              today={today}
              inPeriod={view === 'week' || sameMonth(date, anchor)}
              focused={date === focus}
              budget={minutesPerWeekday[weekdayIndex(date)] ?? 0}
              blackout={blackout.has(date)}
              onFocusDate={setFocus}
              onOpenDay={onOpenDay}
              onMove={onMove}
            />
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <Tabs
      className="grid-cols-[minmax(0,1fr)]"
      selectedKey={view}
      onSelectionChange={(k) => {
        setAnchor(focus)
        onViewChange(k as View)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton variant="secondary" aria-label={`Previous ${view}`} onPress={() => step(-1)}>
            <ChevronLeft />
          </IconButton>
          <Button
            variant="secondary"
            onPress={() => {
              refocus.current = false
              setAnchor(today)
              setFocus(today)
            }}
          >
            Today
          </Button>
          <IconButton variant="secondary" aria-label={`Next ${view}`} onPress={() => step(1)}>
            <ChevronRight />
          </IconButton>
          <h2 aria-live="polite" className="ml-1 text-lg font-medium">
            {label}
          </h2>
        </div>
        <TabList aria-label="Calendar view">
          <Tab id="month">Month</Tab>
          <Tab id="week">Week</Tab>
        </TabList>
      </div>
      <TabPanel id="month">{gridEl}</TabPanel>
      <TabPanel id="week">{gridEl}</TabPanel>
    </Tabs>
  )
}
