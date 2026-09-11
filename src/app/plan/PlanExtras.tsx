// Plan favorite star and version history.
import { useLiveQuery } from 'dexie-react-hooks'
import { Star } from 'lucide-react'
import { ToggleButton } from 'react-aria-components'
import { db, listPlanVersions, restoreVersion, updateRecord, type PlanRecord, type PlanVersionRecord } from '../../data'
import { useState } from 'react'
import { Button } from '../../ui/button'
import { Sheet, toasts } from '../../ui/overlay'
import { Badge, Card } from '../../ui/surface'
import { rescheduleOverdue, safely } from '../actions'

/** Star that marks a plan as a favorite. */
export function FavoriteButton({ plan, label = 'Favorite' }: { plan: PlanRecord; label?: string }) {
  return (
    <ToggleButton
      aria-label={label}
      isSelected={!!plan.favorite}
      onChange={(on) => void safely(() => updateRecord(db, 'plans', plan.id, { favorite: on }))}
      className="inline-flex size-10 shrink-0 cursor-default items-center justify-center rounded-md text-text-muted transition-colors outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:bg-surface-muted data-selected:text-accent"
    >
      {({ isSelected }) => <Star size={20} fill={isSelected ? 'currentColor' : 'none'} />}
    </ToggleButton>
  )
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Saved versions of the plan, newest first. Restore applies one as a new version, keeping progress. */
export function History({ planId }: { planId: string }) {
  const versions = useLiveQuery(() => listPlanVersions(db, planId), [planId])
  const [pending, setPending] = useState<PlanVersionRecord>()
  const restore = (v: PlanVersionRecord) =>
    void safely(async () => {
      await restoreVersion(db, planId, v)
      toasts.add(
        {
          title: `Restored the version from ${when(v.createdAt)}`,
          description: 'Progress is kept. Reschedule to place restored tasks.',
          action: { label: 'Reschedule', onPress: () => void rescheduleOverdue() },
        },
        { timeout: 10000 },
      )
    })
  return (
    <Card className="grid h-fit gap-3">
      <h2 className="text-base font-medium">History</h2>
      {!versions?.length ? (
        <p className="text-sm text-text-muted">Each time you save an edit, the plan is kept here so you can go back. The last 20 versions are kept.</p>
      ) : (
        <ul aria-label="Versions" className="divide-y divide-border">
          {versions.map((v, i) => (
            <li key={v.id} className="grid gap-1 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{when(v.createdAt)}</span>
                {v.label && <Badge>{v.label}</Badge>}
                {i === 0 && <Badge tone="success">Latest</Badge>}
              </div>
              <p className="text-text-muted">{v.summary}</p>
              {i > 0 && (
                <Button variant="secondary" className="w-fit" onPress={() => setPending(v)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Sheet title="Restore this version?" isOpen={!!pending} onOpenChange={(o) => !o && setPending(undefined)}>
        {({ close }) => (
          <div className="grid gap-4">
            <p className="text-sm">Restoring replaces the current plan content, including changes made on other devices. Progress is kept.</p>
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onPress={close}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  if (pending) restore(pending)
                  close()
                }}
              >
                Restore
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  )
}
