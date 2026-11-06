import { useState } from 'react'
import { Link } from '../ui/button'
import { ListBoxItem, Select } from '../ui/form'
import { EmptyState } from '../ui/surface'
import { Tab, TabList, TabPanel, Tabs } from '../ui/tabs'
import { Page } from './Page'
import { readTheme, saveTheme, type Theme } from './theme'

const importLink = (
  <Link href="/import" variant="primary">
    Import a plan
  </Link>
)

export function DashboardPage() {
  return (
    <Page title="Dashboard">
      <EmptyState title="No plans yet" action={importLink}>
        Import a study plan and Kiln turns it into a daily list with due dates, reviews and one LeetCode problem a day.
      </EmptyState>
    </Page>
  )
}

const ranges = [
  { id: 'today', label: 'Today', empty: 'Nothing due today' },
  { id: 'week', label: '7 days', empty: 'Nothing due in the next 7 days' },
  { id: 'month', label: '28 days', empty: 'Nothing due in the next 28 days' },
]

export function TodoPage() {
  return (
    <Page title="To Do">
      <Tabs>
        <TabList aria-label="Range">
          {ranges.map((r) => (
            <Tab key={r.id} id={r.id}>
              {r.label}
            </Tab>
          ))}
        </TabList>
        {ranges.map((r) => (
          <TabPanel key={r.id} id={r.id}>
            <EmptyState title={r.empty}>
              Tasks from your plans show up here on the day they are due. Overdue tasks stay at the top until you finish
              them.
            </EmptyState>
          </TabPanel>
        ))}
      </Tabs>
    </Page>
  )
}

export function TaskPage() {
  return (
    <Page title="Task">
      <EmptyState title="Task not found" action={<Link href="/todo">Back to To Do</Link>}>
        This task may belong to a plan that was removed.
      </EmptyState>
    </Page>
  )
}

export function CalendarPage() {
  return (
    <Page title="Calendar">
      <EmptyState title="Your calendar is empty" action={importLink}>
        Once a plan is imported, each day shows its tasks. Drag a task to another day to reschedule it.
      </EmptyState>
    </Page>
  )
}

export function PlansPage() {
  return (
    <Page title="Plans">
      <EmptyState title="No plans yet" action={importLink}>
        Each plan lists its modules and topics in order, with your progress through each one.
      </EmptyState>
    </Page>
  )
}

export function PlanPage() {
  return (
    <Page title="Plan">
      <EmptyState title="Plan not found" action={<Link href="/plans">Back to Plans</Link>}>
        This plan may have been removed.
      </EmptyState>
    </Page>
  )
}

export function BrushUpPage() {
  return (
    <Page title="Brush up">
      <EmptyState title="Nothing to brush up on">
        Topics you rate as shaky come back here, spaced out so you review them just before you would forget.
      </EmptyState>
    </Page>
  )
}

export function ImportPage() {
  return (
    <Page title="Import">
      <EmptyState title="Import a plan">
        Paste a plan generated with the Kiln prompt, or fill in a template:{' '}
        <Link href="/kiln-plan-template.csv" download>
          CSV
        </Link>{' '}
        or{' '}
        <Link href="/kiln-plan-template.xlsx" download>
          Excel
        </Link>
        .
      </EmptyState>
    </Page>
  )
}

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  return (
    <Page title="Settings">
      <div className="max-w-sm">
        <Select
          label="Theme"
          description="System matches your device's light or dark setting"
          selectedKey={theme}
          onSelectionChange={(key) => {
            const t = key as Theme
            setTheme(t)
            saveTheme(t)
          }}
        >
          <ListBoxItem id="system">System</ListBoxItem>
          <ListBoxItem id="light">Light</ListBoxItem>
          <ListBoxItem id="dark">Dark</ListBoxItem>
        </Select>
      </div>
    </Page>
  )
}

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <EmptyState title="There is nothing at this address" action={<Link href="/">Go to Dashboard</Link>}>
        The link may be out of date.
      </EmptyState>
    </Page>
  )
}
