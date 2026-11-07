// "Log study time": study done outside any plan, saved as a finished personal to-do so it counts toward
// the streak and the heatmap. It then shows in To Do (with completed items shown), where it can be fixed.
import { useState } from 'react'
import { DateField } from '../../ui/date'
import { TextField } from '../../ui/form'
import { FormSheet } from '../../ui/overlay'
import { logStudyTime } from '../actions'
import { parseLine } from '../import/quick-add'

export const MAX_LOG_MINUTES = 600

/** Minutes as people type them: "30", "45m", "1h", "1h 30m", "1.5 hours". Undefined for anything else. */
export function parseStudyMinutes(text: string): number | undefined {
  const t = text.trim()
  if (/^[0-9]+$/.test(t)) return Number(t)
  // Quick add reads durations; the text must be nothing but a duration.
  const p = parseLine(t, '2000-01-01')
  return p.title === '' && p.minutes !== undefined && !p.due && !p.priority && p.links.length === 0 ? Number(p.minutes) : undefined
}

export function LogTimeSheet({ isOpen, today, onClose }: { isOpen: boolean; today: string; onClose: () => void }) {
  const [subject, setSubject] = useState('')
  const [minutes, setMinutes] = useState('')
  const [date, setDate] = useState(today)
  const [dateBad, setDateBad] = useState(false)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  // Each opening starts blank on today (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setSubject('')
      setMinutes('')
      setDate(today)
      setDateBad(false)
      setShown(false)
      setBusy(false)
    }
  }

  const title = subject.trim()
  const mins = parseStudyMinutes(minutes)
  const subjectError = title === '' ? 'Add a subject' : title.length > 300 ? 'Use 300 characters or fewer' : ''
  const minutesError = mins === undefined || mins < 1 || mins > MAX_LOG_MINUTES ? 'Enter the minutes, like 30' : ''
  // An emptied day field is the one problem the field itself doesn't report.
  const dateError = date === '' ? 'Pick today or earlier' : ''

  const save = async () => {
    setShown(true)
    if (subjectError || minutesError || dateError || dateBad || busy) return
    setBusy(true)
    if (await logStudyTime(title, mins!, date)) onClose()
    else setBusy(false)
  }

  return (
    <FormSheet title="Log Study Time" isOpen={isOpen} onCancel={onClose} onDone={() => void save()} doneLabel="Save">
      <form
        noValidate
        className="grid gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label="Subject" value={subject} onChange={setSubject} autoFocus isInvalid={shown && !!subjectError} errorMessage={subjectError} />
        <TextField label="Minutes" value={minutes} onChange={setMinutes} isInvalid={shown && !!minutesError} errorMessage={minutesError} />
        <DateField label="Day" value={date} onChange={setDate} max={today} onInvalidChange={setDateBad} isInvalid={shown && !!dateError} errorMessage={dateError} />
        {/* Enter in a field submits; the visible Save is in the sheet's header. */}
        <button type="submit" hidden />
      </form>
    </FormSheet>
  )
}
