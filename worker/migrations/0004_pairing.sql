-- Pairing codes (CPace relay) and disconnecting sync. The server only passes opaque messages along.
-- A closed space keeps its token hash so a device that was offline learns that sync was disconnected.
ALTER TABLE sync_spaces ADD COLUMN closed_at TEXT;

CREATE TABLE sync_pairings (
  sid TEXT PRIMARY KEY,                 -- 16 random bytes (base64url) chosen by the host device
  slot TEXT NOT NULL UNIQUE,            -- two digits, the first half of the code the user types
  host_hash TEXT NOT NULL,              -- SHA-256 (hex) of the host's token
  msg_a TEXT NOT NULL,                  -- host's CPace message
  guest_hash TEXT,                      -- SHA-256 (hex) of the last guest's token
  msg_b TEXT,                           -- guest's CPace message, null when no answer is waiting
  tag_b TEXT,                           -- guest's confirmation tag
  wrong INTEGER NOT NULL DEFAULT 0,     -- answers the host rejected
  box TEXT,                             -- the sync key, encrypted for the guest; null again once fetched
  fetched INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL           -- ms epoch
);
