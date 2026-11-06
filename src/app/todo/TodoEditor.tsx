// The form for a personal to-do: a title, an optional day and optional minutes. Used from the To Do
// page and the calendar day panel, for adding and editing.
import { useState, type FormEvent } from 'react'
import { isRealISODate } from '../../lib/date'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { Sheet } from '../../ui/overlay'
import { savePersonalTodo } from '../actions'

export interface TodoEdit {
  id: string
  title: string
  date?: string
  minutes?: number
}

function Form({ edit, defaultDate, onClose }: { edit?: TodoEdit; defaultDate?: string; onClose: () => void }) {
  const [title, setTitle] = useState(edit?.title ?? '')
  const [date, setDate] = useState(edit ? (edit.date ?? '') : (defaultDate ?? ''))
  const [minutes, setMinutes] = useState(edit?.minutes === undefined ? '' : String(edit.minutes))
  const [busy, setBusy] = useState(false)
  const name = title.trim()
  const mins = minutes.trim() === '' ? undefined : Number(minutes)
  const titleError = name.length === 0 ? 'Enter a title.' : name.length > 300 ? 'Use 300 characters or fewer.' : ''
  const minutesError = mins !== undefined && !(Number.isInteger(mins) && mins >= 0 && mins <= 1440) ? 'Enter whole minutes from 0 to 1440, or leave it empty.' : ''
  const dateError = date && !isRealISODate(date) ? 'Pick a real date, or leave it empty.' : ''
  const [shown, setShown] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setShown(true)
    if (titleError || minutesError || dateError || busy) return
    setBusy(true)
    if (await savePersonalTodo({ title: name, date: date || undefined, minutes: mins }, edit?.id)) onClose()
    else setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <TextField label="Title" value={title} onChange={setTitle} autoFocus isInvalid={shown && !!titleError} errorMessage={titleError} />
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="todo-date" className="font-medium">
          Day (optional)
        </label>
        <input
          id="todo-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={shown && !!dateError}
          className="h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text"
        />
        {shown && dateError ? <p className="text-sm text-danger">{dateError}</p> : <p className="text-sm text-text-muted">With no day, the to-do is listed under today and never overdue.</p>}
      </div>
      <TextField
        label="Minutes (optional)"
        inputMode="numeric"
        value={minutes}
        onChange={setMinutes}
        isInvalid={shown && !!minutesError}
        errorMessage={minutesError}
        description="With a day and minutes, it counts toward that day's study time."
      />
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onPress={onClose}>
          Cancel
        </Button>
        <Button type="submit" isDisabled={busy}>
          {edit ? 'Save' : 'Add to-do'}
        </Button>
      </div>
    </form>
  )
}

export function TodoEditor({ isOpen, onClose, edit, defaultDate }: { isOpen: boolean; onClose: () => void; edit?: TodoEdit; defaultDate?: string }) {
  return (
    <Sheet title={edit ? 'Edit to-do' : 'Add to-do'} isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Form edit={edit} defaultDate={defaultDate} onClose={onClose} />
    </Sheet>
  )
}
