import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { BuildTab } from '../import/BuildTab'
import { CalendarTab } from '../import/CalendarTab'
import { ImportTab } from '../import/ImportTab'
import { PromptButtons } from '../import/PromptButtons'
import { Button } from '../../ui/button'
import { Card } from '../../ui/surface'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'
import { Page } from '../Page'
import { StudyTimeSheet } from '../plan/StudyTimeSheet'
import { useToday } from '../queries'

// shouldForceMount keeps both tabs' forms alive while the other tab is showing; Tabs marks the
// hidden panel `data-inert`.
const keep = 'in-data-inert:hidden'

export default function ImportPage() {
  // ?tab=calendar opens a tab directly (the calendar feed notice links there).
  const [params] = useSearchParams()
  const today = useToday()
  const [adding, setAdding] = useState(false)
  return (
    <Page title="Import">
      <div className="grid max-w-3xl gap-8">
        <PromptButtons />
        <Card className="grid gap-3">
          <h2 className="text-base font-medium">Study time</h2>
          {/* The one line stays: the sessions it makes show up on later days, not here. */}
          <p className="text-sm text-text-muted">Pick a subject and the time you want each week. Kiln plans a session on your study days.</p>
          <div>
            <Button variant="secondary" onPress={() => setAdding(true)}>
              Add study time
            </Button>
          </div>
        </Card>
        <StudyTimeSheet isOpen={adding} today={today} onClose={() => setAdding(false)} />
        <Tabs className="data-focus-visible:outline-none" defaultSelectedKey={params.get('tab') ?? 'import'}>
          <TabList aria-label="How to add a plan">
            <Tab id="import">Import a plan</Tab>
            <Tab id="build">Quick add</Tab>
            <Tab id="calendar">From a course calendar</Tab>
          </TabList>
          <TabPanel id="import" shouldForceMount>
            <div className={keep}>
              <ImportTab />
            </div>
          </TabPanel>
          <TabPanel id="build" shouldForceMount>
            <div className={keep}>
              <BuildTab />
            </div>
          </TabPanel>
          <TabPanel id="calendar" shouldForceMount>
            <div className={keep}>
              <CalendarTab />
            </div>
          </TabPanel>
        </Tabs>
      </div>
    </Page>
  )
}
