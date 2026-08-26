import { EmptyState } from '../../ui/surface'
import { Page } from '../Page'

export default function BrushUpPage() {
  return (
    <Page title="Brush up">
      <EmptyState title="Nothing to brush up on">
        Topics you rate as shaky come back here, spaced out so you review them just before you would forget.
      </EmptyState>
    </Page>
  )
}
