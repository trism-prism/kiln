import { describe, expect, it } from 'vitest'
import {
  cleanCode,
  concat,
  confirmTag,
  formatCode,
  generatorFromString,
  generatorString,
  iskFrom,
  lv,
  openKey,
  pairKeys,
  randomPassword,
  sampleScalar,
  scalarMultVfy,
  sealKey,
  sha512,
  tagMatches,
} from './pair'

const hex = (s: string) => Uint8Array.from(s.replace(/\s+/g, '').match(/../g)!.map((h) => parseInt(h, 16)))
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

// Test vectors of draft-irtf-cfrg-cpace, appendix B.3 (CPACE-RISTRETTO255-SHA512). They check the building blocks
// this app uses (hash to the generator, scalar multiplication, the ISK hash); the app's own generator string and
// transcript differ from the draft's (see the cases further down), so the final bytes of a pairing are not the draft's.
describe('CPace draft test vectors (ristretto255, SHA-512)', () => {
  const sid = hex('7e4b4791d6a8ef019b936c79fb7f2c57')
  const ya = hex('da3d23700a9e5699258aef94dc060dfda5ebb61f02a5ea77fad53f4ff0976d08')
  const yb = hex('d2316b454718c35362d83d69df6320f38578ed5984651435e2949762d900b80d')
  const Ya = hex('d6bac480f2c386c394efc7c47adb9925dcd2630b64f240c50f8d0eec482b9157')
  const Yb = hex('3ea7e0b19560d7c0b0f5734f63b955286dfa8232b5ebe63324e2d9e7433f7258')
  const K = hex('80b69a8a76457ab6a4d7f887a4bf6b55a2f80ac19c333f917a05fc9887c8b40f')
  // generator_string(DSI, PRS, CI, sid, 128) of the draft: lv(DSI) lv(PRS) lv(zero pad of 100) lv(CI) lv(sid).
  const CI = hex('0b415f696e69746961746f720b425f726573706f6e646572')
  const genStr = lv('CPaceRistretto255', 'Password', new Uint8Array(100), CI, sid)

  it('builds the generator string and hashes it', async () => {
    expect(genStr).toHaveLength(170)
    expect(toHex(genStr).slice(0, 56)).toBe('11435061636552697374726574746f3235350850617373776f726464')
    expect(toHex(await sha512(genStr))).toBe(
      'da6d3ddc8802fca9058755ffd3ebde08a9c2c74945901a258482a288b6663af06bf645c93cd1c51512307199c80e84908916d983b34af77205f90851a657ee27',
    )
  })

  it('derives the generator g', async () => {
    expect(toHex(await generatorFromString(genStr))).toBe('222b6b195fe84b1652badb6f6a3ae3d24341e7306967f0b8115b40d5698c7e56')
  })

  it('gives the messages Ya and Yb, and the same K from both sides', async () => {
    const g = await generatorFromString(genStr)
    expect(toHex((await scalarMultVfy(ya, g))!)).toBe(toHex(Ya))
    expect(toHex((await scalarMultVfy(yb, g))!)).toBe(toHex(Yb))
    expect(toHex((await scalarMultVfy(ya, Yb))!)).toBe(toHex(K))
    expect(toHex((await scalarMultVfy(yb, Ya))!)).toBe(toHex(K))
  })

  it('hashes the ISK as the draft does (DSI, sid, K, then the transcript)', async () => {
    const transcriptIr = hex(
      '20d6bac480f2c386c394efc7c47adb9925dcd2630b64f240c50f8d0eec482b9157 03414461 203ea7e0b19560d7c0b0f5734f63b955286dfa8232b5ebe63324e2d9e7433f7258 03414462',
    )
    expect(toHex(concat(lv('CPaceRistretto255_ISK', sid, K), transcriptIr))).toBe(
      '15435061636552697374726574746f3235355f49534b107e4b4791d6a8ef019b936c79fb7f2c572080b69a8a76457ab6a4d7f887a4bf6b55a2f80ac19c333f917a05fc9887c8b40f20d6bac480f2c386c394efc7c47adb9925dcd2630b64f240c50f8d0eec482b915703414461203ea7e0b19560d7c0b0f5734f63b955286dfa8232b5ebe63324e2d9e7433f725803414462',
    )
    expect(toHex(await iskFrom(sid, K, transcriptIr))).toBe(
      'b69effbf61b51d56401c0f65601abe428de8206feaaf0e32198896dcae7b35cd2b38950a39dfd5d4a79164614c2984f7daa460b588c1e80c3fa2068af7900447',
    )
  })
})

describe('lv', () => {
  it('prefixes lengths, with two bytes from 128', () => {
    expect(toHex(lv('ab', new Uint8Array(0)))).toBe('02616200')
    const long = lv(new Uint8Array(300))
    expect([...long.slice(0, 2)]).toEqual([0xac, 0x02])
    expect(long).toHaveLength(302)
  })
})

describe("this app's handshake", () => {
  /** Both sides' view of one handshake, as the two devices compute it. */
  async function handshake(hostPppp: string, guestPppp: string) {
    const sid = crypto.getRandomValues(new Uint8Array(16))
    const ya = sampleScalar()
    const yb = sampleScalar()
    const Ya = (await scalarMultVfy(ya, await generatorFromString(generatorString(hostPppp, sid))))!
    const Yb = (await scalarMultVfy(yb, await generatorFromString(generatorString(guestPppp, sid))))!
    const host = await pairKeys(await iskFrom(sid, (await scalarMultVfy(ya, Yb))!, concat(lv(Ya), lv(Yb))))
    const guest = await pairKeys(await iskFrom(sid, (await scalarMultVfy(yb, Ya))!, concat(lv(Ya), lv(Yb))))
    return { sid, Ya, Yb, host, guest }
  }

  it('with the same digits both sides agree: the tag checks and the key arrives', async () => {
    const h = await handshake('0748', '0748')
    const tag = await confirmTag(h.guest, h.Ya, h.Yb)
    expect(tag).toHaveLength(32)
    expect(await tagMatches(h.host, h.Ya, h.Yb, tag)).toBe(true)
    const key = crypto.getRandomValues(new Uint8Array(32))
    const box = await sealKey(h.host, h.sid, key)
    expect(box).toHaveLength(60)
    expect(await openKey(h.guest, h.sid, box)).toEqual(key)
  })

  it('with a wrong digit the tag fails and the box cannot be opened', async () => {
    const h = await handshake('0748', '0749')
    expect(await tagMatches(h.host, h.Ya, h.Yb, await confirmTag(h.guest, h.Ya, h.Yb))).toBe(false)
    const box = await sealKey(h.host, h.sid, new Uint8Array(32))
    await expect(openKey(h.guest, h.sid, box)).rejects.toThrow()
  })

  it('a tag over other messages fails', async () => {
    const h = await handshake('1111', '1111')
    const other = await handshake('1111', '1111')
    expect(await tagMatches(h.host, h.Ya, h.Yb, await confirmTag(h.guest, other.Ya, other.Yb))).toBe(false)
  })

  it('a changed box, another session id or a short box fails', async () => {
    const h = await handshake('2222', '2222')
    const box = await sealKey(h.host, h.sid, new Uint8Array(32).fill(7))
    const flipped = box.slice()
    flipped[30]! ^= 1
    await expect(openKey(h.guest, h.sid, flipped)).rejects.toThrow()
    await expect(openKey(h.guest, crypto.getRandomValues(new Uint8Array(16)), box)).rejects.toThrow()
    await expect(openKey(h.guest, h.sid, box.slice(0, 59))).rejects.toThrow()
  })

  it('rejects the identity point and encodings that are not points', async () => {
    const y = sampleScalar()
    expect(await scalarMultVfy(y, new Uint8Array(32))).toBeNull()
    expect(await scalarMultVfy(y, new Uint8Array(32).fill(0xff))).toBeNull()
    expect(await scalarMultVfy(y, new Uint8Array(5))).toBeNull()
  })

  it('the generator depends on the digits and on the session id', async () => {
    const sid = new Uint8Array(16)
    const a = toHex(await generatorFromString(generatorString('0000', sid)))
    expect(toHex(await generatorFromString(generatorString('0001', sid)))).not.toBe(a)
    expect(toHex(await generatorFromString(generatorString('0000', new Uint8Array(16).fill(1))))).not.toBe(a)
  })
})

describe('the code', () => {
  it('has 4 digits, spread evenly', () => {
    const counts = Array<number>(10).fill(0)
    for (let i = 0; i < 5000; i++) {
      const p = randomPassword()
      expect(p).toMatch(/^\d{4}$/)
      for (const c of p) counts[Number(c)]!++
    }
    // 20,000 digits: each about 2,000, standard deviation about 42.
    for (const n of counts) expect(Math.abs(n - 2000)).toBeLessThan(250)
  })

  it('is shown as 3 + 3 digits and read from messy typing', () => {
    expect(formatCode('074821')).toBe('074 821')
    expect(cleanCode(' 074-821 ')).toBe('074821')
    expect(cleanCode('12ab34567890')).toBe('123456')
    expect(cleanCode('')).toBe('')
  })

  it('scalars are 252-bit and never zero', () => {
    for (let i = 0; i < 50; i++) {
      const s = sampleScalar()
      expect(s[31]! & 0xf0).toBe(0)
      expect(s.some((b) => b !== 0)).toBe(true)
    }
  })
})
