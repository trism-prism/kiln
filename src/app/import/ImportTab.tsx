// Step 1 of docs/plan-import.md: paste box, "Paste from clipboard", file picker.
import { useMemo, useRef, useState } from 'react'
import { ClipboardPaste, FileUp, X } from 'lucide-react'
import { FileTrigger } from 'react-aria-components'
import { Button, Link } from '../../ui/button'
import { toasts } from '../../ui/overlay'
import { Report } from './Report'
import { Review } from './Review'
import { FILE_TYPES, fileSizeIssue, type Input } from './logic'

export function ImportTab() {
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; data?: ArrayBuffer }>()
  // Bumped when new content is loaded (file, clipboard) so the plan details start over; typing keeps them.
  const [loaded, setLoaded] = useState(0)
  const [hint, setHint] = useState('')
  const [problem, setProblem] = useState<ReturnType<typeof fileSizeIssue>>()
  const box = useRef<HTMLTextAreaElement>(null)
  // Counts loads (paste, file, edit, clear). A read that finishes after a newer load is dropped.
  const loads = useRef(0)
  const readFailed = (what: string, e: unknown) =>
    toasts.add({ title: `Could not read ${what}`, description: e instanceof Error ? e.message : String(e) }, { timeout: 8000 })

  const load = (next: string, name?: string) => {
    loads.current++
    setText(next)
    setProblem(undefined)
    setFile(name === undefined ? undefined : { name })
    setLoaded((n) => n + 1)
  }

  async function paste() {
    setHint('')
    const mine = ++loads.current
    try {
      const pasted = await navigator.clipboard.readText()
      if (mine === loads.current) load(pasted)
    } catch {
      // Denied, or not supported: the box is the fallback.
      setHint('Kiln could not read the clipboard. Click the box and paste with Ctrl+V (on a phone, press and hold, then Paste).')
      box.current?.focus()
    }
  }

  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setHint('')
    const mine = ++loads.current
    const tooBig = fileSizeIssue(f.size)
    setProblem(tooBig)
    if (tooBig) return
    try {
      if (f.name.toLowerCase().endsWith('.xlsx')) {
        const data = await f.arrayBuffer()
        if (mine !== loads.current) return
        setText('')
        setFile({ name: f.name, data })
        setLoaded((n) => n + 1)
      } else {
        const content = await f.text()
        if (mine === loads.current) load(content, f.name)
      }
    } catch (e) {
      if (mine === loads.current) readFailed(f.name, e)
    }
  }

  // Memoized: Review re-validates whenever this object changes.
  const input = useMemo<Input | undefined>(
    () => (file?.data ? { kind: 'xlsx', data: file.data, fileName: file.name } : text.trim() !== '' ? { kind: 'text', text, fileName: file?.name } : undefined),
    [file, text],
  )

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <label htmlFor="plan-text" className="text-sm font-medium">
          Plan text
        </label>
        <textarea
          id="plan-text"
          ref={box}
          value={text}
          onChange={(e) => {
            loads.current++
            setText(e.target.value)
            setProblem(undefined)
            setFile(undefined)
          }}
          disabled={!!file?.data}
          rows={8}
          spellCheck={false}
          placeholder="Paste a plan here: Markdown with a JSON block, raw JSON, or cells copied from a spreadsheet."
          className="min-h-40 w-full rounded-md border border-border-strong bg-surface-raised p-3 font-mono text-sm text-text placeholder:text-text-muted"
        />
        {file?.data && <p className="text-sm text-text-muted">Spreadsheet loaded: {file.name}</p>}
        {hint && <p role="status" className="text-sm text-warning">{hint}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onPress={paste}>
            <ClipboardPaste /> Paste from clipboard
          </Button>
          <FileTrigger acceptedFileTypes={FILE_TYPES} onSelect={(files) => void pick(files as FileList | null)}>
            <Button variant="secondary">
              <FileUp /> Choose file
            </Button>
          </FileTrigger>
          {(text !== '' || file) && (
            <Button variant="quiet" onPress={() => load('')}>
              <X /> Clear
            </Button>
          )}
        </div>
        <p className="text-sm text-text-muted">
          Files: .md, .txt, .json, .csv or .xlsx, up to 5 MB. Template:{' '}
          <Link href="/kiln-plan-template.csv" download>
            CSV
          </Link>{' '}
          or{' '}
          <Link href="/kiln-plan-template.xlsx" download>
            Excel
          </Link>
          .
        </p>
      </div>
      {problem && <Report issues={[problem]} />}
      {input && !problem && <Review key={loaded} input={input} />}
    </div>
  )
}
