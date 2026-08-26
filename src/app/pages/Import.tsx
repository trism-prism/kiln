import { Link } from '../../ui/button'
import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function ImportPage() {
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
