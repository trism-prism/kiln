import { useState } from 'react'
import { moveWarnings, type CalendarView as View } from '../../domain/calendar'
import { weekdayIndex } from '../../lib/date'
import { Link } from '../../ui/button'
import { EmptyState, Skeleton } from '../../ui/surface'
import { moveItem } from '../actions'
import { CalendarView, type DragPayload } from '../calendar/CalendarView'
import { DayPanel } from '../calendar/DayPanel'
import { Page } from '../Page'
import { useCalendarData, useToday } from '../queries'

const VIEW_KEY = 'kiln.calendarView'

/** The last chosen view, kept on this device. */
function useStoredView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month'
    } catch {
      return 'month'
    }
  })
  return [
    view,
    (v) => {
      setView(v)
      try {
        localStorage.setItem(VIEW_KEY, v)
      } catch {
        // storage blocked: the choice lasts until the page closes
      }
    },
  ]
}

export default function CalendarPage() {
  const today = useToday()
  const data = useCalendarData(today)
  const [view, setView] = useStoredView()
  const [open, setOpen] = useState<string | null>(null)

  if (!data) {
    return (
      <Page title="Calendar">
        <div aria-hidden="true" className="grid gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Page>
    )
  }
  if (!data.hasPlans && data.items.length === 0) {
    return (
      <Page title="Calendar">
        <EmptyState title="Your calendar is empty" action={<Link href="/import" variant="primary">Import a plan</Link>}>
          Once a plan is imported, each day shows its tasks. Drag a task to another day to reschedule it.
        </EmptyState>
      </Page>
    )
  }

  const { settings } = data
  const move = (p: DragPayload, date: string) => {
    const task = p.kind === 'task' ? data.tasks.find((t) => t.id === p.id) : undefined
    void moveItem(p, date, task ? moveWarnings(task, date, data.tasks) : [])
  }

  return (
    <Page title="Calendar">
      <CalendarView
        items={data.items}
        today={today}
        view={view}
        onViewChange={setView}
        weekStartsOn={settings.weekStartsOn}
        minutesPerWeekday={settings.minutesPerWeekday}
        blackoutDates={settings.blackoutDates}
        onOpenDay={setOpen}
        onMove={move}
      />
      <DayPanel
        date={open}
        items={open ? data.items.filter((i) => i.date === open) : []}
        today={today}
        budget={open ? (settings.minutesPerWeekday[weekdayIndex(open)] ?? 0) : 0}
        blackout={open ? settings.blackoutDates.includes(open) : false}
        onClose={() => setOpen(null)}
        onMove={move}
      />
    </Page>
  )
}
