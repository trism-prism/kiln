import { lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation } from 'react-router'
import { db, listPlans } from '../data'
import { getMeta, setMeta } from '../pwa/meta'
import { useInstall } from '../pwa/install'
import { Button } from '../ui/button'
import { IosSteps } from './settings/InstallSection'

// Loaded only on the dashboard, after the first screen, to keep the main chunk small.
const Onboarding = lazy(() => import('./onboarding/Onboarding').then((m) => ({ default: m.Onboarding })))

const META_DISMISSED = 'installDismissed'

/** A quiet "Install Kiln" strip, shown on the dashboard once there is a plan, until dismissed (remembered). */
function InstallBanner() {
  const { canPrompt, showIosSteps, installed, install } = useInstall()
  const plans = useLiveQuery(async () => (await listPlans(db)).length)
  const dismissed = useLiveQuery(async () => (await getMeta(db, META_DISMISSED)) === '1')
  if (installed || !plans || dismissed !== false || !(canPrompt || showIosSteps)) return null
  return (
    <section aria-label="Install Kiln" className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm md:px-8">
        <div className="grid gap-2">
          <p>Install Kiln to open it like an app, with a badge for today&apos;s tasks.</p>
          {!canPrompt && <IosSteps />}
        </div>
        <div className="flex gap-2">
          {canPrompt && <Button variant="secondary" onPress={() => void install()}>Install Kiln</Button>}
          <Button variant="quiet" onPress={() => void setMeta(db, META_DISMISSED, '1')}>Not now</Button>
        </div>
      </div>
    </section>
  )
}

/** First-run setup and the install strip: shown above the dashboard only. */
export function HomeExtras() {
  if (useLocation().pathname !== '/') return null
  return (
    <>
      <Suspense>
        <Onboarding />
      </Suspense>
      <InstallBanner />
    </>
  )
}
