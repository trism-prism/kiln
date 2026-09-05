// Anonymous daily "this device is active" ping. The body is one random id made here and kept in
// the device-local meta table; nothing else (worker/README.md, "Active-device ping").
import type { KilnDB } from '../data'
import { getMeta, randomToken, setMeta } from './meta'

const META_ID = 'pingDeviceId'
const META_DAY = 'pingDay'

let inFlight: Promise<boolean> | undefined

/**
 * Sends the ping once per local day. Skipped when `apiUrl` is empty. Returns true when a ping was
 * sent and accepted. A failure is ignored: the day is not marked, so the next open tries again.
 */
export function pingIfDue(db: KilnDB, fetchImpl: typeof fetch, apiUrl: string, today: string): Promise<boolean> {
  if (apiUrl === '') return Promise.resolve(false)
  inFlight ??= (async () => {
    try {
      if ((await getMeta(db, META_DAY)) === today) return false
      let deviceId = await getMeta(db, META_ID)
      if (!deviceId) {
        deviceId = randomToken()
        await setMeta(db, META_ID, deviceId)
      }
      const res = await fetchImpl(`${apiUrl}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      if (!res.ok) return false
      await setMeta(db, META_DAY, today)
      return true
    } catch {
      return false
    } finally {
      inFlight = undefined
    }
  })()
  return inFlight
}
