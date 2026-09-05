import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings, type SettingsRecord } from '../../data'
import { availability, disablePush, enablePush, isPushOn, readPushEnv, syncPush, type PushAvailability } from '../../pwa/push-client'
import { Button, Link } from '../../ui/button'
import { Switch, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { failed } from './BudgetSection'

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** Why reminders cannot be turned on, in plain words. `ready` has no text. */
export const unavailableText: Record<Exclude<PushAvailability, 'ready'>, string> = {
  unsupported: 'This browser cannot show reminders. Try Chrome, Edge or Firefox, or Safari on iOS 16.4 or later with Kiln added to your Home Screen.',
  'needs-install':
    'On iPhone and iPad, reminders only work from the installed app. Tap the Share button in Safari, choose Add to Home Screen, open Kiln from your Home Screen, then come back here.',
  'not-configured':
    'This build is not connected to the Kiln server (VITE_API_URL and VITE_VAPID_PUBLIC_KEY are not set), so reminders are off. They work in the deployed app.',
  denied: "Notifications are blocked for Kiln. Allow them in your browser's site settings (or your device's settings), then come back and turn reminders on.",
}

/** Reminder times, and the switch that asks permission and subscribes this device to push. */
export function ReminderSection({ settings }: { settings: SettingsRecord }) {
  const [time, setTime] = useState(settings.reminderTime)
  const [nudge, setNudge] = useState(settings.nudgeEnabled)
  const [nudgeTime, setNudgeTime] = useState(settings.nudgeTime)
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)
  const on = useLiveQuery(() => isPushOn(db))
  const valid = TIME.test(time) && (!nudge || TIME.test(nudgeTime))
  const state = availability(readPushEnv())
  const times = { reminderTime: time, nudgeEnabled: nudge, nudgeTime: TIME.test(nudgeTime) ? nudgeTime : settings.nudgeTime }

  async function save() {
    try {
      await updateSettings(db, times)
    } catch (e) {
      return failed(e)
    }
    // When reminders are on, the server needs the new times too.
    const sent = await syncPush(db, times).catch(() => undefined)
    if (sent && sent !== 'skipped' && !sent.ok) {
      setProblem(sent.message)
      toasts.add({ title: 'Saved on this device only', description: sent.message }, { timeout: 8000 })
      return
    }
    setProblem(undefined)
    toasts.add({ title: 'Reminders saved' }, { timeout: 4000 })
  }

  async function turnOn() {
    setBusy(true)
    setProblem(undefined)
    try {
      // Permission is requested first thing in here, while the button press still counts as a user gesture.
      const r = await enablePush(db, times)
      if (!r.ok) return setProblem(r.message)
      await updateSettings(db, times)
      toasts.add({ title: 'Reminders are on' }, { timeout: 4000 })
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setProblem(undefined)
    try {
      const { serverNotified } = await disablePush(db)
      toasts.add(
        { title: 'Reminders are off', description: serverNotified ? undefined : 'Could not reach the server; it will drop this device on its own.' },
        { timeout: 6000 },
      )
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <section aria-labelledby="reminder-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="reminder-heading" className="text-base font-medium">Reminders</h2>
          <p className="text-sm text-text-muted">
            A notification at your reminder time with today&apos;s task count. The server only knows your push address, reminder time and time zone; the count is worked out on your device.{' '}
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>
        <TextField label="Daily reminder" type="time" value={time} onChange={setTime} isInvalid={!TIME.test(time)} errorMessage="Enter a time" className="max-w-48" />
        <Switch isSelected={nudge} onChange={setNudge}>
          Evening nudge if tasks remain
        </Switch>
        {nudge && <TextField label="Nudge time" type="time" value={nudgeTime} onChange={setNudgeTime} isInvalid={!TIME.test(nudgeTime)} errorMessage="Enter a time" className="max-w-48" />}
        <div>
          <Button variant={on ? 'primary' : 'secondary'} onPress={save} isDisabled={!valid}>Save reminders</Button>
        </div>

        <div className="grid gap-3 border-t border-border pt-4" data-testid="push-state">
          {on === undefined ? null : on ? (
            <>
              <p className="text-sm">Reminders are on for this device.</p>
              <div>
                <Button variant="secondary" onPress={turnOff} isDisabled={busy}>Turn off reminders</Button>
              </div>
            </>
          ) : state === 'ready' ? (
            <div>
              <Button onPress={turnOn} isDisabled={!valid || busy}>{busy ? 'Turning on...' : 'Turn on reminders'}</Button>
            </div>
          ) : (
            <p role="note" className="text-sm text-text-muted">{unavailableText[state]}</p>
          )}
          {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
        </div>
      </section>
    </Card>
  )
}
