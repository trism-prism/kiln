import type { ReactNode } from 'react'

/**
 * Every route renders one Page: it sets the document title and draws the top bar with the h1.
 * actions go on the right of the top bar (one primary action at most).
 */
export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <title>{`${title} · Kiln`}</title>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-8">
        <h1 className="truncate text-xl font-medium">{title}</h1>
        {actions}
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
    </>
  )
}
