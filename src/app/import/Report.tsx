import { Copy } from 'lucide-react'
import { formatIssue, MAX_ISSUES, type Issue } from '../../domain/plan-format'
import { Button } from '../../ui/button'
import { toasts } from '../../ui/overlay'
import { splitIssues } from './logic'

/** Copies text; false when the browser refuses (no permission, insecure context). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function Group({ title, tone, issues }: { title: string; tone: string; issues: Issue[] }) {
  if (issues.length === 0) return null
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className={`text-sm font-medium ${tone}`}>
        {title} ({issues.length})
      </h3>
      <ul className="grid gap-1 font-mono text-sm break-words">
        {issues.map((issue, i) => (
          <li key={i}>{formatIssue(issue)}</li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Every problem found, errors first and warnings below, in the spec's message format
 * (docs/plan-import.md, "Error format"). Errors block the import; warnings do not.
 */
export function Report({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null
  const { errors, warnings } = splitIssues(issues)
  const copy = async () => {
    const ok = await copyText(issues.map(formatIssue).join('\n'))
    toasts.add({ title: ok ? 'Problems copied' : 'Could not copy', description: ok ? undefined : 'Select the text and copy it by hand.' }, { timeout: 4000 })
  }
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted" role="status">
          {errors.length > 0
            ? `${errors.length} ${errors.length === 1 ? 'error blocks' : 'errors block'} the import. Fix ${errors.length === 1 ? 'it' : 'them'} and paste again.`
            : 'No errors. Warnings do not block the import.'}
        </p>
        <Button variant="secondary" onPress={copy}>
          <Copy /> Copy
        </Button>
      </div>
      <Group title="Errors" tone="text-danger" issues={errors} />
      <Group title="Warnings" tone="text-warning" issues={warnings} />
      {issues.length >= MAX_ISSUES && <p className="text-sm text-text-muted">Only the first {MAX_ISSUES} problems are shown.</p>}
    </div>
  )
}
