import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import { beforeEach } from 'vitest'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM push_subscriptions'), env.DB.prepare('DELETE FROM active_devices')])
})
