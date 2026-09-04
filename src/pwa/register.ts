// Registers the service worker and offers updates. A new version waits until the person taps
// "Reload" (no silent skipWaiting while the app is open, which could swap code under unsaved input).
import { Workbox } from 'workbox-window'
import { toasts } from '../ui/overlay'

export function registerServiceWorker(): void {
  // The worker is only built for production; in dev there is nothing at /sw.js.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const wb = new Workbox('/sw.js')
  wb.addEventListener('waiting', () => {
    toasts.add({
      title: 'Update available',
      action: {
        label: 'Reload',
        onPress: () => {
          wb.addEventListener('controlling', () => window.location.reload())
          wb.messageSkipWaiting()
        },
      },
    })
  })
  void wb.register().then((reg) => {
    // Look for a new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg?.update().catch(() => undefined)
    })
  })
}
