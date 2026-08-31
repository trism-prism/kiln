-- End-to-end encrypted sync. The server sees only opaque identifiers, timestamps and ciphertext.
-- A space is one sync key. space_id = base64url(SHA-256 of a key derived from the user's key).
CREATE TABLE sync_spaces (
  space_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,             -- SHA-256 (hex) of the write token, set by the first push
  seq INTEGER NOT NULL DEFAULT 0,       -- last sequence number handed out in this space
  record_count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,     -- total ciphertext characters stored (quota accounting)
  created_at TEXT NOT NULL
);

-- One row per record: only the newest version is kept.
CREATE TABLE sync_records (
  space_id TEXT NOT NULL,
  record_key TEXT NOT NULL,             -- base64url HMAC of table + id; the server never sees either
  updated_at INTEGER NOT NULL,          -- ms epoch, in the clear so the server can keep only the newest
  seq INTEGER NOT NULL,                 -- per-space counter, new on every accepted write; pull cursor
  iv TEXT NOT NULL,                     -- base64url, 12 bytes
  ciphertext TEXT NOT NULL,             -- base64url AES-GCM output
  PRIMARY KEY (space_id, record_key)
) WITHOUT ROWID;

CREATE UNIQUE INDEX sync_records_seq ON sync_records (space_id, seq);
