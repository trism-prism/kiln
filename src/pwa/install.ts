// "Install Kiln": the browser's install prompt, or the Add to Home Screen steps on iOS.
import { useSyncExternalStore } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// The event can fire before React mounts, so it is captured when this module loads (main.tsx imports it).
let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

export interface InstallState {
  /** The browser can show its install dialog now. */
  canPrompt: boolean
  /** iOS in a browser tab: show the Share > Add to Home Screen steps. */
  showIosSteps: boolean
  /** Running as an installed app (or just installed). */
  installed: boolean
  install: () => Promise<void>
}

async function install() {
  const e = deferred
  if (!e) return
  deferred = null // an install event can be used once
  notify()
  await e.prompt()
  await e.userChoice
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** What the install button should offer right now. */
export function useInstall(): InstallState {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null)
  const done = useSyncExternalStore(subscribe, () => installed || isStandalone())
  return { canPrompt: canPrompt && !done, showIosSteps: !done && isIOS(), installed: done, install }
}
