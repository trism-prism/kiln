import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Group, Input, NumberField, useLocale } from 'react-aria-components'
import { Button } from '../../ui/button'
import { formatHours, MAX_DAY_MINUTES, parseMinutes, WEEKDAYS, weekTotal } from './budget'

const STEP = 15
const inputOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.parentElement?.querySelector('input')?.value
/** Minutes typed in the box as the locale writes them: "1.200" in German is 1200. Anything else is undefined. */
export function parseTyped(text: string, locale: string): number | undefined {
  const group = new Intl.NumberFormat(locale).formatToParts(1234567).find((p) => p.type === 'group')?.value
  // \s also covers the no-break spaces some locales group with.
  return parseMinutes((group ? text.split(group).join('') : text).replace(/\s/g, ''))
}
const step = 'flex size-9 items-center justify-center rounded-md border border-border-strong bg-surface-raised text-text outline-none focus-visible:outline-2 focus-visible:outline-focus active:bg-surface-muted'

/**
 * Minutes for each weekday as a table with a bar per day and the week total. Press a row to edit its minutes
 * (typed, or in 15-minute steps). `values` holds the text of each day, so an emptied field stays invalid
 * until it is filled (check with `parseMinutes`).
 */
export function WeekdayMinutes({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [editing, setEditing] = useState<number>()
  const { locale } = useLocale()
  const [said, setSaid] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const refocus = useRef<number | undefined>(undefined)
  // Enter and Escape close the editor; put focus back on that day's button, which is mounted again by then.
  useEffect(() => {
    if (editing === undefined && refocus.current !== undefined) root.current?.querySelector<HTMLElement>(`[data-day="${refocus.current}"]`)?.focus()
    refocus.current = undefined
  }, [editing])
  const scale = Math.max(180, ...values.map((v) => parseMinutes(v) ?? 0))
  const total = weekTotal(values)
  // Typed minutes are kept as typed; only the buttons move in 15-minute steps (NumberField's own `step` would round 50 to 45).
  // The step starts from what is in the box, which may not be committed yet (the buttons do not take focus).
  const nudge = (i: number, by: number, typed?: string) => {
    // Text that was passed is what the box shows (blank or invalid counts as 0); the saved value is only for when none was.
    const base = typed !== undefined ? (parseTyped(typed, locale) ?? 0) : (parseMinutes(values[i] ?? '') ?? 0)
    const next = Math.min(MAX_DAY_MINUTES, Math.max(0, base + by))
    setSaid(`${WEEKDAYS[i]} ${next} min`)
    onChange(values.map((x, j) => (j === i ? String(next) : x)))
  }
  return (
    <div ref={root} className="grid gap-2">
      <table className="w-full text-sm">
        <caption className="sr-only">Study minutes per weekday. Press a day to change its minutes.</caption>
        <tbody>
          {WEEKDAYS.map((day, i) => {
            const n = parseMinutes(values[i] ?? '')
            const open = editing === i
            return (
              <tr key={day} className="border-b border-border last:border-0">
                <th scope="row" className="w-28 py-1 pr-2 text-left font-normal">
                  {open ? (
                    day
                  ) : (
                    <Button variant="quiet" data-day={i} className="-ml-3 justify-start" onPress={() => setEditing(i)}>
                      {day}
                    </Button>
                  )}
                </th>
                <td className="w-44 py-1 pr-3">
                  {open ? (
                    <div
                      // On key up, not down: NumberField commits the typed text on Enter's key down, and closing on key down would
                      // move focus to the day button in time for the key up to press it and open the editor again.
                      // Escape closes from anywhere in the row; Enter only from the box (on the +/- buttons it presses them).
                      onKeyUpCapture={(e) => {
                        if (e.key !== 'Escape' && !(e.key === 'Enter' && e.target instanceof HTMLInputElement)) return
                        refocus.current = i
                        setEditing(undefined)
                      }}
                      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setEditing(undefined)}>
                      <NumberField
                        aria-label={day}
                        autoFocus
                        value={n ?? Number.NaN}
                        onChange={(v) => onChange(values.map((x, j) => (j === i ? (Number.isNaN(v) ? '' : String(v)) : x)))}
                        minValue={0}
                        maxValue={MAX_DAY_MINUTES}
                        isInvalid={n === undefined}
                      >
                        <Group className="flex items-center gap-1">
                          <button type="button" className={step} aria-label={`Less time on ${day}`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => nudge(i, -STEP, inputOf(e))}>
                            <Minus size={16} />
                          </button>
                          <Input inputMode="numeric" className="h-9 w-16 rounded-md border border-border-strong bg-surface-raised px-2 text-center tabular-nums data-focused:border-focus data-invalid:border-danger" />
                          <button type="button" className={step} aria-label={`More time on ${day}`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => nudge(i, STEP, inputOf(e))}>
                            <Plus size={16} />
                          </button>
                          <span className="text-text-muted">min</span>
                        </Group>
                      </NumberField>
                    </div>
                  ) : (
                    <span className={`tabular-nums ${n === undefined ? 'text-danger' : ''}`}>{n === undefined ? '0 to 1440' : `${n} min`}</span>
                  )}
                </td>
                <td className="py-1" aria-hidden="true">
                  <div className="h-2 rounded-full bg-surface-muted">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, ((n ?? 0) / scale) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <span role="status" className="sr-only">{said}</span>
      <p className="text-sm" data-testid="week-total">
        Total per week: <strong className="font-medium tabular-nums">{total} min</strong> <span className="text-text-muted">({formatHours(total)})</span>
      </p>
    </div>
  )
}
