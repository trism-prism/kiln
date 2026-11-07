// The streak in the top bar of the tab pages: a flame and the current streak. Outline and muted until
// today counts, then filled in the accent. Opens Streak & progress.
import { useEffect, useRef } from 'react'
import { Link } from 'react-aria-components'
import { Flame } from 'lucide-react'
import { useStudy, useToday } from '../queries'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

export function StreakChip() {
  const today = useToday()
  const study = useStudy(today)
  const icon = useRef<SVGSVGElement>(null)
  const counted = study ? study.days.has(today) : undefined
  const was = useRef(counted)

  // Only a flip to counted while the page is open animates; the first load and a reduced-motion setting swap instantly.
  useEffect(() => {
    const before = was.current
    was.current = counted
    if (before !== false || counted !== true) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    icon.current?.animate?.(
      [
        { transform: 'scale(0.85)', fillOpacity: 0 },
        { transform: 'scale(1)', fillOpacity: 1 },
      ],
      { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [counted])

  if (!study) return null
  const n = study.stats.current
  return (
    <Link
      href="/progress"
      aria-label={`Streak: ${days(n)}, ${counted ? 'done today' : 'not done today'}`}
      data-counted={counted || undefined}
      className="inline-flex h-9 shrink-0 cursor-default items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-text tabular-nums no-underline transition-colors data-hovered:bg-surface-muted"
    >
      <Flame ref={icon} aria-hidden="true" className={counted ? 'text-accent' : 'text-text-muted'} fill={counted ? 'currentColor' : 'none'} />
      <span className={counted ? 'text-text' : 'text-text-muted'}>{n}</span>
    </Link>
  )
}
