import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function CalendarPage() {
  return (
    <Page title="Calendar">
      <EmptyState title="Your calendar is empty" action={<Link href="/import" variant="primary">Import a plan</Link>}>
        Once a plan is imported, each day shows its tasks. Drag a task to another day to reschedule it.
      </EmptyState>
    </Page>
  )
}
