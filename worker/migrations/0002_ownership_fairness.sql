-- SHA-256 (hex) of the client's random management token. '' (never matches) for rows made before this migration.
ALTER TABLE push_subscriptions ADD COLUMN token_hash TEXT NOT NULL DEFAULT '';

-- When the cron last tried this subscription, so repeated failures rotate to the back of the queue.
ALTER TABLE push_subscriptions ADD COLUMN last_attempt_at TEXT;

CREATE INDEX push_subscriptions_attempt ON push_subscriptions (last_attempt_at);
