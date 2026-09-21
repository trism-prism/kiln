import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Tests send dev origins; wrangler.toml holds only the production origin.
            ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'], include: ['test/**/*.test.ts'] },
  }
})
