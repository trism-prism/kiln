import type { BrowserContext } from '@playwright/test'

/** Where the e2e build thinks the Worker lives (playwright.config.ts, VITE_API_URL). */
export const WORKER = 'http://127.0.0.1:8787'

export interface Hit {
  method: string
  path: string
  body: unknown
}

/**
 * Answers the Worker's routes inside the browser so the tests need no server: a sync space that
 * is always empty, and 204 for the ping and push subscription. Returns the requests it saw.
 */
export async function mockWorker(context: BrowserContext): Promise<Hit[]> {
  const hits: Hit[] = []
  await context.route(`${WORKER}/**`, async (route) => {
    const req = route.request()
    const cors = {
      'access-control-allow-origin': req.headers()['origin'] ?? '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const path = new URL(req.url()).pathname
    hits.push({ method: req.method(), path, body: req.postData() ? JSON.parse(req.postData()!) : undefined })
    if (path === '/sync/pull') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ rows: [], cursor: 0, more: false }) })
    if (path === '/sync/push') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ accepted: 0, stale: 0 }) })
    return route.fulfill({ status: 204, headers: cors })
  })
  return hits
}
