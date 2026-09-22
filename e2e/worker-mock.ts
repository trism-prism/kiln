import type { BrowserContext } from '@playwright/test'

/** Where the e2e build thinks the Worker lives (playwright.config.ts, VITE_API_URL). */
export const WORKER = 'http://127.0.0.1:8787'

export interface Hit {
  method: string
  path: string
  body: unknown
}

interface Pairing {
  sid: string
  slot: string
  hostToken: string
  msgA: string
  guestToken?: string
  msgB?: string
  tagB?: string
  wrong: number
  box?: string
  fetched: boolean
}

/**
 * The server state two browser contexts share: the pairing relay (opaque strings in, the same strings out,
 * the way the real Worker stores them; both browsers run the real CPace) and the sync spaces that were closed.
 */
export interface Relay {
  pairings: Map<string, Pairing>
  closed: Set<string>
}

export const newRelay = (): Relay => ({ pairings: new Map(), closed: new Set() })

type Reply = { status: number; body?: unknown }
const ok = (body: unknown, status = 200): Reply => ({ status, body })
const no = (status: number): Reply => ({ status, body: { error: 'x' } })

const MAX_WRONG = 3
const isDead = (p: Pairing | undefined): boolean => !p || p.wrong >= MAX_WRONG || p.box !== undefined || p.fetched

/** The /pair/* and /sync/close routes of worker/src/pair.ts and sync.ts, in memory (no expiry, no rate limit). */
function relayRoute(relay: Relay, path: string, b: Record<string, string | null>): Reply | undefined {
  const byId = (): Pairing | undefined => relay.pairings.get(b.sid ?? '')
  switch (path) {
    case '/pair/start': {
      const free = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).filter((s) => ![...relay.pairings.values()].some((p) => p.slot === s))
      if (!free.length) return no(503)
      const slot = free[Math.floor(Math.random() * free.length)]!
      relay.pairings.set(b.sid!, { sid: b.sid!, slot, hostToken: b.hostToken!, msgA: b.msgA!, wrong: 0, fetched: false })
      return ok({ slot, expiresIn: 180 }, 201)
    }
    case '/pair/join': {
      const p = [...relay.pairings.values()].find((x) => x.slot === b.slot)
      return !p || isDead(p) ? no(404) : ok({ sid: p.sid, msgA: p.msgA, expiresIn: 180 })
    }
    case '/pair/answer': {
      const p = byId()
      if (!p || isDead(p)) return no(404)
      if (p.msgB !== undefined) return no(409)
      Object.assign(p, { guestToken: b.guestToken, msgB: b.msgB, tagB: b.tagB })
      return { status: 202 }
    }
    case '/pair/poll': {
      const p = byId()
      if (!p) return no(404)
      if (p.hostToken !== b.hostToken) return no(403)
      if (p.fetched) return ok({ state: 'done', wrong: p.wrong })
      if (p.box !== undefined) return ok({ state: 'delivered', wrong: p.wrong })
      if (p.msgB !== undefined) return ok({ state: 'answer', msgB: p.msgB, tagB: p.tagB, wrong: p.wrong })
      return ok({ state: 'waiting', wrong: p.wrong })
    }
    case '/pair/reply': {
      const p = byId()
      if (!p) return no(404)
      if (p.hostToken !== b.hostToken) return no(403)
      if (p.msgB === undefined || p.msgB !== b.msgB || p.box !== undefined) return no(409)
      p.msgB = undefined
      p.tagB = undefined
      if (b.box === null) p.wrong++
      else p.box = b.box
      return { status: 204 }
    }
    case '/pair/fetch': {
      const p = byId()
      if (!p) return no(404)
      if (p.guestToken !== b.guestToken) return no(403)
      if (p.box !== undefined) {
        p.fetched = true
        return ok({ box: p.box })
      }
      return p.msgB === undefined ? ok({ state: 'wrong', left: Math.max(0, MAX_WRONG - p.wrong) }) : ok({ state: 'waiting' })
    }
    case '/sync/close':
      relay.closed.add(b.spaceId!)
      return { status: 204 }
  }
  return undefined
}

/**
 * Answers the Worker's routes inside the browser so the tests need no server: a sync space that
 * is always empty (410 once closed), the pairing relay, and 204 for the ping and push subscription.
 * Contexts that share a `relay` are two devices of one server. Returns the requests it saw.
 */
export async function mockWorker(context: BrowserContext, relay: Relay = newRelay()): Promise<Hit[]> {
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
    const body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, string | null>) : undefined
    hits.push({ method: req.method(), path, body })
    const json = (status: number, data: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(data) })
    const relayed = body && relayRoute(relay, path, body)
    if (relayed) return relayed.body === undefined ? route.fulfill({ status: relayed.status, headers: cors }) : json(relayed.status, relayed.body)
    if ((path === '/sync/pull' || path === '/sync/push') && relay.closed.has(body?.spaceId ?? '')) return json(410, { error: 'sync was disconnected' })
    if (path === '/sync/pull') return json(200, { rows: [], cursor: 0, more: false })
    if (path === '/sync/push') return json(200, { accepted: 0, stale: 0 })
    return route.fulfill({ status: 204, headers: cors })
  })
  return hits
}
