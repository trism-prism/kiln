// Rating sheet (Again / Hard / Good / Easy) and the completion flow shared by To Do, the task page
// and brush-up: ask for a rating where a review card is involved, write, then toast with Undo.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { RATING_NAMES, type RatingName } from '../domain/mastery'
import { completePractice, completeTask, db, reviewCard } from '../data'
import { Sheet, toasts } from '../ui/overlay'

export const RATING_HINTS: Record<RatingName, { label: string; hint: string }> = {
  again: { label: 'Again', hint: "I couldn't do it or blanked. Show it again soon." },
  hard: { label: 'Hard', hint: 'Got there, but it took real effort or hints.' },
  good: { label: 'Good', hint: 'Did it with a little thinking.' },
  easy: { label: 'Easy', hint: 'Immediate and clean. Space it out.' },
}

interface Request {
  title: string
  onRate: (rating: RatingName) => void
}

/** The sheet. Keys 1 to 4 pick Again to Easy while it is open. */
export function RatingSheet({ request, onClose }: { request: Request | null; onClose: () => void }) {
  const open = request !== null
  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const rating = RATING_NAMES[Number(e.key) - 1]
      if (!rating) return
      e.preventDefault()
      request.onRate(rating)
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, onClose])

  return (
    <Sheet title="How did it go?" isOpen={open} onOpenChange={(o) => !o && onClose()}>
      <p className="-mt-2 mb-4 text-sm text-text-muted">{request?.title}</p>
      <div className="grid gap-2">
        {RATING_NAMES.map((name, i) => (
          <AriaButton
            key={name}
            onPress={() => {
              request?.onRate(name)
              onClose()
            }}
            className="flex min-h-14 cursor-default items-center gap-3 rounded-md border border-border-strong bg-surface-raised px-4 py-2 text-left transition-colors data-hovered:bg-surface-muted data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{RATING_HINTS[name].label}</span>
              <span className="block text-sm text-text-muted">{RATING_HINTS[name].hint}</span>
            </span>
            <kbd aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-muted font-sans text-xs text-text-muted">
              {i + 1}
            </kbd>
          </AriaButton>
        ))}
      </div>
    </Sheet>
  )
}

/** What the completion flow needs from a task, a daily problem or a review. */
export interface Completable {
  kind: 'task' | 'practice' | 'review'
  id: string
  title: string
  /** Ask for a rating first. */
  rates: boolean
}

function fail(e: unknown) {
  toasts.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
}

async function run(item: Completable, rating: RatingName) {
  const now = Date.now()
  try {
    if (item.kind === 'practice') {
      const r = await completePractice(db, item.id, rating, now)
      return { r, text: `Done: ${item.title}` }
    }
    if (item.kind === 'review') {
      const r = await reviewCard(db, item.id, rating, now)
      return { r, text: `Reviewed: ${item.title.replace(/^Review: /, '')}` }
    }
    const r = await completeTask(db, item.id, rating, now)
    return { r, text: `Done: ${item.title}` }
  } catch (e) {
    fail(e)
  }
}

/** Completes `item` with `rating` and shows an Undo toast. */
export async function complete(item: Completable, rating: RatingName) {
  const done = await run(item, rating)
  if (!done) return
  toasts.add(
    { title: done.text, action: { label: 'Undo', onPress: () => void done.r.undo().catch(fail) } },
    { timeout: 8000 },
  )
}

/**
 * `complete(item)` asks for a rating when the item gets a review card and completes straight away
 * ("good", ignored) otherwise. Render `sheet` once on the page.
 */
export function useCompleter(): { complete: (item: Completable) => void; rate: (title: string, onRate: (r: RatingName) => void) => void; sheet: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null)
  const close = useCallback(() => setRequest(null), [])
  const rate = useCallback((title: string, onRate: (r: RatingName) => void) => setRequest({ title, onRate }), [])
  return {
    complete: (item) => (item.rates ? rate(item.title, (r) => void complete(item, r)) : void complete(item, 'good')),
    rate,
    sheet: <RatingSheet request={request} onClose={close} />,
  }
}
