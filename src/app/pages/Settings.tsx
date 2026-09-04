import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, scheduleAll } from '../../data'
import { toLocalISODate } from '../../lib/date'
import { Button, Link } from '../../ui/button'
import { ListBoxItem, Select } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { Card, Skeleton } from '../../ui/surface'
import { Page } from '../Page'
import { readTheme, saveTheme, type Theme } from '../theme'
import { BlackoutSection, BudgetSection } from '../settings/BudgetSection'
import { BackupSection, DangerSection } from '../settings/DataSection'
import { InstallSection } from '../settings/InstallSection'
import { ReminderSection } from '../settings/ReminderSection'
import { SyncSection } from '../settings/SyncSection'

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [offer, setOffer] = useState(false)
  const settings = useLiveQuery(() => getSettings(db))

  async function reschedule() {
    try {
      await scheduleAll(db, toLocalISODate(new Date()), { mode: 'reschedule' })
      setOffer(false)
      toasts.add({ title: 'Rescheduled', description: 'Overdue tasks now fit your study time.' }, { timeout: 5000 })
    } catch (e) {
      toasts.add({ title: 'Could not reschedule', description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })
    }
  }

  return (
    <Page title="Settings">
      <div className="grid max-w-3xl gap-6">
        {offer && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-surface-raised p-4 text-sm">
            <span>Your study time changed. Reschedule to fit overdue tasks into the new days.</span>
            <div className="flex gap-2">
              <Button onPress={reschedule}>Reschedule now</Button>
              <Button variant="quiet" onPress={() => setOffer(false)}>Not now</Button>
            </div>
          </div>
        )}
        {settings ? (
          <>
            <BudgetSection key={`${settings.minutesPerWeekday.join(',')}${settings.weekStartsOn}`} settings={settings} onChanged={() => setOffer(true)} />
            <BlackoutSection settings={settings} onChanged={() => setOffer(true)} />
            <ReminderSection key={`${settings.reminderTime}${settings.nudgeEnabled}${settings.nudgeTime}`} settings={settings} />
          </>
        ) : (
          <Skeleton className="h-64" />
        )}
        <SyncSection />
        <Card>
          <Select
            label="Theme"
            description="System matches your device's light or dark setting"
            selectedKey={theme}
            onSelectionChange={(key) => {
              const t = key as Theme
              setTheme(t)
              saveTheme(t)
            }}
            className="max-w-sm"
          >
            <ListBoxItem id="system">System</ListBoxItem>
            <ListBoxItem id="light">Light</ListBoxItem>
            <ListBoxItem id="dark">Dark</ListBoxItem>
          </Select>
        </Card>
        <InstallSection />
        <BackupSection />
        <DangerSection />
        <p className="text-sm text-text-muted">
          <Link href="/privacy">Privacy: what Kiln stores and sends</Link>
        </p>
      </div>
    </Page>
  )
}
