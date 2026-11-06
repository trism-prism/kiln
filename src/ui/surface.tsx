import type { HTMLAttributes, ReactNode } from 'react'
import {
  Label,
  Meter as AriaMeter,
  ProgressBar as AriaProgressBar,
  type MeterProps as AriaMeterProps,
  type ProgressBarProps as AriaProgressBarProps,
} from 'react-aria-components'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-lg border border-border bg-surface-raised p-5 shadow-sm ${className}`} />
}

const tones = {
  neutral: 'bg-surface-muted text-text-muted',
  accent: 'bg-surface-muted text-accent',
  danger: 'bg-surface-muted text-danger',
  success: 'bg-surface-muted text-success',
  warning: 'bg-surface-muted text-warning',
}

/** A short status tag, like "Overdue" or "Done". Color carries meaning only; the word says it too. */
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-sm px-2 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export const formatCount = (count: number) => (count > 99 ? '99+' : String(count))

/** Accessible name for a nav item with a count: "To Do, 3 items due". Uses the real count, not the capped one. */
export function badgeLabel(name: string, count: number) {
  if (count <= 0) return name
  return `${name}, ${count} ${count === 1 ? 'item' : 'items'} due`
}

/**
 * Red count bubble, hidden from screen readers: put aria-label={badgeLabel(...)} on the element it
 * decorates, and keep a space between the label text and the badge so the visible text ("To Do 3")
 * stays part of that name (WCAG 2.5.3).
 * Renders nothing for zero.
 */
export function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-semibold text-danger-contrast tabular-nums ${className}`}
    >
      {formatCount(count)}
    </span>
  )
}

function Bar({ percentage, fill }: { percentage: number; fill: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${percentage}%` }} />
    </div>
  )
}

type BarProps = { label: string; className?: string }

/** Plan progress: how much of a plan is done. */
export function ProgressBar({ label, className = '', ...props }: Omit<AriaProgressBarProps, 'className'> & BarProps) {
  return (
    <AriaProgressBar {...props} className={`grid gap-2 ${className}`}>
      {({ percentage = 0, valueText }) => (
        <>
          <div className="flex justify-between gap-4 text-sm">
            <Label>{label}</Label>
            <span className="text-text-muted tabular-nums">{valueText}</span>
          </div>
          <Bar percentage={percentage} fill="bg-accent" />
        </>
      )}
    </AriaProgressBar>
  )
}

/** Mastery: how well a topic is known, a level rather than progress toward done. */
export function Meter({ label, className = '', ...props }: Omit<AriaMeterProps, 'className'> & BarProps) {
  return (
    <AriaMeter {...props} className={`grid gap-2 ${className}`}>
      {({ percentage, valueText }) => (
        <>
          <div className="flex justify-between gap-4 text-sm">
            <Label>{label}</Label>
            <span className="text-text-muted tabular-nums">{valueText}</span>
          </div>
          <Bar percentage={percentage} fill="bg-success" />
        </>
      )}
    </AriaMeter>
  )
}

/** Static placeholder block while data loads. No shimmer. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-surface-muted ${className}`} />
}

/** Kiln's mark: the arched mouth of a kiln. Also heads every empty state. */
export function KilnMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path fill="currentColor" fillRule="evenodd" d="M2 18V9a8 8 0 0 1 16 0v9zm5 0v-5a3 3 0 0 1 6 0v5z" />
    </svg>
  )
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <KilnMark className="size-8 text-border-strong" />
      <h2 className="mt-4 text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-text-muted">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
