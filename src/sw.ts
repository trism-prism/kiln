/// <reference lib="webworker" />
// Service worker: offline shell, update prompt and push reminders. Built by vite-plugin-pwa (injectManifest).
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import type { BadgeTarget } from './pwa/badge'
import { handlePush } from './pwa/push-handler'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] }

// The app shell and every lazy chunk are precached at install, so any page opens offline.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Offline navigation: every page address serves the app shell. Real files (anything with an extension) are left alone.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/\/[^/?]+\.[^/]+$/] }))

// Runtime cache: only same-origin static assets that were not precached. Never the Worker's API
// (a different origin; the path check also covers a Worker served from this origin).
const API_PATH = /^\/(push|sync|ping)(\/|$)/
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    !API_PATH.test(url.pathname) &&
    ['style', 'script', 'font', 'image'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'static' }),
)

// A new version waits until the person taps "Reload" in the app; there is no skipWaiting mid-session.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()

self.addEventListener('push', (event) => {
  event.waitUntil(
    handlePush(event.data, {
      indexedDB: self.indexedDB,
      now: () => new Date(),
      show: (title, options) => self.registration.showNotification(title, options),
      badge: self.navigator as BadgeTarget,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) {
        // The app listens for this and moves to the To Do page without a reload.
        open.postMessage({ type: 'open', to: '/todo' })
        await open.focus()
      } else {
        await self.clients.openWindow('/todo')
      }
    })(),
  )
})
