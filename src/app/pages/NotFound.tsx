import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function NotFoundPage() {
  return (
    <Page title="Page not found">
      <EmptyState title="There is nothing at this address" action={<Link href="/">Go to Dashboard</Link>}>
        The link may be out of date.
      </EmptyState>
    </Page>
  )
}
