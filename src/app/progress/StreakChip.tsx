// The streak in the top bar of the tab pages: a flame and the current streak. Outline and muted until
// today counts, then filled in the accent. Opens Streak & progress.
import { useEffect, useRef } from 'react'
import { Flame } from 'lucide-react'
import { Link } from '../../ui/button'
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
      variant="quiet"
      // A hairline pill, 44px tall on phones. Done today: filled flame, accent-tinted outline, heavier number.
      // The ! is needed: the button base's h-10, px-4, gap-2 and rounded-md otherwise win the cascade.
      className={`h-11! gap-1.5! rounded-full! border px-3! tabular-nums md:h-9! md:px-2.5! ${counted ? 'border-[color-mix(in_oklab,var(--kiln-accent)_55%,var(--kiln-border))] font-semibold!' : 'border-border'}`}
    >
      <Flame ref={icon} aria-hidden="true" className={counted ? 'text-accent' : 'text-text-muted'} fill={counted ? 'currentColor' : 'none'} strokeWidth={counted ? 2.25 : 1.75} />
      <span className={counted ? 'text-text' : 'text-text-muted'}>{n}</span>
    </Link>
  )
}
