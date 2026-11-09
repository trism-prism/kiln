import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import { beforeEach } from 'vitest'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

beforeEach(async () => {
  await env.DB.batch(
    ['push_subscriptions', 'active_devices', 'sync_records', 'sync_spaces', 'sync_pairings'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  )
})
