// Small pieces several screens share.
import { ExternalLink } from 'lucide-react'
import { Link as AriaLink, type LinkProps } from 'react-aria-components'
import { leetcodeUrl } from '../data'
import { DEFAULT_PRACTICE_LANGUAGE } from '../domain/plan-format'
import { Link } from '../ui/button'
import type { TodoItem } from '../domain/todo'
import { Badge, ProgressBar } from '../ui/surface'
import type { StudyWeek } from './queries'

const TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const

/** "LeetCode Easy" tag. */
export function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  return <Badge tone={TONE[difficulty]}>LeetCode {difficulty[0]!.toUpperCase() + difficulty.slice(1)}</Badge>
}

/** Opens the problem on LeetCode in a new tab. */
export function LeetCodeLink({ slug, title, language = DEFAULT_PRACTICE_LANGUAGE }: { slug: string; title: string; language?: string }) {
  return (
    <Link href={leetcodeUrl(slug)} target="_blank" rel="noopener noreferrer" aria-label={`Solve in ${language}: ${title} (opens LeetCode in a new tab)`} className="inline-flex items-center gap-1 text-sm">
      Solve in {language}
      <ExternalLink size={14} aria-hidden="true" />
    </Link>
  )
}

/** A link to another page of the app that looks like the surrounding text, underlined on hover. */
export function TitleLink({ className = '', ...props }: Omit<LinkProps, 'className'> & { className?: string }) {
  return <AriaLink {...props} className={`rounded-sm outline-none data-hovered:underline data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus ${className}`} />
}

export const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

/** "Plan · Lesson · 30 min" under an item's title. Events and to-dos without minutes show no duration. A study
 * session's title already names its plan ("Study Psychology"), so its line is "Study time · 45 min". */
export const itemMeta = (item: TodoItem) =>
  [item.kind === 'study' ? '' : item.planTitle, item.typeLabel, item.minutes > 0 || (item.kind !== 'event' && item.kind !== 'personal') ? minutesText(item.minutes) : ''].filter(Boolean).join(' · ')

/** "1 h 15 min of 3 h": a study time plan's week (done of planned), on the plan page and the plan cards. */
export function StudyWeekBar({ week }: { week: StudyWeek }) {
  const { weekDone, weekPlanned } = week
  return (
    <ProgressBar
      label="This week"
      value={weekPlanned ? Math.min(100, Math.round((weekDone / weekPlanned) * 100)) : 0}
      valueLabel={weekPlanned ? `${minutesText(weekDone)} of ${minutesText(weekPlanned)}` : 'Nothing planned this week'}
    />
  )
}

/** "Planned: 2 h 50 min of 3 h" when an ordinary week can't hold a study plan's whole weekly time; nothing otherwise. */
export function StudyPlanned({ week, minutesPerWeek }: { week: StudyWeek; minutesPerWeek: number }) {
  if (week.perWeek === undefined || week.perWeek >= minutesPerWeek) return null
  return <p className="text-sm text-warning">{`Planned: ${minutesText(week.perWeek)} of ${minutesText(minutesPerWeek)}`}</p>
}
