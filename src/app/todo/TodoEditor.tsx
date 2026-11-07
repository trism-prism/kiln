// The form for a personal to-do: a title, an optional day and optional minutes. Used from the To Do
// page and the calendar day panel, for adding and editing.
import { useState, type FormEvent } from 'react'
import { Button } from '../../ui/button'
import { DateField } from '../../ui/date'
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
  const minutesError = mins !== undefined && !(/^\d+$/.test(minutes.trim()) && mins >= 0 && mins <= 1440) ? 'Enter whole minutes from 0 to 1440, or leave it empty.' : ''
  // The day field shows its own error; the form only waits until the text is fixed.
  const [dateBad, setDateBad] = useState(false)
  const [shown, setShown] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setShown(true)
    if (titleError || minutesError || dateBad || busy) return
    setBusy(true)
    if (await savePersonalTodo({ title: name, date: date || undefined, minutes: mins }, edit?.id)) onClose()
    else setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <TextField label="Title" value={title} onChange={setTitle} autoFocus isInvalid={shown && !!titleError} errorMessage={titleError} />
      <DateField label="Day (optional)" value={date} onChange={setDate} onInvalidChange={setDateBad} />
      <TextField
        label="Minutes (optional)"
        inputMode="numeric"
        value={minutes}
        onChange={setMinutes}
        isInvalid={shown && !!minutesError}
        errorMessage={minutesError}
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
