import { useState } from 'react'
import { X } from 'lucide-react'
import { db, updateSettings, type SettingsRecord } from '../../data'
import { toLocalISODate } from '../../lib/date'
import { Button, IconButton } from '../../ui/button'
import { ListBoxItem, Select, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { parseMinutes } from './budget'
import { WeekdayMinutes } from './WeekdayMinutes'

export const failed = (e: unknown) =>
  toasts.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })

/** Minutes per weekday, week start and the review cap. Saving calls `onChanged` so the page can offer a reschedule. */
export function BudgetSection({ settings, onChanged }: { settings: SettingsRecord; onChanged: () => void }) {
  const [values, setValues] = useState(() => settings.minutesPerWeekday.map(String))
  const [weekStart, setWeekStart] = useState(settings.weekStartsOn)
  const parsed = values.map(parseMinutes)
  const valid = parsed.every((v) => v !== undefined)

  async function save() {
    if (!valid) return
    try {
      await updateSettings(db, { minutesPerWeekday: parsed as number[], weekStartsOn: weekStart })
    } catch (e) {
      return failed(e)
    }
    toasts.add({ title: 'Study time saved' }, { timeout: 4000 })
    onChanged()
  }

  return (
    <Card className="grid gap-4" >
      <section aria-labelledby="budget-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="budget-heading" className="text-base font-medium">Study time</h2>
          <p className="text-sm text-text-muted">Minutes you can study on each weekday. Use 0 for a day off.</p>
        </div>
        <WeekdayMinutes values={values} onChange={setValues} />
        <div className="grid max-w-sm gap-4">
          <Select label="Week starts on" selectedKey={weekStart} onSelectionChange={(k) => setWeekStart(k as typeof weekStart)}>
            <ListBoxItem id="monday">Monday</ListBoxItem>
            <ListBoxItem id="sunday">Sunday</ListBoxItem>
          </Select>
          <p className="text-sm text-text-muted">
            Spaced reviews take at most <strong className="font-medium text-text">{settings.reviewCapPercent}%</strong> of a day&apos;s minutes.
          </p>
        </div>
        <div>
          <Button onPress={save} isDisabled={!valid}>Save study time</Button>
        </div>
      </section>
    </Card>
  )
}

/** Days with no study. Each change is saved at once. */
export function BlackoutSection({ settings, onChanged }: { settings: SettingsRecord; onChanged: () => void }) {
  const [date, setDate] = useState('')
  const [dateBad, setDateBad] = useState(false)
  const days = [...settings.blackoutDates].sort()

  async function set(next: string[]): Promise<boolean> {
    try {
      await updateSettings(db, { blackoutDates: next })
    } catch (e) {
      failed(e)
      return false
    }
    onChanged()
    return true
  }

  return (
    <Card className="grid gap-4">
      <section aria-labelledby="blackout-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="blackout-heading" className="text-base font-medium">Days off</h2>
          <p className="text-sm text-text-muted">Kiln schedules nothing on these dates.</p>
        </div>
        {/* Top-aligned so an error under the field doesn't push the button down; mt-6.5 is the label line plus the field gap. */}
        <div className="flex items-start gap-3">
          <TextField label="Date" type="date" min={toLocalISODate(new Date())} value={date} onChange={setDate} onInvalidChange={setDateBad} />
          <Button
            variant="secondary"
            className="mt-6.5"
            isDisabled={date === '' || dateBad || days.includes(date)}
            onPress={async () => {
              if (await set([...days, date])) setDate('')
            }}
          >
            Add day off
          </Button>
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-text-muted">No days off.</p>
        ) : (
          <ul className="grid gap-1" aria-label="Days off">
            {days.map((d) => (
              <li key={d} className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular-nums">{d}</span>
                <IconButton aria-label={`Remove ${d}`} onPress={() => set(days.filter((x) => x !== d))}>
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
