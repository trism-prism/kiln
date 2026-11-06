# Sync

Optional end-to-end encrypted sync between devices through the Worker (`worker/README.md`). No React in here; the Settings screen (a later stage) calls these functions. Import from `src/sync` (`index.ts`).

## Use

```ts
import { db } from '../data'
import { enableSync, syncNow, disableSync, getSyncStatus, getSyncSecret } from '../sync'

const secret = await enableSync(db)            // new key: { mnemonic: '24 words', qr: 'kiln-sync:...' }
await enableSync(db, typedWords)               // join another device's key (throws on a bad phrase)
const summary = await syncNow(db, fetch, WORKER_URL)
await getSyncStatus(db)                        // { enabled, lastSyncedAt? }
await getSyncSecret(db)                        // words and QR text again, for "add a device"
await disableSync(db)                          // forget the key on this device; local data stays
```

`syncNow` returns `{pulled, applied, pushed, rejectedStale, invalid, error?}`. It does not throw for expected trouble; `error.kind` is one of:

| kind | meaning | UI |
|---|---|---|
| `not-enabled` | no key on this device | show the setup |
| `wrong-key` | the server refused the key (401/403) | "This key does not match the data on the server" |
| `quota` | the space is full or the request was too large (413/507) | "Sync storage is full" |
| `network` | no connection | "Offline, will retry"; just try again later |
| `server` | 5xx or an unexpected answer | "Server problem, try again later" |
| `local` | the local database failed | show the message |

Work done before an error is kept (each pulled page commits atomically with its cursor; each pushed batch moves the push mark only after the server accepted it), so retrying is always safe. Two calls at the same time share one run. `invalid > 0` means some received rows could not be decrypted or failed validation and were dropped and counted (never the whole batch).

## How it works

- **Key.** 32 random bytes (`crypto.getRandomValues`). Shown as 24 BIP39 English words (`@scure/bip39`, which checks the checksum) and as a QR payload `kiln-sync:` + base64url(key) (`keyToQrPayload`, `qrPayloadToKey`; `enableSyncFromQr` joins from one). Stored on the device in the `meta` table (`syncKey`), which is never synced or exported. Anyone with the words has all the data; treat them as a password. The key sits unencrypted in IndexedDB like any other app data, so it is as safe as the device and the page's origin.
- **Derived secrets** (HKDF-SHA256, empty salt, one label each): `kiln/sync/enc` is the AES-GCM-256 key; `kiln/sync/space` hashed with SHA-256 is the space id; `kiln/sync/auth` is the token the server checks (it stores only its hash); `kiln/sync/rid` is an HMAC key that turns `table:id` into the opaque record key. Two devices with the same words derive the same values.
- **Records.** Each row is encrypted on its own: plaintext `{table, row}`, AES-GCM with a random 96-bit IV, AAD = space id + record key, so a blob cannot be moved to another record or space. On receipt the decrypted table and id must hash to the record key the blob came under. Tables: every synced table (`TABLE_NAMES`), `meta` excluded.
- **Merge.** Per record, last write wins on `updatedAt` (ties keep the local copy), using the same `mergeRows` and row schemas as backup import (`data/backup.ts`). Deletes are tombstones (`deleted: true`) that sync like any row, so an edit newer than a delete brings the record back. The merge uses the `updatedAt` inside the decrypted row, not the server's copy.
- **Pull.** Pages of up to 500 from the saved cursor (`syncCursor`). Each page: decrypt, validate with Zod, then one Dexie transaction that merges the rows and stores the new cursor.
- **Push.** Rows with `updatedAt` above the per-table mark (`syncPushed`, JSON) in batches of up to 200 rows or 800 KB. A row just received from the server and not changed since is not sent back. The first sync after `enableSync` has no marks, so it pushes everything. Rows whose ciphertext exceeds the server's 64 KB limit are skipped and counted in `invalid`.
- **Meta keys:** `syncKey`, `syncCursor`, `syncPushed`, `syncLastSynced`. `enableSync` clears all but the key, so joining always starts from a full pull and push; merging by `updatedAt` makes that harmless.

## Known limits

- Two devices that write the same record in the same millisecond keep their own copy (ties keep local), so those two could differ until the next edit. Not worth a tie-break at this scale.
- A device whose clock is more than a day ahead is refused by the server (400 shows as `server`); rows from it dated more than a day ahead are dropped by receivers.
- Rows are not versioned. If a later app version adds a required field, older devices drop the new rows as invalid and their cursor moves past them; all devices should update together, and a record that changes again is delivered again.
- The server cannot be told to forget a space (no delete route yet).
- A row of the settings table with `updatedAt: 0` (defaults never saved) is never created, so defaults never overwrite real settings.

## What the UI stage must build (Settings > Sync)

- Off state: "Create sync key" (calls `enableSync(db)`, then shows the key) and "Join with a key" (scan a QR or type the 24 words; show the error text from the thrown message).
- On state: show the 24 words and a QR of `getSyncSecret().qr` behind a "Show key" button with a warning that it unlocks all data; a QR scanner (camera) that feeds `enableSyncFromQr`; a 24-word entry that accepts pasted text and feeds `enableSync(db, words)`; "Sync now" (disable while running, show a spinner); "Last synced" from `getSyncStatus`; "Turn off sync on this device" with a confirmation that data stays on the device and on the server.
- Automatic sync: call `syncNow` on app open, after a data change (debounced), on the `online` event, and when the tab becomes visible. `network` and `server` errors need no alarm; `wrong-key` and `quota` need a visible message.
- Error states as in the table above, plus the `invalid` count if non-zero ("N items could not be read").
- Pass `fetch` and the Worker base URL (a `VITE_*` variable with `https://`, no secrets).

## Tests

`crypto.test.ts`: round trip, AAD binding, tampering, HKDF determinism, mnemonic and QR forms. `e2e.test.ts`: two fake-indexeddb databases through the real Worker code with SQLite standing in for D1 (create, conflicts, tombstones, offline edits, corrupted and invalid rows, paging, errors). The Worker routes are tested on real D1 in `worker/test/sync.test.ts`.
