import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function TaskPage() {
  return (
    <Page title="Task">
      <EmptyState title="Task not found" action={<Link href="/todo">Back to To Do</Link>}>
        This task may belong to a plan that was removed.
      </EmptyState>
    </Page>
  )
}
