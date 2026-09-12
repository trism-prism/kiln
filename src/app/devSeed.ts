// Sample plans for development and e2e. The checks below are compile-time constants, so production
// builds drop the code and the fixture plans never reach the bundle. The e2e build is `vite build
// --mode e2e` (see playwright.config.ts).
import { db } from '../data'

declare global {
  interface Window {
    /** Loads the sample plans (dev and e2e builds only). */
    kilnSeed?: (opts?: { reviews?: boolean }) => Promise<boolean>
  }
}

/** True in `npm run dev` and in the e2e build, false in the production build. */
export const canSeed = import.meta.env.DEV || import.meta.env.MODE === 'e2e'

export async function loadSamplePlans(opts?: { reviews?: boolean }): Promise<boolean> {
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    const { seedFixtures } = await import('../data/seed')
    return seedFixtures(db, undefined, opts?.reviews === true)
  }
  return false
}

/** Exposes `window.kilnSeed()` and handles `?seed=1` (seed, then drop the parameter). */
export async function installSeedHook(): Promise<void> {
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    window.kilnSeed = (opts) => loadSamplePlans(opts)
    const url = new URL(location.href)
    if (url.searchParams.get('seed') === '1') {
      await loadSamplePlans()
      url.searchParams.delete('seed')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  }
}
