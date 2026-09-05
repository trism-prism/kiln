// Streak numbers, the one-year heatmap and the small streak chip for the dashboard.
import { useEffect, useMemo, useRef } from 'react'
import { Flame } from 'lucide-react'
import type { WeekStart } from '../../domain/calendar'
import { heatmapColumns, monthLabels, rowLabels, type DayStudy, type HeatLevel, type StreakStats } from '../../domain/streaks'
import { formatDay, weekdayIndex } from '../../lib/date'
import { Link } from '../../ui/button'
import { Card } from '../../ui/surface'
import { minutesText } from '../parts'
import type { StudySummary } from '../queries'

// One hue in four steps of lightness (accent mixed into the muted surface): readable without telling colors apart.
const LEVEL_PERCENT: Record<HeatLevel, number> = { 0: 0, 1: 30, 2: 55, 3: 78, 4: 100 }
const levelColor = (l: HeatLevel) => (l === 0 ? 'var(--kiln-surface-muted)' : `color-mix(in oklab, var(--kiln-accent) ${LEVEL_PERCENT[l]}%, var(--kiln-surface-muted))`)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-2xl font-medium tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-text-muted">{sub}</dd>}
    </div>
  )
}

interface HeatmapSettings {
  weekStartsOn: WeekStart
  minutesPerWeekday: readonly number[]
  blackoutDates: readonly string[]
}

/** "45 min studied, 3 tasks done on Tue, Nov 12" */
const cellLabel = (date: string, count: number, minutes: number) =>
  count === 0 ? `Nothing done on ${formatDay(date)}` : `${minutesText(minutes)} studied, ${plural(count, 'task')} done on ${formatDay(date)}`

export function Heatmap({ days, today, settings }: { days: ReadonlyMap<string, DayStudy>; today: string; settings: HeatmapSettings }) {
  const { weekStartsOn, minutesPerWeekday, blackoutDates } = settings
  const cols = useMemo(
    () => {
      const blackout = new Set(blackoutDates)
      return heatmapColumns(days, today, { weekStartsOn, budget: (d) => (blackout.has(d) ? 0 : (minutesPerWeekday[weekdayIndex(d)] ?? 0)) })
    },
    [days, today, weekStartsOn, minutesPerWeekday, blackoutDates],
  )
  const months = monthLabels(cols)
  const scroller = useRef<HTMLDivElement>(null)
  // Show the latest week first: on a phone the 53 weeks are wider than the screen. Once, so later data changes keep where you scrolled.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <h3 className="text-sm font-medium">{plural(cols.flat().reduce((n, c) => n + c.count, 0), 'task')} in the last year</h3>
      <div className="flex gap-2">
        <div aria-hidden="true" className="mt-5 grid shrink-0 grid-rows-[repeat(7,12px)] gap-[3px] text-xs leading-3 text-text-muted">
          {rowLabels(weekStartsOn).map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
        <div ref={scroller} role="group" aria-label="Study activity, last year" tabIndex={0} className="min-w-0 overflow-x-auto rounded-sm pb-1">
          <div className="grid w-max grid-cols-[repeat(53,12px)] gap-[3px] pb-1 text-xs leading-4 text-text-muted" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i} className="overflow-visible whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="grid w-max grid-flow-col grid-rows-[repeat(7,12px)] auto-cols-[12px] gap-[3px]">
            {cols.flat().map((cell) => {
              if (cell.future) return <span key={cell.date} aria-hidden="true" />
              const text = cellLabel(cell.date, cell.count, cell.minutes)
              return (
                <span
                  key={cell.date}
                  role="img"
                  aria-label={text}
                  title={text}
                  data-date={cell.date}
                  data-level={cell.level}
                  style={{ backgroundColor: levelColor(cell.level) }}
                  className="rounded-[3px] outline outline-1 -outline-offset-1 outline-border"
                />
              )
            })}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="flex items-center gap-1 text-xs text-text-muted">
        Less
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className="size-3 rounded-[3px] outline outline-1 -outline-offset-1 outline-border" style={{ backgroundColor: levelColor(l) }} />
        ))}
        More
      </div>
    </div>
  )
}

function StreakNumbers({ stats }: { stats: StreakStats }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="Current streak" value={plural(stats.current, 'day')} />
      <Stat label="Longest streak" value={plural(stats.longest, 'day')} />
      <Stat label="Study days" value={String(stats.studyDays)} />
      <Stat label="Completed" value={String(stats.completions)} sub={minutesText(stats.minutes)} />
    </dl>
  )
}

/** The Streak section of the calendar page. */
export function StreakSection({ study, today, settings }: { study: StudySummary; today: string; settings: HeatmapSettings }) {
  return (
    <section aria-labelledby="streak" className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h2 id="streak" className="text-lg font-medium">
        Streak
      </h2>
      <Card className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <StreakNumbers stats={study.stats} />
        <Heatmap days={study.days} today={today} settings={settings} />
        <p className="text-xs text-text-muted">A day counts when you finish a task, a daily problem or a review. Days off and days with no study time set do not break a streak.</p>
      </Card>
    </section>
  )
}

/** Small streak count that links to the calendar. */
export function StreakChip({ stats }: { stats: StreakStats }) {
  return (
    <Link href="/calendar" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-sm text-text no-underline data-hovered:underline">
      <Flame aria-hidden="true" size={16} className="text-accent" />
      {stats.current > 0 ? `${plural(stats.current, 'day')} streak` : 'No streak yet'}
    </Link>
  )
}
