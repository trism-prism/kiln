import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Button as AriaButton,
  FieldError,
  Input,
  Label,
  Popover,
  Select as AriaSelect,
  TextField as AriaTextField,
  useLocale,
} from 'react-aria-components'
import { controlClass, ListBox, ListBoxItem, SelectedText } from './form'
import { popoverClass, popoverOffset } from './classes'

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/
const pad = (n: number) => String(n).padStart(2, '0')

/** Whether a locale writes hours on a 12-hour clock (AM/PM). */
export function uses12Hours(locale: string): boolean {
  return /^h(11|12)$/.test(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')
}

/** The same clock time in the other half of the day: "00:05" with pm is "12:05", "23:59" with am is "11:59". */
export function withPeriod(value: string, pm: boolean): string {
  const m = TIME.exec(value)
  return m ? `${pad((Number(m[1]) % 12) + (pm ? 12 : 0))}:${m[2]}` : value
}

/**
 * A typed time of day as "HH:MM" (24-hour), or undefined. Accepts "7", "7:30", "730", "0730", "7.30", "7 30",
 * "7p", "7pm", "7:30 pm", "19:30", "1930". Without am/pm, an hour from 1 to 12 takes `pm` (the AM/PM select on
 * a 12-hour clock; leave it undefined on a 24-hour clock); 0, 13 to 23 and "07" are read as 24-hour times.
 */
export function parseTimeText(text: string, pm?: boolean): string | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const marked = /^(.*?) ?([ap])[.]?(?:m[.]?)?$/.exec(t)
  const body = marked ? marked[1]! : t
  const m = /^([0-9]{1,2})(?:[:. ]([0-9]{2}))?$/.exec(body) ?? /^([0-9]{1,2})([0-9]{2})$/.exec(body)
  if (!m) return undefined
  let hour = Number(m[1])
  const minute = Number(m[2] ?? 0)
  if (minute > 59) return undefined
  if (marked) {
    if (hour < 1 || hour > 12) return undefined
    hour = (hour % 12) + (marked[2] === 'p' ? 12 : 0)
  } else if (hour > 23) return undefined
  // "0730" is written the 24-hour way, so the AM/PM select doesn't apply.
  else if (pm !== undefined && hour >= 1 && hour <= 12 && !m[1]!.startsWith('0')) hour = (hour % 12) + (pm ? 12 : 0)
  return `${pad(hour)}:${pad(minute)}`
}

/** "19:30" as the field shows it: "7:30" on a 12-hour clock (the AM/PM select shows the rest), "19:30" on a 24-hour one. */
export function formatTime(value: string, twelve: boolean): string {
  const m = TIME.exec(value)
  if (!m) return ''
  return twelve ? `${Number(m[1]) % 12 || 12}:${m[2]}` : `${m[1]}:${m[2]}`
}

const isPm = (value: string) => TIME.test(value) && Number(value.slice(0, 2)) >= 12

/**
 * Time of day typed as plain text: nothing jumps between hour and minute and nothing is selected, so a typo
 * is fixed like any text. `value` and `onChange` use "HH:MM" (24-hour), or "" when the field is empty or
 * can't be read once you leave it (the text stays as typed so you can fix it). A time that reads while you
 * type is passed on at once; the text is tidied when you leave the field or press Enter.
 * 12-hour locales get an AM/PM select; a typed am/pm or an hour from 13 sets it.
 */
export function TimeInput({
  label,
  value,
  onChange,
  isInvalid,
  errorMessage = 'Enter a time',
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  isInvalid?: boolean
  errorMessage?: string
  className?: string
}) {
  const { locale } = useLocale()
  const twelve = uses12Hours(locale)
  const [text, setText] = useState(() => formatTime(value, twelve))
  const [pm, setPm] = useState(() => isPm(value))
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(value)
  // A new value from outside (or our own, once the field is left) is shown; while typing, the text is the user's.
  if (value !== seen) {
    setSeen(value)
    if (TIME.test(value)) setPm(isPm(value))
    if (!focused && TIME.test(value)) setText(formatTime(value, twelve))
  }
  const read = (t: string) => parseTimeText(t, twelve ? pm : undefined)

  const type = (t: string) => {
    setText(t)
    const v = read(t)
    if (v && v !== value) onChange(v)
  }
  const commit = () => {
    const v = read(text)
    if (v) setText(formatTime(v, twelve))
    const next = text.trim() === '' ? '' : (v ?? '')
    if (next !== value) onChange(next)
  }

  return (
    <AriaTextField
      value={text}
      onChange={type}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        // React Aria stops key events here by default; Escape must still reach a surrounding sheet.
        e.continuePropagation()
        if (e.key === 'Enter') commit()
      }}
      isInvalid={isInvalid}
      className={`grid gap-1.5 text-sm ${className}`}
    >
      <Label className="font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input inputMode="text" autoComplete="off" placeholder="7:30" className={`${controlClass} w-28 tabular-nums placeholder:text-text-muted`} />
        {twelve && (
          <AriaSelect
            aria-label={`${label}: AM or PM`}
            selectedKey={pm ? 'pm' : 'am'}
            onSelectionChange={(k) => {
              setPm(k === 'pm')
              if (TIME.test(value)) onChange(withPeriod(value, k === 'pm'))
            }}
          >
            <AriaButton className={`${controlClass} flex cursor-default items-center gap-2`}>
              <SelectedText />
              <ChevronDown size={16} className="text-text-muted" />
            </AriaButton>
            <Popover offset={popoverOffset} className={popoverClass}>
              <ListBox>
                <ListBoxItem id="am">AM</ListBoxItem>
                <ListBoxItem id="pm">PM</ListBoxItem>
              </ListBox>
            </Popover>
          </AriaSelect>
        )}
      </div>
      <FieldError className="text-sm text-danger">{errorMessage}</FieldError>
    </AriaTextField>
  )
}
