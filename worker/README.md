# Kiln Worker

Cloudflare Worker with D1: anonymous Web Push reminders and the anonymous daily active-device ping. Plain `fetch` and `scheduled` handlers, no framework. Also the end-to-end encrypted sync store.

## What it stores

| Table | Columns | Purpose |
|---|---|---|
| `push_subscriptions` | `endpoint` (unique), `token_hash`, `p256dh`, `auth`, `reminder_time` (HH:MM), `nudge_time` (HH:MM or null), `timezone` (IANA), `last_reminder_date`, `last_nudge_date`, `last_attempt_at`, timestamps | Who to push, and when |
| `active_devices` | `device_hash`, `day` (UTC), unique together | Count of active devices per day |
| `sync_spaces` | `space_id`, `token_hash`, `seq`, `record_count`, `bytes`, `created_at`, `closed_at` | One row per sync key (`closed_at` set once sync was disconnected) |
| `sync_records` | `space_id`, `record_key`, `updated_at`, `seq`, `iv`, `ciphertext` | Newest encrypted version of each record |
| `sync_pairings` | `sid`, `slot` (unique), `host_hash`, `msg_a`, `guest_hash`, `msg_b`, `tag_b`, `wrong`, `box`, `fetched`, `expires_at` | One row per pairing code, 3 minutes (see Pairing codes) |

It never stores: names, emails, accounts, IP addresses, user agents, task or plan content, study data, or the raw device id (only its SHA-256). The task count shown in a notification is computed on the device.

## Routes

All bodies are JSON (`Content-Type: application/json`), max 4096 bytes (1 MB for `/sync/*`), counted while streaming (Content-Length is not trusted). Errors are `{"error": "..."}` with a status code (400 invalid, 403 origin, 404, 405, 413, 415, 500). The sync routes take larger bodies (see Sync).

| Route | Body | Result |
|---|---|---|
| `GET /health` | | `200 {"ok":true}` |
| `POST /push/subscription` | `{endpoint, p256dh, auth, reminderTime, nudgeTime|null, timezone, token}` | `204`. Upsert by endpoint; 403 if the endpoint exists with a different token; 503 when the table holds 50,000 rows (`MAX_SUBSCRIPTIONS` var overrides) |
| `DELETE /push/subscription` | `{endpoint, token}` | `204` (idempotent); 403 on a wrong token |
| `POST /ping` | `{deviceId}` 16-128 chars of `A-Za-z0-9_-`, random, made by the client | `204`. Stores `sha256(deviceId)` once per device per UTC day |
| `POST /sync/close` | `{spaceId, token}` | `204` (idempotent); 403 on a wrong token. Disconnects sync (see Sync) |
| `POST /pair/start`, `/pair/join`, `/pair/answer`, `/pair/poll`, `/pair/reply`, `/pair/fetch` | see Pairing codes | |
| `POST /feed/fetch` | `{url}` | `200 text/calendar` (the feed, `Cache-Control: no-store`). See Calendar feeds |

Validation is strict: unknown fields are rejected; `endpoint` must be an `https` URL on a known push service (`fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com`, `notify.windows.com`), so the cron cannot be pointed at arbitrary hosts; `p256dh` is a base64url 65-byte uncompressed P-256 key, `auth` is 16 base64url bytes; times are `HH:MM`; `timezone` must be accepted by `Intl.DateTimeFormat`.

CORS: requests carrying an `Origin` not in `ALLOWED_ORIGINS` (comma separated, in `wrangler.toml`) get 403. Default is the Vite dev and preview origins; add the production origin at deploy time. Apart from `/feed/fetch` (rate-limit binding) there is no per-IP limit in code; add the Cloudflare rate-limiting rule from the deploy steps. Subscription rows are capped as a backstop.

## Sync

End-to-end encrypted storage for the app's data. The client design is in `src/sync/README.md`; this is the server side.

`POST /sync/push` (JSON, max 1,048,576 bytes counted while streaming): `{spaceId, token, rows: [{recordKey, updatedAt, iv, ciphertext}]}`, 1-200 rows. `spaceId`, `token` and `recordKey` are 32 random-looking bytes as 43 base64url characters; `iv` is 12 bytes; `ciphertext` is base64url, at most 65,536 characters; `updatedAt` is an integer ms timestamp, at most one day ahead. Unknown fields are rejected. Answer `200 {accepted, stale}`.

`POST /sync/pull`: `{spaceId, token, cursor, limit}` with `limit` 1-500. Answer `200 {rows: [{recordKey, updatedAt, iv, ciphertext}], cursor, more}`, rows in `seq` order; send the returned `cursor` next time while `more` is true. A page also ends after about 900,000 ciphertext characters (at least one row). A space nobody has pushed to is empty. A cursor beyond the space's last `seq` starts over from 0.

Rules:

- **Access.** The first push to a `spaceId` stores `SHA-256(token)`; from then on push and pull both need the same token (constant-time compare, 403 otherwise). One token gates reading and writing: everyone who holds the sync key is fully trusted, and there are no read-only or per-device keys. Space ids and tokens come from 256-bit secrets, so neither can be guessed.
- **Newest wins.** A row is stored only if its `updatedAt` is greater than the stored one. A tie keeps the stored row: the server is the tie arbiter (first stored wins), and clients take the server's row on a pull when the timestamps are equal, so devices that wrote in the same millisecond converge. Stale rows are counted in `stale`, not an error. Duplicates inside one push keep the newest.
- **seq.** Each accepted write gets the next number of a per-space counter, assigned inside one D1 batch together with the quota counters, so pull order is write order and an updated record moves to the end. Gaps are normal.
- **Quotas per space.** 20,000 records and 25,000,000 ciphertext characters; a push that would exceed either is refused whole with `507` (updates that do not grow the space still work). The caps are checked in the same D1 batch statement that updates the counters, so simultaneous pushes cannot both pass; only rows that are actually accepted count (new records, or the size change of a replacement). The number of spaces is capped at 5,000 (`503`). `MAX_SYNC_RECORDS`, `MAX_SYNC_BYTES` and `MAX_SYNC_SPACES` override these.
- **Errors.** 400 invalid, 403 wrong token or origin, 410 sync was disconnected, 413 body over 1 MB, 415, 503, 507.
- **Disconnect.** `POST /sync/close {spaceId, token}` (max 4096 bytes) deletes the space's records, sets `closed_at`, zeroes the counters and answers 204; calling it again is fine, a wrong token is 403. A space nobody pushed to gets a closed row (with the token hash) so a device that was offline still learns of it. From then on push and pull with the right token answer `410 sync was disconnected`, so a device that missed the disconnect stops instead of recreating the space. Closed spaces do not count toward the 5,000-space cap and the cleanup keeps them (a row holds a hash and counters only).
- **CORS** is the same as for the other routes. Rate limiting is a Cloudflare rule (see Deploy, step 7); the Worker has no per-IP limit.
- **Cleanup.** The cron deletes open spaces that hold no records and were created more than a day ago, so abandoned first pushes and probes do not pile up.
- **Deletes.** A delete is an ordinary update: the client pushes the record again with `deleted: true` inside the ciphertext, so the server cannot tell a delete from an edit. Storage does not shrink when records are deleted, and there is no compaction in v1; the quotas still apply to the tombstones.
- **Clock skew.** `updatedAt` comes from the writing device's clock. The server refuses rows dated more than 24 hours ahead (400), and clients drop received rows dated more than 24 hours ahead. Because the newest `updatedAt` wins, a device whose clock runs ahead (but within a day) overrides other devices' later real edits until real time catches up; a clock behind loses its edits to older versions. Keep device clocks automatic.

### What the server sees (privacy)

The server sees: the space id (a hash derived from the key, not the key), the SHA-256 of the write token, one opaque record key per record (an HMAC, so it learns neither the table nor the id), each record's `updatedAt`, the ciphertext length, the IV, the sequence number, record counts per space, and when each space was created. It also sees the usual network metadata (IP address, request times) as any host does, though the Worker does not store it.

The server never sees: the sync key, the pairing code's password digits, the encryption key, the plaintext of any record, table names, record ids, plan or task titles, or how records relate.

Leaks that follow from the design: `updatedAt` is in the clear (the server must compare it to keep only the newest), so the server can tell when a space was edited and how often; ciphertext length roughly reveals record size; the number of records per space reveals roughly how much is stored. Anyone holding a space id and token (which means the key) can read and overwrite everything; there is no other account.

`POST /sync/close` deletes the encrypted rows of a space; turning sync off from the app calls it ("Disconnect device").

## Pairing codes

A device joins sync by typing a 6-digit code shown on a device that already syncs. The code is `SS PPPP`: `SS` is a 2-digit slot the server hands out (100 slots), `PPPP` is a 4-digit password made on the host device that never reaches the server. The devices run CPace (ristretto255) over this relay with `PPPP`, and the host sends the sync key encrypted under the result; the design is in `src/sync/README.md`. The server only stores and forwards opaque strings, so it cannot work out the key or the code, and a server that cheats gets at most 3 guesses at `PPPP`.

All routes are `POST` JSON, max 4096 bytes, unknown fields rejected. `sid` is 16 random bytes (22 base64url characters); tokens, `msgA`, `msgB` and `tagB` are 32 bytes (43 characters); `box` is 60 bytes (80 characters); `slot` is two digits. Tokens are stored as SHA-256 and compared in constant time.

| Route | Body | Result |
|---|---|---|
| `/pair/start` | `{sid, hostToken, msgA}` | `201 {slot, expiresIn: 180}`; picks a random free slot; 503 when all 100 are taken |
| `/pair/join` | `{slot}` | `200 {sid, msgA, expiresIn}`; 404 if there is no live code (missing, expired, 3 wrong tries, delivered) |
| `/pair/answer` | `{sid, guestToken, msgB, tagB}` | `202`; 404 when the code is dead; 409 when another answer is waiting |
| `/pair/poll` | `{sid, hostToken}` | `200 {state: waiting or answer or delivered or done, msgB?, tagB?, wrong}`; 403 wrong token, 404 expired |
| `/pair/reply` | `{sid, hostToken, box: string or null}` | `204`. `null` rejects the answer: `wrong` goes up and the slot is free for the next try. A box is stored and its code stays alive for at least 60 more seconds. 409 when no answer is waiting |
| `/pair/fetch` | `{sid, guestToken}` | `200 {box}` exactly once (then the box is deleted); `{state: waiting}`; `{state: wrong, left}` after a rejection; 403 wrong token, 404 expired or already fetched |

A code expires 180 seconds after `start`. The third wrong try kills it (join and answer give 404). `start`, `join` and `answer` are rate limited per IP (IPv6 by /64) by the `PAIR_LIMITER` binding (`[[ratelimits]]` in `wrangler.toml`, 20 a minute); without the binding they answer 503 (fail closed), over the limit 429. The cron deletes expired rows (`cleanupPairings`), and `start` does too.

## Calendar feeds

`POST /feed/fetch {url}` lets the app's "Keep in sync" re-read an LMS calendar link (`src/feed.ts`): LMS feeds send no CORS headers, so the browser cannot fetch them itself. A feed link is a login token, so the Worker never logs, stores or echoes the URL or the body; error messages are fixed strings. Guards, each with a test in `test/feed.test.ts`:

- `https` only, default port, no user name or password, at most 2048 characters.
- Path ends in `.ics` (Canvas, Blackboard, Brightspace, Schoology, Google Calendar) or is Moodle's `/calendar/export_execute.php`.
- No IP literals at all (the URL parser turns decimal, hex, octal and short IPv4 forms into dotted digits; IPv6 keeps brackets), so loopback, private, link-local and metadata addresses are out. No `localhost`, single-label hosts, or private-network suffixes (`.local`, `.internal`, `.lan`, `.home`, `.arpa`, `.test` and others).
- `redirect: 'manual'`: every `Location` is resolved and checked with the same rules, at most 3 hops.
- 2 MB cap (declared `Content-Length` and bytes counted while streaming), 10 s timeout for the whole fetch including the body, and the answer must start with `BEGIN:VCALENDAR` (422 otherwise).
- Hosts: trailing dots are all stripped before the checks and empty labels are refused (`localhost..` and `metadata.google.internal..` are out).
- Rate limited per IP (`CF-Connecting-IP`; an IPv6 client is keyed on its /64) by the `FEED_LIMITER` binding (`[[ratelimits]]` in `wrangler.toml`, 10 a minute). Without the binding the route answers 503 (fails closed).
- Nothing from the caller is forwarded (no cookies or headers); the upstream answer's headers are not passed back.

There is no host allowlist: the route fetches any public https `.ics` URL whose body is a VCALENDAR, because schools run Canvas, Moodle and others on their own domains. What limits it is the size and time caps, the VCALENDAR check and the rate limit.

Cloudflare Workers cannot reach private networks, so a public name that resolves to a private address gets nowhere either. Errors: 400 refused URL or body, 413, 422, 429, 502 (upstream error, refused redirect), 503, 504.

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

The app's client is `src/pwa/push-client.ts`. It asks for notification permission only from the "Turn on reminders" button, subscribes, and keeps the management token in the device-local `meta` table (`pushToken`, 22 base64url characters). It re-POSTs when the times change and on app open if they differ from what the Worker last accepted, and DELETEs on "Turn off reminders" (the local subscription is removed even if the DELETE cannot be sent). If a POST gets 403 (the Worker has the endpoint under another token, for example after local data was erased) it unsubscribes, subscribes again and retries once. The Worker address is `VITE_API_URL` for push, sync and the ping (the old `VITE_SYNC_URL` is still read for one release); the VAPID public key is `VITE_VAPID_PUBLIC_KEY`. `ALLOWED_ORIGINS` must include the site's origin or every call is refused with 403.

The service worker (`src/sw.ts`, `src/pwa/push-handler.ts`) reads IndexedDB directly (no Dexie, to keep the worker small) and counts exactly as the app's badge does: today's open tasks, overdue open tasks and due review cards.

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
7. Rate limiting: in the Cloudflare dashboard (Security > WAF > Rate limiting rules) add a rule for URI path starting with `/push/` or equal to `/ping`, for example 30 requests per minute per IP, action Block. Add a second rule for URI path starting with `/sync/`, for example 60 requests per minute per IP, action Block (a sync run is a few requests; the Worker enforces quotas but not request rates). Add a third for URI path starting with `/pair/`, for example 120 requests per minute per IP (a pairing polls every 2 seconds; the free plan allows one rule, so a rule on the whole API host covers all three). The 50,000-row cap in the Worker is only a backstop.
8. Verify: `curl https://<worker-url>/health`, then subscribe from the installed PWA.

## Web Analytics

Cloudflare Web Analytics is a cookieless script tag with a site token. It is not part of the Worker. At deploy time, create the site in the Cloudflare dashboard (Analytics & Logs, Web Analytics) and paste the snippet it gives you into `index.html` where the placeholder comment is. No token is committed.
