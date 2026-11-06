# Kiln

Kiln turns a study plan into a scheduled, Canvas-style to-do list with reminders, spaced mastery reviews and one LeetCode problem a day.
It is a local-first installable web app (PWA); sync and reminders are optional and need no account.

## Build settings

Read by Vite at build time, so they are public and baked into the bundle: include `https://`, never put a secret here, and rebuild after changing them. Put them in `.env.local` (git-ignored) for local use.

| Variable | Meaning | When empty |
|---|---|---|
| `VITE_API_URL` | The Worker's address for reminders, sync and the daily ping, no trailing slash. (`VITE_SYNC_URL` is the old name, still read for one release.) | Those features are off |
| `VITE_VAPID_PUBLIC_KEY` | VAPID public key (base64url) from `npm run vapid` in `worker/`, the same one as in `worker/wrangler.toml` | Reminders are off |
| `VITE_E2E` | `1` shows "Load sample plan" in the first-run setup (always on in `npm run dev`) | Hidden in production |

## Icons

`public/kiln-arch.svg` is the source. `npm run icons` regenerates the PNGs, maskable and Apple touch icons and `favicon.ico` in `public/` (committed) with `@vite-pwa/assets-generator`; its settings are in `scripts/pwa-assets.config.ts`.
