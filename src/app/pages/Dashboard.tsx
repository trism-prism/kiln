import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function DashboardPage() {
  return (
    <Page title="Dashboard">
      <EmptyState title="No plans yet" action={<Link href="/import" variant="primary">Import a plan</Link>}>
        Import a study plan and Kiln turns it into a daily list with due dates, reviews and one LeetCode problem a day.
      </EmptyState>
    </Page>
  )
}
