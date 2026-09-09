// Bindings seen by `cloudflare:workers` and the test pool.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    ALLOWED_ORIGINS: string
    VAPID_PUBLIC_KEY: string
    VAPID_SUBJECT: string
    VAPID_PRIVATE_KEY: string // secret
    FEED_LIMITER: RateLimit
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[]
  }
}
