import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, updateSettings } from '../../data'
import { addDaysISO, toLocalISODate } from '../../lib/date'
import { finishOnboarding, META_START_DATE, readOnboardingFacts, shouldShowOnboarding } from '../../pwa/onboarding'
import { setMeta } from '../../pwa/meta'
import { availability, enablePush, readPushEnv } from '../../pwa/push-client'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { unavailableText } from '../settings/ReminderSection'
import { formatHours, parseMinutes, WEEKDAYS, weekTotal } from '../settings/budget'

// "Load sample plan" exists only in development and end-to-end builds. The condition is written out
// here (not read through a helper) so the production build drops the import and the fixture data with it.
const loadSample = import.meta.env.DEV || import.meta.env.VITE_E2E === '1' ? () => import('./sample') : undefined

/** Weekday minutes (Monday to Friday) and weekend minutes. */
const PRESETS = [
  { name: 'Light', weekday: 60, weekend: 90 },
  { name: 'Steady', weekday: 120, weekend: 180 },
  { name: 'Heavy', weekday: 180, weekend: 240 },
]
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const STEPS = ['Study time', 'Start date', 'Reminder', 'Your plan'] as const

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * A short first-run setup above the dashboard. It decides once, when the page first loads, whether
 * to show: saving settings in step 1 would otherwise make it vanish halfway through.
 */
export function Onboarding() {
  const facts = useLiveQuery(() => readOnboardingFacts(db))
  const [show, setShow] = useState<boolean>()
  if (show === undefined && facts) setShow(shouldShowOnboarding(facts))
  if (!show) return null
  return <Flow onClose={() => setShow(false)} />
}

function Flow({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const today = toLocalISODate(new Date())
  const [step, setStep] = useState(0)
  const [values, setValues] = useState(['120', '120', '120', '120', '120', '180', '180'])
  const [start, setStart] = useState(today)
  const [time, setTime] = useState('08:00')
  const [pushOn, setPushOn] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)

  const parsed = values.map(parseMinutes)
  const budgetOk = parsed.every((v) => v !== undefined)
  const startOk = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start)
  const timeOk = TIME.test(time)
  const push = availability(readPushEnv())

  async function done(then?: () => void | Promise<void>) {
    setBusy(true)
    setProblem(undefined)
    try {
      await finishOnboarding(db)
      await then?.()
      onClose()
    } catch (e) {
      setProblem(message(e))
    } finally {
      setBusy(false)
    }
  }

  async function next() {
    setProblem(undefined)
    try {
      if (step === 0) await updateSettings(db, { minutesPerWeekday: parsed as number[] })
      if (step === 1) await setMeta(db, META_START_DATE, start)
      if (step === 2) await updateSettings(db, { reminderTime: time })
      setStep(step + 1)
    } catch (e) {
      setProblem(message(e))
    }
  }

  async function turnOnReminders() {
    setBusy(true)
    setProblem(undefined)
    try {
      // First thing in the press handler, so the permission request still counts as a user gesture.
      const r = await enablePush(db, { reminderTime: time, nudgeEnabled: false, nudgeTime: '20:00' })
      if (r.ok) {
        await updateSettings(db, { reminderTime: time })
        setPushOn(true)
      } else setProblem(r.message)
    } catch (e) {
      setProblem(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="onboarding-heading" className="border-b border-border bg-surface-raised">
      <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="onboarding-heading" className="text-lg font-medium">Set up Kiln</h2>
          <p className="text-sm text-text-muted" aria-live="polite">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>

        {step === 0 && (
          <div className="grid gap-4">
            <p className="text-sm text-text-muted">How many minutes can you study on each weekday? Pick a starting point, then adjust.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  variant="secondary"
                  onPress={() => setValues([...Array<string>(5).fill(String(p.weekday)), String(p.weekend), String(p.weekend)])}
                >
                  {p.name}: {p.weekday} min weekdays, {p.weekend} weekends
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {WEEKDAYS.map((day, i) => (
                <TextField
                  key={day}
                  label={day}
                  inputMode="numeric"
                  value={values[i]}
                  onChange={(v) => setValues(values.map((x, j) => (j === i ? v : x)))}
                  isInvalid={parsed[i] === undefined}
                  errorMessage="0 to 1440"
                />
              ))}
            </div>
            <p className="text-sm text-text-muted">Week total: {formatHours(weekTotal(values))}</p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3">
            <p className="text-sm text-text-muted">The day your first plan starts. You can change it per plan when you import.</p>
            <TextField label="Start date" type="date" value={start} onChange={setStart} isInvalid={!startOk} errorMessage="Choose a date" className="max-w-48" />
            <Button variant="quiet" className="justify-self-start" onPress={() => setStart(addDaysISO(today, 1))}>Use tomorrow</Button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            <p className="text-sm text-text-muted">A daily notification with your task count. Optional: you can turn it on later in Settings.</p>
            <TextField label="Reminder time" type="time" value={time} onChange={setTime} isInvalid={!timeOk} errorMessage="Enter a time" className="max-w-48" />
            {pushOn ? (
              <p role="status" className="text-sm text-success">Reminders are on.</p>
            ) : push === 'ready' ? (
              <Button variant="secondary" className="justify-self-start" onPress={turnOnReminders} isDisabled={!timeOk || busy}>Turn on reminders</Button>
            ) : (
              <p role="note" className="text-sm text-text-muted">{unavailableText[push]}</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            <p className="text-sm text-text-muted">Kiln schedules a study plan you bring. Import one from your AI tool or a spreadsheet to fill your To Do list.</p>
            <div className="flex flex-wrap gap-2">
              <Button onPress={() => void done(() => void navigate('/import'))} isDisabled={busy}>Import a plan</Button>
              {loadSample && (
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() =>
                    void done(async () => {
                      await (await loadSample()).loadSamplePlan(start)
                      toasts.add({ title: 'Sample plan loaded' }, { timeout: 4000 })
                    })
                  }
                >
                  Load sample plan
                </Button>
              )}
            </div>
          </div>
        )}

        {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {step > 0 && <Button variant="secondary" onPress={() => setStep(step - 1)} isDisabled={busy}>Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button onPress={() => void next()} isDisabled={busy || (step === 0 && !budgetOk) || (step === 1 && !startOk) || (step === 2 && !timeOk)}>
              Next
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => void done()} isDisabled={busy}>Finish without a plan</Button>
          )}
          <Button variant="quiet" onPress={() => void done()} isDisabled={busy}>Skip setup</Button>
        </div>
      </div>
    </section>
  )
}
