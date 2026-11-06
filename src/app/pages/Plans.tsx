import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function PlansPage() {
  return (
    <Page title="Plans">
      <EmptyState title="No plans yet" action={<Link href="/import" variant="primary">Import a plan</Link>}>
        Each plan lists its modules and topics in order, with your progress through each one.
      </EmptyState>
    </Page>
  )
}
