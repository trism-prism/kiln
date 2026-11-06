# Kiln Worker

Cloudflare Worker with D1: anonymous Web Push reminders and the anonymous daily active-device ping. Plain `fetch` and `scheduled` handlers, no framework. Sync routes arrive in a later stage.

## What it stores

| Table | Columns | Purpose |
|---|---|---|
| `push_subscriptions` | `endpoint` (unique), `p256dh`, `auth`, `reminder_time` (HH:MM), `nudge_time` (HH:MM or null), `timezone` (IANA), `last_reminder_date`, `last_nudge_date`, timestamps | Who to push, and when |
| `active_devices` | `device_hash`, `day` (UTC), unique together | Count of active devices per day |

It never stores: names, emails, accounts, IP addresses, user agents, task or plan content, study data, or the raw device id (only its SHA-256). The task count shown in a notification is computed on the device.

## Routes

All bodies are JSON (`Content-Type: application/json`), max 4 KB. Errors are `{"error": "..."}` with a status code (400 invalid, 403 origin, 404, 405, 413, 415, 500).

| Route | Body | Result |
|---|---|---|
| `GET /health` | | `200 {"ok":true}` |
| `POST /push/subscription` | `{endpoint, p256dh, auth, reminderTime, nudgeTime|null, timezone}` | `204`. Upsert by endpoint |
| `DELETE /push/subscription` | `{endpoint}` | `204` (idempotent) |
| `POST /ping` | `{deviceId}` 16-128 chars of `A-Za-z0-9_-`, random, made by the client | `204`. Stores `sha256(deviceId)` once per device per UTC day |

Validation is strict: unknown fields are rejected; `endpoint` must be an `https` URL on a known push service (`fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com`, `notify.windows.com`), so the cron cannot be pointed at arbitrary hosts; `p256dh` is a base64url 65-byte uncompressed P-256 key, `auth` is 16 base64url bytes; times are `HH:MM`; `timezone` must be accepted by `Intl.DateTimeFormat`.

CORS: requests carrying an `Origin` not in `ALLOWED_ORIGINS` (comma separated, in `wrangler.toml`) get 403. Default is the Vite dev and preview origins; add the production origin at deploy time. There is no per-IP rate limit (a Cloudflare rate-limiting rule on the zone can add one later).

## Cron

Triggered every 15 minutes (`*/15 * * * *`). For each subscription it works out the local date and time in the subscription's timezone and sends a kind when:

- local time is at or after `reminder_time` (or `nudge_time`, only if set), and no more than 120 minutes after it, and
- `last_<kind>_date` is not today's local date.

`last_<kind>_date` is written only after the push service answers 2xx, so a failed send retries on the next run (within the 120-minute window). `404`/`410` delete the subscription. Other statuses and network errors are logged and retried.

Edge cases, all covered by tests: half-hour zones (Asia/Kolkata); a time skipped by spring-forward fires when the clock reaches 03:00; the repeated hour on fall-back does not send twice because the date marker is per local day. When a subscription is saved and its time has already passed that local day, the marker is set to today so it does not fire immediately.

Limits: at most 40 sends per run (free-plan subrequest cap; the rest go out on the next run), and the cron loads all rows (fine for thousands of devices).

The server cannot know whether tasks remain, so the nudge is sent to every subscription that enabled it; the service worker decides what to show.

## Push payload contract (for the service worker)

Every push is a Web Push message encrypted with RFC 8291 `aes128gcm`; the decrypted body is JSON:

```json
{ "kind": "reminder" }
```
or
```json
{ "kind": "nudge" }
```

No counts, titles or user data. The service worker `push` handler must:

1. Parse `event.data.json()` (fall back to `{kind: "reminder"}` if empty or invalid).
2. Read IndexedDB, compute today's task count and overdue count, and build the text ("3 tasks today (1 overdue)").
3. Call `self.registration.showNotification(...)` and `navigator.setAppBadge(count)`. Always show a notification, including for a nudge when nothing remains (for example "All done today"): Safari/iOS revokes subscriptions that receive pushes without a visible notification.
4. For `kind: "nudge"`, show nothing alarming when the count is zero; the wording above is enough.

Client registration: after `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: <VAPID public key>})`, POST `subscription.toJSON()` fields `endpoint`, `keys.p256dh`, `keys.auth` as `endpoint`, `p256dh`, `auth` together with `reminderTime`, `nudgeTime` and `timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Re-POST whenever the reminder settings change. DELETE on unsubscribe.

Active-device ping: generate `deviceId` once (`crypto.randomUUID()` with dashes kept, or 16 random bytes base64url) and store it locally; POST `/ping` at most once per day when the app opens.

## Push implementation

`src/push.ts` is a minimal WebCrypto implementation of VAPID (ES256 JWT, RFC 8292) and aes128gcm encryption (RFC 8291), no dependencies. `@block65/webcrypto-web-push` (2.0.0, published 2026-09-15, one dependency) is a maintained alternative, but the code needed is about 100 lines, has tests (JWT verified with the public key, encryption round-tripped through an independent decrypter), and avoids a runtime dependency.

## Local development

```sh
cd worker
npm ci
npm run typecheck
npm test                      # runs inside the Workers runtime with an in-memory D1
npm run migrate:local         # wrangler d1 migrations apply kiln --local
npm run dev                   # wrangler dev --local, http://127.0.0.1:8787
```

Cron locally: `npx wrangler dev --local --test-scheduled`, then `curl "http://127.0.0.1:8787/__scheduled?cron=*/15+*+*+*+*"`. For a real push you need a VAPID pair in `.dev.vars` (git-ignored):

```
VAPID_PRIVATE_KEY=<from npm run vapid>
```

and the matching public key in `wrangler.toml`. `npm run vapid` prints a new pair.

## Deploy (documented only; nothing here has been run)

1. Create a Cloudflare account (free) and run `npx wrangler login`.
2. `npx wrangler d1 create kiln`. Copy the printed `database_id` into `wrangler.toml`.
3. `npm run vapid`. Put `VAPID_PUBLIC_KEY` into `wrangler.toml` `[vars]` and set `VAPID_SUBJECT` to `mailto:<your address>`. Store the private key: `npx wrangler secret put VAPID_PRIVATE_KEY` and paste it. Never commit it. The app uses the same public key as `applicationServerKey`.
4. Add the production site origin to `ALLOWED_ORIGINS`.
5. `npx wrangler d1 migrations apply kiln --remote`.
6. `npx wrangler deploy`.
7. Verify: `curl https://<worker-url>/health`, then subscribe from the installed PWA.

## Web Analytics

Cloudflare Web Analytics is a cookieless script tag with a site token. It is not part of the Worker. At deploy time, create the site in the Cloudflare dashboard (Analytics & Logs, Web Analytics) and paste the snippet it gives you into `index.html` where the placeholder comment is. No token is committed.
