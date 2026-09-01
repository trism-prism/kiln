export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status: number, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers })
}

/** Reads the body with a byte counter, so a lying or missing Content-Length cannot get past the limit. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'content-type must be application/json')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = req.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new HttpError(413, 'body too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    bytes.set(c, o)
    o += c.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare (both are hex digests of equal length when they match). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
