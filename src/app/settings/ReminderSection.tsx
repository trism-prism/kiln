import { useState } from 'react'
import { db, updateSettings, type SettingsRecord } from '../../data'
import { Button } from '../../ui/button'
import { Switch, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** Reminder times are only stored here; sending them is the PWA stage. */
export function ReminderSection({ settings }: { settings: SettingsRecord }) {
  const [time, setTime] = useState(settings.reminderTime)
  const [nudge, setNudge] = useState(settings.nudgeEnabled)
  const [nudgeTime, setNudgeTime] = useState(settings.nudgeTime)
  const valid = TIME.test(time) && (!nudge || TIME.test(nudgeTime))

  async function save() {
    await updateSettings(db, { reminderTime: time, nudgeEnabled: nudge, nudgeTime: TIME.test(nudgeTime) ? nudgeTime : settings.nudgeTime })
    toasts.add({ title: 'Reminders saved' }, { timeout: 4000 })
  }

  return (
    <Card>
      <section aria-labelledby="reminder-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="reminder-heading" className="text-base font-medium">Reminders</h2>
          <p className="text-sm text-text-muted">Times are saved now. Notifications start once Kiln is installed as an app.</p>
        </div>
        <TextField label="Daily reminder" type="time" value={time} onChange={setTime} className="max-w-48" />
        <Switch isSelected={nudge} onChange={setNudge}>
          Evening nudge if tasks remain
        </Switch>
        {nudge && <TextField label="Nudge time" type="time" value={nudgeTime} onChange={setNudgeTime} className="max-w-48" />}
        <div>
          <Button onPress={save} isDisabled={!valid}>Save reminders</Button>
        </div>
      </section>
    </Card>
  )
}
