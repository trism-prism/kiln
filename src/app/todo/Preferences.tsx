// "To-do list preferences": what the To Do list shows and over which days. Choices apply at once and
// are kept on this device.
import { useState } from 'react'
import { Radio, RadioGroup, Label } from 'react-aria-components'
import { FROM_OPTIONS, UNTIL_OPTIONS, type FromAnchor, type MonthDay, type TodoPrefs, type UntilAnchor } from '../../domain/todo'
import { Button } from '../../ui/button'
import { Checkbox, ListBoxItem, Select, TextField } from '../../ui/form'
import { Sheet } from '../../ui/overlay'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function Choice({ legend, value, options, onChange }: { legend: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <RadioGroup value={value} onChange={onChange} className="grid gap-2">
      <Label className="text-sm font-medium">{legend}</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className="group flex min-h-9 items-center gap-2 text-sm outline-none">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-raised group-data-selected:border-accent group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
              <span className="size-2.5 rounded-full bg-accent opacity-0 group-data-selected:opacity-100" />
            </span>
            {o.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  )
}

/** A month and a day. Counts as set only when both are valid. */
function MonthDayField({ label, value, onChange }: { label: string; value?: MonthDay; onChange: (v?: MonthDay) => void }) {
  const [month, setMonth] = useState(value ? String(value.month) : 'none')
  const [day, setDay] = useState(value ? String(value.day) : '')
  const push = (m: string, d: string) => {
    const dayNum = Number(d)
    onChange(m !== 'none' && Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 ? { month: Number(m), day: dayNum } : undefined)
  }
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
      <Select
        label={`${label} month`}
        selectedKey={month}
        onSelectionChange={(k) => {
          setMonth(String(k))
          push(String(k), day)
        }}
      >
        <ListBoxItem id="none">Not set</ListBoxItem>
        {MONTHS.map((m, i) => (
          <ListBoxItem key={m} id={String(i + 1)}>
            {m}
          </ListBoxItem>
        ))}
      </Select>
      <TextField
        label={`${label} day`}
        inputMode="numeric"
        value={day}
        onChange={(d) => {
          setDay(d)
          push(month, d)
        }}
      />
    </div>
  )
}

export function Preferences({ prefs, onChange, isOpen, onClose }: { prefs: TodoPrefs; onChange: (p: TodoPrefs) => void; isOpen: boolean; onClose: () => void }) {
  const set = (patch: Partial<TodoPrefs>) => onChange({ ...prefs, ...patch })
  return (
    <Sheet title="To-do list preferences" isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <div className="grid gap-6">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Visible items</legend>
          <Checkbox isSelected={prefs.personal} onChange={(v) => set({ personal: v })}>
            Show personal to-dos
          </Checkbox>
          <Checkbox isSelected={prefs.events} onChange={(v) => set({ events: v })}>
            Show calendar events
          </Checkbox>
          <Checkbox isSelected={prefs.completed} onChange={(v) => set({ completed: v })}>
            Show completed
          </Checkbox>
          <Checkbox isSelected={prefs.favoriteOnly} onChange={(v) => set({ favoriteOnly: v })}>
            Favorite plans only
          </Checkbox>
        </fieldset>
        <Choice legend="Show tasks from" value={prefs.from} options={FROM_OPTIONS} onChange={(id) => set({ from: id as FromAnchor })} />
        <Choice legend="Show tasks until" value={prefs.until} options={UNTIL_OPTIONS} onChange={(id) => set({ until: id as UntilAnchor })} />
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Custom dates</legend>
          <p className="text-sm text-text-muted">Set a month and day to use it instead of the choice above. Weeks start on the day set in Settings.</p>
          <MonthDayField label="From" value={prefs.customFrom} onChange={(v) => set({ customFrom: v })} />
          <MonthDayField label="Until" value={prefs.customUntil} onChange={(v) => set({ customUntil: v })} />
        </fieldset>
        <div className="flex justify-end">
          <Button onPress={onClose}>Done</Button>
        </div>
      </div>
    </Sheet>
  )
}
