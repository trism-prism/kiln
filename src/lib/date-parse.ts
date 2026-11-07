// Reading dates and times the way people type them. Pure, so every accepted form is unit tested.
import { addDaysISO, isRealISODate, weekdayIndex } from './date'

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Index in `full` of a word that is a start of the full name, at least three letters ("fri", "nov", "novem"). */
const nameIndex = (word: string, full: string[]) => (word.length >= 3 ? full.findIndex((f) => f.startsWith(word)) : -1)

/** The next such weekday after today (1 to 7 days ahead). */
function nextWeekday(today: string, index: number): string {
  return addDaysISO(today, ((index - weekdayIndex(today) + 6) % 7) + 1)
}

const iso = (y: number, month: number, day: number) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** A month and day with no year: the next time that date comes (today counts). */
function monthDay(today: string, month: number, day: number): string | undefined {
  const year = Number(today.slice(0, 4))
  // Up to 8 years ahead, so Feb 29 finds the next leap year.
  for (let y = year; y <= year + 8; y++) if (isRealISODate(iso(y, month, day)) && iso(y, month, day) >= today) return iso(y, month, day)
  return undefined
}

/** Month (0-11) and day with an optional typed year ("26" or "2026"). */
function withYear(today: string, month: number, day: number, year?: string): string | undefined {
  if (year === undefined) return monthDay(today, month, day)
  if (!/^(?:[0-9]{2}|[0-9]{4})$/.test(year)) return undefined
  const out = iso(year.length === 2 ? 2000 + Number(year) : Number(year), month, day)
  return isRealISODate(out) ? out : undefined
}

/** Whether the locale writes the month before the day in numeric dates (en-US 11/20, en-GB 20/11). */
export function monthFirst(locale: string): boolean {
  const order = new Intl.DateTimeFormat(locale).formatToParts(new Date(2026, 10, 20)).map((p) => p.type)
  return order.indexOf('month') < order.indexOf('day')
}

const DAY = /^([0-9]{1,2})(?:st|nd|rd|th)?$/

/**
 * A typed date as yyyy-mm-dd, or undefined when it can't be read. Accepts "today", "tomorrow", a weekday
 * ("fri": the next one after today), "nov 20", "20 nov", "November 20 2026", numeric dates in the locale's
 * order ("11/20", "11/20/26"), and "2026-11-20". A missing year means the next time that date comes.
 * A weekday in front ("Fri, Nov 20, 2026", how the field shows a date) is ignored.
 */
export function parseDateText(text: string, today: string, locale: string): string | undefined {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/[.]$/, '')
  if (t === 'today') return today
  if (t === 'tomorrow') return addDaysISO(today, 1)
  if (isRealISODate(t)) return t
  let words = t.split(' ').map((w) => w.replace(/[.]$/, ''))
  if (words.length > 1 && nameIndex(words[0]!, WEEKDAYS) >= 0) words = words.slice(1)
  if (words.length === 1) {
    const w = nameIndex(words[0]!, WEEKDAYS)
    if (w >= 0) return nextWeekday(today, w)
  }
  if (words.length === 2 || words.length === 3) {
    const [a, b, year] = words as [string, string, string?]
    const monthThenDay = nameIndex(a, MONTHS) >= 0 && DAY.exec(b)
    const dayThenMonth = nameIndex(b, MONTHS) >= 0 && DAY.exec(a)
    if (monthThenDay) return withYear(today, nameIndex(a, MONTHS), Number(monthThenDay[1]), year)
    if (dayThenMonth) return withYear(today, nameIndex(b, MONTHS), Number(dayThenMonth[1]), year)
  }
  if (words.length !== 1) return undefined
  const ymd = /^([0-9]{4})[/.-]([0-9]{1,2})[/.-]([0-9]{1,2})$/.exec(words[0]!)
  if (ymd) return withYear(today, Number(ymd[2]) - 1, Number(ymd[3]), ymd[1])
  const num = /^([0-9]{1,2})[/.-]([0-9]{1,2})(?:[/.-]([0-9]+))?$/.exec(words[0]!)
  if (!num) return undefined
  const [first, second] = [Number(num[1]), Number(num[2])]
  const [month, day] = monthFirst(locale) ? [first, second] : [second, first]
  if (month < 1 || month > 12) return undefined
  return withYear(today, month - 1, day, num[3])
}
