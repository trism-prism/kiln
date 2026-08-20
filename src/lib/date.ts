/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening dates don't roll over). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

/** True for a real calendar date written as yyyy-mm-dd ("2026-02-30" is false). */
export function isRealISODate(s: string): boolean {
  const m = ISO_DATE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** Adds whole days to a yyyy-mm-dd date. Calendar arithmetic only, so no time zone or DST effects. */
export function addDaysISO(s: string, days: number): string {
  const m = ISO_DATE.exec(s)
  if (!m) throw new Error(`not a yyyy-mm-dd date: ${s}`)
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return t.toISOString().slice(0, 10)
}

/** Weekday of a yyyy-mm-dd date with Monday = 0 ... Sunday = 6. */
export function weekdayIndex(s: string): number {
  const m = ISO_DATE.exec(s)
  if (!m) throw new Error(`not a yyyy-mm-dd date: ${s}`)
  return (new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() + 6) % 7
}
