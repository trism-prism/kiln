// The two "Copy prompt" buttons: the prompt files under docs/prompts, with the field reference filled in.
import autoDates from '../../../docs/prompts/auto-dates.md?raw'
import fixedDates from '../../../docs/prompts/fixed-dates.md?raw'
import { buildPrompt } from '../../domain/plan-format'
import { Card } from '../../ui/surface'
import { CopyButton } from './Report'

export function PromptButtons() {
  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Make a plan with an AI chat</h2>
        <p className="text-sm text-text-muted">Copy a prompt into any AI chat, answer its questions, then paste its reply below.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <CopyButton aria-describedby="prompt-auto" getText={() => buildPrompt(autoDates)}>
            Copy prompt
          </CopyButton>
          <p id="prompt-auto" className="text-sm text-text-muted">
            Let Kiln assign dates based on your minutes per weekday.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <CopyButton variant="secondary" aria-describedby="prompt-fixed" getText={() => buildPrompt(fixedDates)}>
            Copy prompt
          </CopyButton>
          <p id="prompt-fixed" className="text-sm text-text-muted">
            Assign the dates yourself. The AI will ask you.
          </p>
        </div>
      </div>
    </Card>
  )
}
