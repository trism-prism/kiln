// Streak numbers, the 52-week heatmap and the small streak chip for the dashboard.
import { useEffect, useRef } from 'react'
import { Flame } from 'lucide-react'
import { heatmapColumns, type DayStudy, type HeatLevel, type StreakStats } from '../../domain/streaks'
import { formatDay } from '../../lib/date'
import { Link } from '../../ui/button'
import { Card } from '../../ui/surface'
import { minutesText } from '../parts'
import type { StudySummary } from '../queries'

// One hue in four steps of lightness (accent mixed into the muted surface): readable without telling colors apart.
const LEVEL_PERCENT: Record<HeatLevel, number> = { 0: 0, 1: 30, 2: 55, 3: 78, 4: 100 }
const levelColor = (l: HeatLevel) => (l === 0 ? 'var(--kiln-surface-muted)' : `color-mix(in oklab, var(--kiln-accent) ${LEVEL_PERCENT[l]}%, var(--kiln-surface-muted))`)

const monthName = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short' })

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

export function Heatmap({ days, today }: { days: ReadonlyMap<string, DayStudy>; today: string }) {
  const cols = heatmapColumns(days, today)
  const scroller = useRef<HTMLDivElement>(null)
  // Show the latest week first: on a phone the 52 weeks are wider than the screen.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days, today])
  return (
    <div>
      <div className="flex gap-2">
        <div aria-hidden="true" className="mt-5 grid shrink-0 grid-rows-[repeat(7,12px)] gap-[3px] text-xs leading-3 text-text-muted">
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
        <div ref={scroller} role="group" aria-label="Study activity, last 52 weeks" tabIndex={0} className="min-w-0 overflow-x-auto rounded-sm pb-1">
          <div className="grid w-max grid-cols-[repeat(52,12px)] gap-[3px] pb-1 text-xs leading-4 text-text-muted" aria-hidden="true">
            {cols.map((c, i) => (
              // A month is named over the week of its first Monday.
              <span key={i} className="overflow-visible whitespace-nowrap">
                {c[0]!.date.slice(8) <= '07' ? monthName(c[0]!.date) : ''}
              </span>
            ))}
          </div>
          <div className="grid w-max grid-flow-col grid-rows-[repeat(7,12px)] auto-cols-[12px] gap-[3px]">
            {cols.flat().map((cell) => {
              if (cell.future) return <span key={cell.date} aria-hidden="true" />
              const text = `${formatDay(cell.date, true)}: ${cell.count === 0 ? 'nothing completed' : `${cell.count} completed, ${minutesText(cell.minutes)}`}`
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
      <div aria-hidden="true" className="mt-3 flex items-center gap-1 text-xs text-text-muted">
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
export function StreakSection({ study, today }: { study: StudySummary; today: string }) {
  return (
    <section aria-labelledby="streak" className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h2 id="streak" className="text-lg font-medium">
        Streak
      </h2>
      <Card className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <StreakNumbers stats={study.stats} />
        <Heatmap days={study.days} today={today} />
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
