import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { formatIssue, MAX_ISSUES, type Issue } from '../../domain/plan-format'
import { Button, type ButtonVariant } from '../../ui/button'
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

/**
 * Copies `getText()` on press. No toast: the button turns into a check and "Copied" for 2 s and a polite
 * live region says so. A refused copy still gets a toast, because nothing else would tell the user.
 */
export function CopyButton({ getText, children, variant }: { getText: () => string; children: ReactNode; variant?: ButtonVariant }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    if (!(await copyText(getText()))) {
      toasts.add({ title: 'Could not copy', description: 'Your browser blocked clipboard access. Select the text and copy it by hand.' }, { timeout: 6000 })
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <>
      <Button variant={variant} onPress={copy}>
        {copied ? <Check /> : <Copy />} {copied ? 'Copied' : children}
      </Button>
      <span aria-live="polite" className="sr-only">{copied ? 'Copied to the clipboard' : ''}</span>
    </>
  )
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
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted" role="status">
          {errors.length > 0
            ? `${errors.length} ${errors.length === 1 ? 'error blocks' : 'errors block'} the import. Fix ${errors.length === 1 ? 'it' : 'them'} and paste again.`
            : 'No errors. Warnings do not block the import.'}
        </p>
        <CopyButton variant="secondary" getText={() => issues.map(formatIssue).join('\n')}>
          Copy
        </CopyButton>
      </div>
      <Group title="Errors" tone="text-danger" issues={errors} />
      <Group title="Warnings" tone="text-warning" issues={warnings} />
      {issues.length >= MAX_ISSUES && <p className="text-sm text-text-muted">Only the first {MAX_ISSUES} problems are shown.</p>}
    </div>
  )
}
