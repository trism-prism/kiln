-- Web Push subscriptions. No account, no user id: the endpoint identifies the browser.
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  reminder_time TEXT NOT NULL,          -- 'HH:MM' local
  nudge_time TEXT,                      -- 'HH:MM' local, NULL = nudge off
  timezone TEXT NOT NULL,               -- IANA name
  last_reminder_date TEXT,              -- local 'YYYY-MM-DD' of the last 2xx reminder
  last_nudge_date TEXT,                 -- local 'YYYY-MM-DD' of the last 2xx nudge
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Anonymous daily ping: SHA-256 of a random device id, one row per device per UTC day.
CREATE TABLE active_devices (
  device_hash TEXT NOT NULL,
  day TEXT NOT NULL,                    -- UTC 'YYYY-MM-DD'
  UNIQUE (device_hash, day)
);
