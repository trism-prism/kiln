// The two "Copy prompt" buttons: the prompt files under docs/prompts, with the field reference filled in.
import { Copy } from 'lucide-react'
import autoDates from '../../../docs/prompts/auto-dates.md?raw'
import fixedDates from '../../../docs/prompts/fixed-dates.md?raw'
import { buildPrompt } from '../../domain/plan-format'
import { Button } from '../../ui/button'
import { toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { copyText } from './Report'

async function copy(markdown: string, name: string) {
  const ok = await copyText(buildPrompt(markdown))
  toasts.add(
    ok
      ? { title: 'Prompt copied', description: `${name}. Paste it into your AI chat, then paste the plan it writes here.` }
      : { title: 'Could not copy the prompt', description: 'Your browser blocked clipboard access.' },
    { timeout: 6000 },
  )
}

export function PromptButtons() {
  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Make a plan with an AI chat</h2>
        <p className="text-sm text-text-muted">
          Copy a prompt, paste it into the AI chat you use, answer its questions, then paste the plan it writes into the box below.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Button onPress={() => copy(autoDates, 'Kiln assigns dates')}>
            <Copy /> Copy prompt (Kiln assigns dates)
          </Button>
          <p className="text-sm text-text-muted">
            The usual choice. The plan has no dates; Kiln places each task from your minutes per weekday.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <Button variant="secondary" onPress={() => copy(fixedDates, 'Fixed dates')}>
            <Copy /> Copy prompt (fixed dates)
          </Button>
          <p className="text-sm text-text-muted">
            For a plan with real dates, such as a class syllabus or an exam. The AI asks for your dates first.
          </p>
        </div>
      </div>
    </Card>
  )
}
