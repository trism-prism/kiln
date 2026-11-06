export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const MAX_DAY_MINUTES = 1440

/** Whole minutes from 0 to 24 hours, or undefined for anything else (blank, "1.5", "-5", "abc"). */
export function parseMinutes(s: string): number | undefined {
  if (!/^[0-9]{1,4}$/.test(s.trim())) return undefined
  const n = Number(s.trim())
  return n <= MAX_DAY_MINUTES ? n : undefined
}

/** "12 h", "12.5 h", "0 h" */
export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`
}

/** The week's total for the minutes typed so far; days that are not valid numbers count as 0. */
export function weekTotal(values: string[]): number {
  return values.reduce((sum, v) => sum + (parseMinutes(v) ?? 0), 0)
}
