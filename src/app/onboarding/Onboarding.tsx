import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Radio, RadioGroup } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { db, updateSettings } from '../../data'
import { canSeed, loadSamplePlans } from '../devSeed'
import { addDaysISO, toLocalISODate } from '../../lib/date'
import { finishOnboarding, markOnboardingStarted, META_START_DATE, readOnboardingFacts, shouldShowOnboarding } from '../../pwa/onboarding'
import { setMeta } from '../../pwa/meta'
import { availability, enablePush, readPushEnv } from '../../pwa/push-client'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { TimeInput } from '../../ui/time'
import { toasts } from '../../ui/overlay'
import { unavailableText } from '../settings/ReminderSection'
import { formatHours, parseMinutes } from '../settings/budget'
import { WeekdayMinutes } from '../settings/WeekdayMinutes'

// "Load sample plan" exists only in development and e2e builds (src/app/devSeed.ts drops the fixtures from production).

/** Weekday minutes (Monday to Friday) and weekend minutes. */
const PRESETS = [
  { name: 'Light', weekday: 30, weekend: 60 },
  { name: 'Steady', weekday: 60, weekend: 90 },
  { name: 'Focused', weekday: 90, weekend: 120 },
  { name: 'Intense', weekday: 120, weekend: 180 },
]
const byName = (name: string) => PRESETS.find((p) => p.name === name) ?? (PRESETS[0] as (typeof PRESETS)[number])
const presetValues = (p: (typeof PRESETS)[number]) => [...Array<string>(5).fill(String(p.weekday)), String(p.weekend), String(p.weekend)]
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const STEPS = ['Study time', 'Start date', 'Reminder', 'Your plan'] as const

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * A short first-run setup above the dashboard. It decides when it first loads whether to show, and
 * keeps showing: saving settings in step 1 would otherwise make it vanish halfway through. The
 * "started" flag brings it back if the person leaves before finishing.
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
  useEffect(() => {
    void markOnboardingStarted(db)
  }, [])
  const [values, setValues] = useState(() => presetValues(byName('Steady')))
  const [start, setStart] = useState(today)
  const [time, setTime] = useState('08:00')
  const [pushOn, setPushOn] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)
  // The button that was pressed disappears when reminders turn on; move focus to the message that replaces it.
  const note = useRef<HTMLParagraphElement | null>(null)
  const onNote = (el: HTMLParagraphElement | null) => {
    if (el && !note.current) el.focus()
    note.current = el
  }

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
            <h3 className="text-base font-medium">How many minutes can you study?</h3>
            <p className="text-sm text-text-muted">Pick a starting point, then change any day below.</p>
            <RadioGroup
              aria-label="Study time presets"
              value={PRESETS.find((p) => presetValues(p).join() === values.join())?.name ?? ''}
              onChange={(name) => setValues(presetValues(byName(name)))}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {PRESETS.map((p) => (
                <Radio
                  key={p.name}
                  value={p.name}
                  className="grid cursor-default content-start gap-1 rounded-lg border border-border-strong bg-surface-raised p-3 text-sm outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-surface data-selected:border-accent data-selected:ring-1 data-selected:ring-accent"
                >
                  <span className="font-medium">{p.name}</span>
                  <span>{p.weekday} min weekdays, {p.weekend} min weekends</span>
                  <span className="text-text-muted">{formatHours(p.weekday * 5 + p.weekend * 2)} per week</span>
                </Radio>
              ))}
            </RadioGroup>
            <WeekdayMinutes values={values} onChange={setValues} />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3">
            <TextField label="Start date" type="date" value={start} onChange={setStart} isInvalid={!startOk} errorMessage="Choose a date" className="max-w-48" />
            <Button variant="quiet" className="justify-self-start" onPress={() => setStart(addDaysISO(today, 1))}>Use tomorrow</Button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            {push === 'ready' && !pushOn && <p className="text-sm text-text-muted">Get a daily reminder of what's due. You can change this later in Settings.</p>}
            <TimeInput label="Reminder time" value={time} onChange={setTime} isInvalid={!timeOk} />
            {pushOn ? (
              <p role="status" tabIndex={-1} ref={onNote} className="text-sm text-success outline-none">Reminders are on.</p>
            ) : push === 'ready' ? (
              <Button variant="secondary" className="justify-self-start" onPress={turnOnReminders} isDisabled={!timeOk || busy}>Turn on reminders</Button>
            ) : (
              <p role="note" className="text-sm text-text-muted">{unavailableText[push]}</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            <p className="text-sm text-text-muted">Bring a plan from an AI chat or a spreadsheet.</p>
            <div className="flex flex-wrap gap-2">
              <Button onPress={() => void done(() => void navigate('/import'))} isDisabled={busy}>Import a plan</Button>
              {canSeed && (
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() =>
                    void done(async () => {
                      await loadSamplePlans()
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
