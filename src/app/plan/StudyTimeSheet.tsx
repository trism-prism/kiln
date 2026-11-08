// "Add Study Time" / "Edit Study Time": a study time plan is a subject and a time per week; Kiln plans one
// session a day on study days (domain/scheduler/study.ts). Edit mode changes the subject, time and end date.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { db, getSettings, isStudyPlan, listPlans, type PlanRecord } from '../../data'
import { round5, weekCapacity } from '../../domain/scheduler'
import { Link } from '../../ui/button'
import { DateField } from '../../ui/date'
import { TextField } from '../../ui/form'
import { FormSheet } from '../../ui/overlay'
import { addStudyPlan, saveStudyPlan } from '../actions'
import { parseStudyMinutes } from '../import/quick-add'
import { minutesText } from '../parts'

export const MIN_STUDY_WEEK = 15
export const MAX_STUDY_WEEK = 2400

/** The error for a typed time per week, or '' when it can be used. */
export function weeklyTimeError(text: string): string {
  const m = parseStudyMinutes(text)
  if (m === undefined) return 'Enter the time, like 3h or 90m'
  if (m < MIN_STUDY_WEEK) return 'At least 15 min, like 3h or 90m'
  if (m > MAX_STUDY_WEEK) return 'Up to 40 h a week'
  return ''
}

/**
 * The line under "Time per week": what the time comes to a day, or why it doesn't fit. `others` is the weekly time of
 * the other study time plans that haven't ended.
 */
export function studyLine(minutes: number | undefined, minutesPerWeekday: number[], others: number): { text: string; warning: boolean; settings?: boolean } | undefined {
  const days = minutesPerWeekday.slice(0, 7).filter((m) => m > 0).length
  if (days === 0) return { text: 'You have no study days yet. Set your minutes per weekday in', warning: true, settings: true }
  if (minutes === undefined) return undefined
  const cap = weekCapacity(minutesPerWeekday)
  if (minutes > cap) return { text: `That's more than the ${minutesText(cap)} a week you have, so Kiln plans ${minutesText(cap)}.`, warning: true }
  if (minutes + others > cap) {
    return { text: `Your study time plans add up to ${minutesText(minutes + others)} a week, more than the ${minutesText(cap)} you have. Kiln shares the ${minutesText(cap)} between them.`, warning: true }
  }
  return { text: `About ${minutesText(Math.max(5, round5(minutes / days)))} a day on your ${days} study ${days === 1 ? 'day' : 'days'}.`, warning: false }
}

export function StudyTimeSheet({ isOpen, today, onClose, plan }: { isOpen: boolean; today: string; onClose: () => void; plan?: PlanRecord }) {
  const navigate = useNavigate()
  const editing = plan !== undefined
  const [subject, setSubject] = useState('')
  const [time, setTime] = useState('')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState('')
  const [startBad, setStartBad] = useState(false)
  const [endBad, setEndBad] = useState(false)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  // Each opening starts from the plan (or blank on today), adjusting state during render rather than in an effect.
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setSubject(plan?.title ?? '')
      setTime(plan?.studyMinutesPerWeek ? minutesText(plan.studyMinutesPerWeek).replace(' min', 'm').replace(' ', '') : '')
      setStart(plan?.startDate ?? today)
      setEnd(plan?.deadline ?? '')
      setStartBad(false)
      setEndBad(false)
      setShown(false)
      setBusy(false)
    }
  }
  const ctx = useLiveQuery(async () => ({ plans: await listPlans(db), settings: await getSettings(db) }))

  const title = subject.trim()
  const minutes = parseStudyMinutes(time)
  const subjectError = title === '' ? 'Add a subject' : title.length > 120 ? 'Use 120 characters or fewer' : ''
  const timeError = weeklyTimeError(time)
  const startError = !editing && start === '' ? 'Pick today or later' : ''
  const endError = end !== '' && end < start ? 'Pick a day after it starts' : ''
  const others = (ctx?.plans ?? []).filter((p) => isStudyPlan(p) && p.id !== plan?.id && (!p.deadline || p.deadline >= today)).reduce((n, p) => n + p.studyMinutesPerWeek!, 0)
  const line = ctx && studyLine(timeError ? undefined : minutes, ctx.settings.minutesPerWeekday, others)

  const save = async () => {
    setShown(true)
    if (subjectError || timeError || startError || endError || startBad || endBad || busy) return
    setBusy(true)
    const fields = { title, minutesPerWeek: minutes!, deadline: end || undefined }
    if (plan) {
      if (await saveStudyPlan(plan.id, fields)) onClose()
      else setBusy(false)
      return
    }
    const id = await addStudyPlan({ ...fields, startDate: start })
    if (!id) return setBusy(false)
    onClose()
    void navigate(`/plans/${id}`)
  }

  return (
    <FormSheet title={editing ? 'Edit Study Time' : 'Add Study Time'} isOpen={isOpen} onCancel={onClose} onDone={() => void save()} doneLabel={editing ? 'Save' : 'Add'}>
      <form
        noValidate
        className="grid gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label="Subject" value={subject} onChange={setSubject} autoFocus isInvalid={shown && !!subjectError} errorMessage={subjectError} />
        <TextField
          label="Time per week"
          value={time}
          onChange={setTime}
          isInvalid={shown && !!timeError}
          errorMessage={timeError}
          description={
            line &&
            (line.warning ? (
              <span className="text-warning">
                {line.text}
                {line.settings && (
                  <>
                    {' '}
                    <Link href="/settings">Settings</Link>.
                  </>
                )}
              </span>
            ) : (
              line.text
            ))
          }
        />
        {!editing && <DateField label="Starts" value={start} onChange={setStart} min={today} onInvalidChange={setStartBad} isInvalid={shown && !!startError} errorMessage={startError} />}
        <DateField label="Ends (optional)" value={end} onChange={setEnd} min={start || today} onInvalidChange={setEndBad} isInvalid={shown && !!endError} errorMessage={endError} />
        {/* Enter in a field submits; the visible Add or Save is in the sheet's header. */}
        <button type="submit" hidden />
      </form>
    </FormSheet>
  )
}
