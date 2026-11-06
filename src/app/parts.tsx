// Small pieces several screens share.
import { ExternalLink } from 'lucide-react'
import { Link as AriaLink, type LinkProps } from 'react-aria-components'
import { leetcodeUrl } from '../data'
import { Link } from '../ui/button'
import { Badge } from '../ui/surface'

const TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const

/** "LeetCode Easy" tag. */
export function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  return <Badge tone={TONE[difficulty]}>LeetCode {difficulty[0]!.toUpperCase() + difficulty.slice(1)}</Badge>
}

/** Opens the problem on LeetCode in a new tab. */
export function LeetCodeLink({ slug, title }: { slug: string; title: string }) {
  return (
    <Link href={leetcodeUrl(slug)} target="_blank" rel="noopener noreferrer" aria-label={`Solve in Python: ${title} (opens LeetCode in a new tab)`} className="inline-flex items-center gap-1 text-sm">
      Solve in Python
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
