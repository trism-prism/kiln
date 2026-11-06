// RFC 5545 reader for LMS calendar feeds: unfolding, VEVENT, DTSTART/DTEND (UTC, TZID, floating,
// all-day), SUMMARY, DESCRIPTION, URL, UID, LOCATION, CATEGORIES. Pure: no DOM, no Dexie.
// ponytail: RRULE, DURATION and VTIMEZONE bodies are ignored (a recurring event shows its first
// occurrence; an unknown TZID is read as device-local time). LMS feeds list each item separately.

export interface IcsEvent {
  uid: string
  summary: string
  description?: string
  url?: string
  location?: string
  categories: string[]
  /** All-day: local days. Timed: ms epoch. */
  allDay: boolean
  /** First day, yyyy-mm-dd (for timed events, the device-local day of `start`). */
  date: string
  /** Last day, inclusive (all-day events spanning several days). */
  endDate?: string
  start?: number
  end?: number
}

/** Joins folded lines (CRLF or LF followed by a space or tab). */
export function unfold(text: string): string[] {
  // Drop a byte order mark (U+FEFF).
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

interface Line {
  name: string
  params: Record<string, string>
  value: string
}

/** Splits `NAME;P1=a;P2="b:c":value`. Quoted parameter values may contain ; and :. */
export function parseLine(line: string): Line | undefined {
  let i = 0
  let quoted = false
  const parts: string[] = []
  let cur = ''
  for (; i < line.length; i++) {
    const c = line[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && c === ';') {
      parts.push(cur)
      cur = ''
      continue
    } else if (!quoted && c === ':') break
    cur += c
  }
  if (i >= line.length) return undefined
  parts.push(cur)
  const [name, ...rest] = parts
  const params: Record<string, string> = {}
  for (const p of rest) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: (name ?? '').toUpperCase(), params, value: line.slice(i + 1) }
}

/** TEXT unescaping: \n \N newline, \, \; \\ literal. */
export function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Offset of `tz` from UTC at instant `ms`, in ms (positive east of Greenwich). */
function zoneOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ms / 1000) * 1000
}

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export type IcsTime = { allDay: true; date: string } | { allDay: false; ms: number }

/** Reads a DATE or DATE-TIME value: `20261120`, `20261120T235900Z`, or with TZID, or floating (device-local). */
export function parseTime(value: string, params: Record<string, string>): IcsTime | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return undefined
  const [, y, mo, d, h, mi, s, z] = m
  if (h === undefined || params.VALUE === 'DATE') return { allDay: true, date: `${y}-${mo}-${d}` }
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)] as const
  if (z) return { allDay: false, ms: Date.UTC(...parts) }
  const tz = params.TZID?.replace(/^\//, '')
  if (tz && validZone(tz)) {
    const guess = Date.UTC(...parts)
    // Two passes settle the offset next to a DST change.
    let ms = guess - zoneOffset(guess, tz)
    ms = guess - zoneOffset(ms, tz)
    return { allDay: false, ms }
  }
  return { allDay: false, ms: new Date(...parts).getTime() }
}

const addDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Every VEVENT with a UID and a start. Others (and other components) are skipped. */
export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = []
  let cur: Record<string, Line[]> | undefined
  let depth = 0 // nested components inside a VEVENT (VALARM)
  for (const raw of unfold(text)) {
    const line = parseLine(raw)
    if (!line) continue
    if (line.name === 'BEGIN') {
      if (cur) depth++
      else if (line.value.toUpperCase() === 'VEVENT') cur = {}
      continue
    }
    if (line.name === 'END') {
      if (cur && depth > 0) depth--
      else if (cur && line.value.toUpperCase() === 'VEVENT') {
        const ev = toEvent(cur)
        if (ev) out.push(ev)
        cur = undefined
      }
      continue
    }
    if (cur && depth === 0) (cur[line.name] ??= []).push(line)
  }
  return out
}

function toEvent(p: Record<string, Line[]>): IcsEvent | undefined {
  const one = (n: string) => p[n]?.[0]
  const text = (n: string) => {
    const v = one(n)?.value
    return v === undefined ? undefined : unescapeText(v).trim() || undefined
  }
  const uid = one('UID')?.value.trim()
  const s = one('DTSTART')
  if (!uid || !s) return undefined
  const start = parseTime(s.value, s.params)
  if (!start) return undefined
  const e = one('DTEND')
  const end = e ? parseTime(e.value, e.params) : undefined
  const url = text('URL')
  const base = {
    uid,
    summary: text('SUMMARY') ?? '(untitled)',
    description: text('DESCRIPTION'),
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    location: text('LOCATION'),
    categories: (p.CATEGORIES ?? []).flatMap((l) => l.value.split(/(?<!\\),/).map((c) => unescapeText(c).trim())).filter(Boolean),
  }
  if (start.allDay) {
    // DTEND of an all-day event is exclusive.
    const last = end?.allDay ? addDay(end.date, -1) : start.date
    return { ...base, allDay: true, date: start.date, ...(last > start.date ? { endDate: last } : {}) }
  }
  const endMs = end && !end.allDay && end.ms >= start.ms ? end.ms : start.ms
  return { ...base, allDay: false, date: localDay(start.ms), start: start.ms, end: endMs }
}
