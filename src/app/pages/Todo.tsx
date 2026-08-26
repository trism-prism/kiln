import { EmptyState } from '../../ui/surface'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'
import { Page } from '../Page'

const ranges = [
  { id: 'today', label: 'Today', empty: 'Nothing due today' },
  { id: 'week', label: '7 days', empty: 'Nothing due in the next 7 days' },
  { id: 'month', label: '28 days', empty: 'Nothing due in the next 28 days' },
]

export default function TodoPage() {
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
