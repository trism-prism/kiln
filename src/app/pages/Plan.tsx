import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function PlanPage() {
  return (
    <Page title="Plan">
      <EmptyState title="Plan not found" action={<Link href="/plans">Back to Plans</Link>}>
        This plan may have been removed.
      </EmptyState>
    </Page>
  )
}
