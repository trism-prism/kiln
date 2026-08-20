// UUIDv7 (RFC 9562): 48-bit ms timestamp, version, 12-bit counter, variant, 62 random bits.
// Ids from one process sort in creation order, even within the same millisecond.
let lastMs = -1
let seq = 0

export function uuidv7(now: number = Date.now()): string {
  const rnd = crypto.getRandomValues(new Uint8Array(10))
  let ms = now
  if (ms <= lastMs) {
    // Same (or earlier, after a clock step back) millisecond: keep the time and count up.
    ms = lastMs
    seq++
    if (seq > 0xfff) {
      seq = 0
      ms++
    }
  } else {
    seq = ((rnd[0]! & 0x07) << 8) | rnd[1]! // start low so a burst has room to count
  }
  lastMs = ms

  const b = new Uint8Array(16)
  let t = ms
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256
    t = Math.floor(t / 256)
  }
  b[6] = 0x70 | (seq >> 8)
  b[7] = seq & 0xff
  b[8] = 0x80 | (rnd[2]! & 0x3f)
  b.set(rnd.subarray(3, 10), 9)

  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
