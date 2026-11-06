import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'

/**
 * Every route renders one Page: it sets the document title and draws the top bar with the h1.
 * actions go on the right of the top bar (one primary action at most).
 *
 * After an in-app navigation, focus moves to the h1 so screen readers announce the new page and
 * keyboard users start from its top. The first load keeps the browser's default focus, so Tab
 * still reaches the skip link first.
 */
let initial: { ref: object; key: string } | null = null

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { key } = useLocation()
  useEffect(() => {
    // Skip only the very first page of the session. Identifying it by its ref object (not the history
    // key) means going back to the first entry still moves focus, and StrictMode's dev re-run doesn't.
    initial ??= { ref: heading, key }
    if (initial.ref === heading && initial.key === key) return
    heading.current?.focus({ preventScroll: true })
  }, [key])

  return (
    <>
      <title>{`${title} · Kiln`}</title>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-8">
        <h1 ref={heading} tabIndex={-1} className="truncate text-xl font-medium outline-none">
          {title}
        </h1>
        {actions}
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
    </>
  )
}
