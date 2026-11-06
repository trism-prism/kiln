import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../../data'
import { Button, Link } from '../../ui/button'
import { ListBoxItem, Select } from '../../ui/form'
import { Card, Skeleton } from '../../ui/surface'
import { rescheduleOverdue } from '../actions'
import { CONTACT_EMAIL } from '../contact'
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
    if (await rescheduleOverdue()) setOffer(false)
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
        <nav aria-label="About Kiln" className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Link variant="quiet" href="/privacy">Privacy</Link>
          <Link variant="quiet" href="/terms">Terms of use</Link>
          <Link variant="quiet" href="/licenses">Open-source licenses</Link>
          <Link variant="quiet" href={`mailto:${CONTACT_EMAIL}`}>Contact</Link>
        </nav>
      </div>
    </Page>
  )
}
