import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from '../ui/button'
import { StreakChip } from './progress/StreakChip'

/**
 * Every route renders one Page: it sets the document title and draws the top bar with the h1.
 * actions go on the right of the top bar (one primary action at most). The bar never wraps: a page
 * with more than two actions needs its own row for them on phones (see the plan page's actions).
 * The four tab pages also get the streak chip, left of their actions. `back` puts a Back button
 * before the h1, for pages outside the tabs (an installed app on iPhone has no browser back).
 *
 * After an in-app navigation, focus moves to the h1 so screen readers announce the new page and
 * keyboard users start from its top. The first load keeps the browser's default focus, so Tab
 * still reaches the skip link first.
 */
let initial: { ref: object; key: string } | null = null

const TAB_PATHS = new Set(['/', '/todo', '/calendar', '/plans'])

export function Page({ title, actions, back, children }: { title: string; actions?: ReactNode; back?: boolean; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { key, pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    // Skip only the very first page of the session. Identifying it by its ref object (not the history
    // key) means going back to the first entry still moves focus, and StrictMode's dev re-run doesn't.
    initial ??= { ref: heading, key }
    if (initial.ref === heading && initial.key === key) return
    heading.current?.focus({ preventScroll: true })
  }, [key])

  const tab = TAB_PATHS.has(pathname)
  return (
    <>
      <title>{`${title} · Kiln`}</title>
      <div className="sticky top-0 z-30 flex h-16 flex-nowrap items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            // React Router numbers this app's history entries (idx); at the first one there is no page of ours to go back to.
            <IconButton aria-label="Back" className="-ml-2" onPress={() => void (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}>
              <ChevronLeft aria-hidden="true" />
            </IconButton>
          )}
          <h1 ref={heading} tabIndex={-1} className="truncate text-xl font-medium outline-none">
            {title}
          </h1>
        </div>
        {(tab || actions) && (
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            {tab && <StreakChip />}
            {actions}
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
    </>
  )
}
