import type { Page } from '@playwright/test'

declare global {
  interface Window {
    kilnSeed?: () => Promise<boolean>
  }
}

/** Monday 9 Nov 2026, 09:00 local: day 1 of the sample plans. */
export const DAY1 = new Date(2026, 10, 9, 9, 0, 0)

/**
 * Fixes the browser clock at DAY1 (it keeps running from there), loads the sample plans through the
 * e2e build's hook and opens `path`.
 */
export async function openSeeded(page: Page, path = '/') {
  await page.clock.install({ time: DAY1 })
  await page.goto('/')
  await page.waitForFunction(() => typeof window.kilnSeed === 'function')
  await page.evaluate(() => window.kilnSeed!())
  await page.goto(path)
}

/** Moves the clock forward by whole days; the app notices within its next 30 s tick, which this fires. */
export async function advanceDays(page: Page, days: number) {
  await page.clock.fastForward(days * 24 * 3_600_000)
}
