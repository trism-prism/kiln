# Kiln Worker

Cloudflare Worker with D1: anonymous Web Push reminders and the anonymous daily active-device ping. Plain `fetch` and `scheduled` handlers, no framework. Also the end-to-end encrypted sync store.

## What it stores

| Table | Columns | Purpose |
|---|---|---|
| `push_subscriptions` | `endpoint` (unique), `token_hash`, `p256dh`, `auth`, `reminder_time` (HH:MM), `nudge_time` (HH:MM or null), `timezone` (IANA), `last_reminder_date`, `last_nudge_date`, `last_attempt_at`, timestamps | Who to push, and when |
| `active_devices` | `device_hash`, `day` (UTC), unique together | Count of active devices per day |
| `sync_spaces` | `space_id`, `token_hash`, `seq`, `record_count`, `bytes`, `created_at` | One row per sync key |
| `sync_records` | `space_id`, `record_key`, `updated_at`, `seq`, `iv`, `ciphertext` | Newest encrypted version of each record |

It never stores: names, emails, accounts, IP addresses, user agents, task or plan content, study data, or the raw device id (only its SHA-256). The task count shown in a notification is computed on the device.

## Routes

All bodies are JSON (`Content-Type: application/json`), max 4096 bytes (1 MB for `/sync/*`), counted while streaming (Content-Length is not trusted). Errors are `{"error": "..."}` with a status code (400 invalid, 403 origin, 404, 405, 413, 415, 500). The sync routes take larger bodies (see Sync).

| Route | Body | Result |
|---|---|---|
| `GET /health` | | `200 {"ok":true}` |
| `POST /push/subscription` | `{endpoint, p256dh, auth, reminderTime, nudgeTime|null, timezone, token}` | `204`. Upsert by endpoint; 403 if the endpoint exists with a different token; 503 when the table holds 50,000 rows (`MAX_SUBSCRIPTIONS` var overrides) |
| `DELETE /push/subscription` | `{endpoint, token}` | `204` (idempotent); 403 on a wrong token |
| `POST /ping` | `{deviceId}` 16-128 chars of `A-Za-z0-9_-`, random, made by the client | `204`. Stores `sha256(deviceId)` once per device per UTC day |

Validation is strict: unknown fields are rejected; `endpoint` must be an `https` URL on a known push service (`fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com`, `notify.windows.com`), so the cron cannot be pointed at arbitrary hosts; `p256dh` is a base64url 65-byte uncompressed P-256 key, `auth` is 16 base64url bytes; times are `HH:MM`; `timezone` must be accepted by `Intl.DateTimeFormat`.

CORS: requests carrying an `Origin` not in `ALLOWED_ORIGINS` (comma separated, in `wrangler.toml`) get 403. Default is the Vite dev and preview origins; add the production origin at deploy time. There is no per-IP limit in code; add the Cloudflare rate-limiting rule from the deploy steps. Subscription rows are capped as a backstop.

## Sync

End-to-end encrypted storage for the app's data. The client design is in `src/sync/README.md`; this is the server side.

`POST /sync/push` (JSON, max 1,048,576 bytes counted while streaming): `{spaceId, token, rows: [{recordKey, updatedAt, iv, ciphertext}]}`, 1-200 rows. `spaceId`, `token` and `recordKey` are 32 random-looking bytes as 43 base64url characters; `iv` is 12 bytes; `ciphertext` is base64url, at most 65,536 characters; `updatedAt` is an integer ms timestamp, at most one day ahead. Unknown fields are rejected. Answer `200 {accepted, stale}`.

`POST /sync/pull`: `{spaceId, token, cursor, limit}` with `limit` 1-500. Answer `200 {rows: [{recordKey, updatedAt, iv, ciphertext}], cursor, more}`, rows in `seq` order; send the returned `cursor` next time while `more` is true. A page also ends after about 900,000 ciphertext characters (at least one row). A space nobody has pushed to is empty. A cursor beyond the space's last `seq` starts over from 0.

Rules:

- **Ownership.** The first push to a `spaceId` stores `SHA-256(token)`; from then on push and pull need the same token (constant-time compare, 403 otherwise). Space ids and tokens come from 256-bit secrets, so neither can be guessed.
- **Newest wins.** A row is stored only if its `updatedAt` is greater than the stored one (a tie keeps the stored row). Stale rows are counted in `stale`, not an error. Duplicates inside one push keep the newest.
- **seq.** Each accepted write gets the next number of a per-space counter, assigned inside one D1 batch together with the quota counters, so pull order is write order and an updated record moves to the end. Gaps are normal.
- **Quotas per space.** 20,000 records and 25,000,000 ciphertext characters; a push that would exceed either is refused whole with `507` (updates that do not grow the space still work). The number of spaces is capped at 5,000 (`503`). `MAX_SYNC_RECORDS`, `MAX_SYNC_BYTES` and `MAX_SYNC_SPACES` override these. The usage counters are a backstop and can drift slightly if two pushes to one space run at the same instant.
- **Errors.** 400 invalid, 403 wrong token or origin, 413 body over 1 MB, 415, 503, 507.
- **CORS** is the same as for the other routes. Add the same rate-limiting rule for `/sync/` as for `/push/` at deploy time.

### What the server sees (privacy)

The server sees: the space id (a hash derived from the key, not the key), the SHA-256 of the write token, one opaque record key per record (an HMAC, so it learns neither the table nor the id), each record's `updatedAt`, the ciphertext length, the IV, the sequence number, record counts per space, and when each space was created. It also sees the usual network metadata (IP address, request times) as any host does, though the Worker does not store it.

The server never sees: the sync key or its 24 words, the encryption key, the plaintext of any record, table names, record ids, plan or task titles, or how records relate.

Leaks that follow from the design: `updatedAt` is in the clear (the server must compare it to keep only the newest), so the server can tell when a space was edited and how often; ciphertext length roughly reveals record size; the number of records per space reveals roughly how much is stored. Anyone holding a space id and token (which means the key) can read and overwrite everything; there is no other account.

There is no route to delete a space. Turning sync off on the device leaves the encrypted rows on the server; a delete route is a later addition.

## Cron

Triggered every 15 minutes (`*/15 * * * *`). For each subscription it works out the local date and time in the subscription's timezone and sends a kind when:

- local time is at or after `reminder_time` (or `nudge_time`, only if set), and no more than 120 minutes after it, and
- `last_<kind>_date` is not the local date of that occurrence. An occurrence more than 12 hours ahead counts as yesterday's, so a 23:50 reminder fires at the 00:00 tick, recorded against the previous date, and is not repeated.

Each send first claims the date with a conditional `UPDATE` (so overlapping runs cannot double send), then calls the push service. On 2xx the claim stays. `404`/`410` delete the subscription. Other statuses and network errors release the claim and are retried on the next run (within the 120-minute window). One failing subscription never aborts the run. Rows are processed oldest `last_attempt_at` first, so failures rotate to the back and cannot starve others when the 40-send cap is hit.

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

Client registration: after `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: <VAPID public key>})`, POST `subscription.toJSON()` fields `endpoint`, `keys.p256dh`, `keys.auth` as `endpoint`, `p256dh`, `auth` together with `reminderTime`, `nudgeTime` and `timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Re-POST whenever the reminder settings change (an unchanged time keeps its already-sent marker). DELETE on unsubscribe.

Management token: the client generates a random secret once (for example `crypto.randomUUID()`, or 16+ random bytes base64url; 16-128 chars of `A-Za-z0-9_-`), keeps it locally, and sends it as `token` on every POST and DELETE. The server stores only its SHA-256. A re-POST or DELETE for an existing endpoint with a different token gets 403, so someone who learns an endpoint cannot change or remove another device's subscription.

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
7. Rate limiting: in the Cloudflare dashboard (Security > WAF > Rate limiting rules) add a rule for URI path starting with `/push/` or `/sync/` or equal to `/ping`, for example 30 requests per minute per IP, action Block. The 50,000-row cap in the Worker is only a backstop.
8. Verify: `curl https://<worker-url>/health`, then subscribe from the installed PWA.

## Web Analytics

Cloudflare Web Analytics is a cookieless script tag with a site token. It is not part of the Worker. At deploy time, create the site in the Cloudflare dashboard (Analytics & Logs, Web Analytics) and paste the snippet it gives you into `index.html` where the placeholder comment is. No token is committed.
