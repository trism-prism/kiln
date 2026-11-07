// "To-do List Preferences": what the To Do list shows and over which days, kept on this device.
// Rows edit a draft; Done saves it, Cancel (or Escape, or a tap outside) drops it.
import { useState } from 'react'
import { FROM_OPTIONS, UNTIL_OPTIONS, optionBounds, shortDate, type FromAnchor, type TodoPrefs, type UntilAnchor } from '../../domain/todo'
import type { WeekStart } from '../../domain/calendar'
import { CheckboxRow, ListSection, RadioListSection, RadioRow } from '../../ui/list'
import { FormSheet } from '../../ui/overlay'

type Props = { prefs: TodoPrefs; today: string; weekStartsOn: WeekStart; isOpen: boolean; onSave: (p: TodoPrefs) => void; onClose: () => void }

export function Preferences({ prefs, today, weekStartsOn, isOpen, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(prefs)
  // Start each opening from the saved prefs (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setDraft(prefs)
  }
  const set = (patch: Partial<TodoPrefs>) => setDraft((d) => ({ ...d, ...patch }))
  const bounds = optionBounds(draft, today, weekStartsOn)
  return (
    <FormSheet
      title="To-do List Preferences"
      isOpen={isOpen}
      onCancel={onClose}
      onDone={() => {
        onSave(draft)
        onClose()
      }}
    >
      <ListSection title="Visible Items">
        <CheckboxRow isSelected={draft.personal} onChange={(v) => set({ personal: v })}>
          Show Personal To-dos
        </CheckboxRow>
        <CheckboxRow isSelected={draft.events} onChange={(v) => set({ events: v })}>
          Show Calendar Events
        </CheckboxRow>
        <CheckboxRow isSelected={draft.completed} onChange={(v) => set({ completed: v })}>
          Show Completed
        </CheckboxRow>
        <CheckboxRow isSelected={draft.favoriteOnly} onChange={(v) => set({ favoriteOnly: v })}>
          Favorite Plans Only
        </CheckboxRow>
      </ListSection>
      <RadioListSection title="Show tasks from" value={draft.from} onChange={(id) => set({ from: id as FromAnchor })}>
        {FROM_OPTIONS.map((o) => (
          <RadioRow key={o.id} value={o.id} description={`From ${shortDate(bounds.from[o.id], today)}`}>
            {o.label}
          </RadioRow>
        ))}
      </RadioListSection>
      <RadioListSection title="Show tasks until" value={draft.until} onChange={(id) => set({ until: id as UntilAnchor })}>
        {UNTIL_OPTIONS.map((o) => (
          <RadioRow key={o.id} value={o.id} description={`Until ${shortDate(bounds.until[o.id], today)}`}>
            {o.label}
          </RadioRow>
        ))}
      </RadioListSection>
    </FormSheet>
  )
}
