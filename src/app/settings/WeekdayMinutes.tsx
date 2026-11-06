import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button as AriaButton, Group, Input, NumberField } from 'react-aria-components'
import { Button } from '../../ui/button'
import { formatHours, MAX_DAY_MINUTES, parseMinutes, WEEKDAYS, weekTotal } from './budget'

const STEP = 15
const step = 'flex size-9 items-center justify-center rounded-md border border-border-strong bg-surface-raised text-text data-pressed:bg-surface-muted data-disabled:opacity-50'

/**
 * Minutes for each weekday as a table with a bar per day and the week total. Press a row to edit its minutes
 * (typed, or in 15-minute steps). `values` holds the text of each day, so an emptied field stays invalid
 * until it is filled (check with `parseMinutes`).
 */
export function WeekdayMinutes({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [editing, setEditing] = useState<number>()
  const scale = Math.max(180, ...values.map((v) => parseMinutes(v) ?? 0))
  const total = weekTotal(values)
  // Typed minutes are kept as typed; only the buttons move in 15-minute steps (NumberField's own `step` would round 50 to 45).
  const nudge = (i: number, by: number) =>
    onChange(values.map((x, j) => (j === i ? String(Math.min(MAX_DAY_MINUTES, Math.max(0, (parseMinutes(x) ?? 0) + by))) : x)))

  return (
    <div className="grid gap-2">
      <table className="w-full text-sm">
        <caption className="sr-only">Study minutes per weekday. Press a day to change its minutes.</caption>
        <tbody>
          {WEEKDAYS.map((day, i) => {
            const n = parseMinutes(values[i] ?? '')
            const open = editing === i
            return (
              <tr key={day} className="border-b border-border last:border-0" onClick={() => setEditing(i)}>
                <th scope="row" className="w-28 py-1 pr-2 text-left font-normal">
                  {open ? (
                    day
                  ) : (
                    <Button variant="quiet" className="-ml-3 justify-start" onPress={() => setEditing(i)}>
                      {day}
                    </Button>
                  )}
                </th>
                <td className="w-44 py-1 pr-3">
                  {open ? (
                    <div onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setEditing(undefined)}>
                      <NumberField
                        aria-label={day}
                        autoFocus
                        value={n ?? Number.NaN}
                        onChange={(v) => onChange(values.map((x, j) => (j === i ? (Number.isNaN(v) ? '' : String(v)) : x)))}
                        minValue={0}
                        maxValue={MAX_DAY_MINUTES}
                        isInvalid={n === undefined}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditing(undefined)}
                      >
                        <Group className="flex items-center gap-1">
                          <AriaButton slot={null} className={step} aria-label={`Less time on ${day}`} onPress={() => nudge(i, -STEP)}>
                            <Minus size={16} />
                          </AriaButton>
                          <Input inputMode="numeric" className="h-9 w-16 rounded-md border border-border-strong bg-surface-raised px-2 text-center tabular-nums data-focused:border-focus data-invalid:border-danger" />
                          <AriaButton slot={null} className={step} aria-label={`More time on ${day}`} onPress={() => nudge(i, STEP)}>
                            <Plus size={16} />
                          </AriaButton>
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
      <p className="text-sm" data-testid="week-total">
        Total per week: <strong className="font-medium tabular-nums">{total} min</strong> <span className="text-text-muted">({formatHours(total)})</span>
      </p>
    </div>
  )
}
