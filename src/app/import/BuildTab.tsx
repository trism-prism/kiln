// Quick add: type tasks one per line, fix them in the preview table, then the same review and import
// as a pasted plan.
import { useMemo, useState } from 'react'
import { toLocalISODate } from '../../lib/date'
import { PRIORITY_HINT, PRIORITY_LABEL } from '../priority'
import { PRIORITY_VALUES, TYPE_OPTIONS } from './builder-options'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import type { Draft, DraftTask } from './builder'
import type { Input as ReviewInput } from './logic'
import { MAX_REPEAT, parseQuickAdd } from './quick-add'
import { Review } from './Review'

const cell = 'h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-text'
const EXAMPLE = '# Week {n}\nRead chapter {n} 45m\nWatch the lecture https://youtube.com/...\nPractice set {n} 1h fri\nExtra reading ?'

export function BuildTab() {
  const today = toLocalISODate(new Date())
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [repeat, setRepeat] = useState('1')
  // Fixes made in the table, by row uid; they stay while the row's line is unchanged.
  const [edits, setEdits] = useState<Record<string, Partial<DraftTask>>>({})
  // The snapshot being reviewed: changes do not touch it until "Review plan" is pressed again.
  const [reviewed, setReviewed] = useState<{ input: ReviewInput; n: number }>()

  const times = Math.min(Math.max(Number.parseInt(repeat, 10) || 1, 1), MAX_REPEAT)
  const modules = useMemo(
    () => parseQuickAdd(text, today, times).map((m) => ({ ...m, tasks: m.tasks.map((t) => ({ ...t, ...edits[t.uid] })) })),
    [text, today, times, edits],
  )
  const draft: Draft = { title, modules }
  const edit = (uid: string, patch: Partial<DraftTask>) => setEdits((e) => ({ ...e, [uid]: { ...e[uid], ...patch } }))
  let row = 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <p className="text-sm text-text-muted">Make a plan for any subject: type one task per line, check the preview, and import it.</p>
      <TextField label="Plan title" value={title} onChange={setTitle} className="max-w-xl" />
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="quick-add" className="font-medium">
          Tasks, one per line
        </label>
        <textarea
          id="quick-add"
          aria-describedby="quick-add-help"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="min-h-40 w-full rounded-md border border-border-strong bg-surface-raised p-3 font-mono text-sm text-text placeholder:text-text-muted"
        />
        <p id="quick-add-help" className="text-text-muted">
          A line starting with # starts a module. On a task line, add a time (45m, 1h30m), a due day (today, tomorrow, fri, nov 20), ! for Essential or ? for
          Optional, and any links. Defaults: 30 min, Essential.
        </p>
      </div>
      <TextField
        label="Repeat ×N"
        inputMode="numeric"
        value={repeat}
        onChange={setRepeat}
        className="max-w-48"
        description="Copies the list N times; {n} becomes 1, 2, 3..."
      />

      {modules.length > 0 && (
        <div className="grid gap-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="pb-2 text-left font-medium">Preview: fix anything here</caption>
              <thead className="text-left text-text-muted">
                <tr>
                  <th className="p-1 font-medium">Title</th>
                  <th className="w-32 p-1 font-medium">Type</th>
                  <th className="w-20 p-1 font-medium">Minutes</th>
                  <th className="w-40 p-1 font-medium">Due</th>
                  <th className="w-36 p-1 font-medium">Priority</th>
                  <th className="p-1 font-medium">Links</th>
                </tr>
              </thead>
              {modules.map((m) => (
                <tbody key={m.uid}>
                  <tr>
                    <th colSpan={6} scope="colgroup" className="p-1 pt-3 text-left font-semibold">
                      {m.title}
                    </th>
                  </tr>
                  {m.tasks.map((t) => {
                    const n = ++row
                    return (
                      <tr key={t.uid}>
                        <td className="p-1">
                          <input aria-label={`Task ${n} title`} value={t.title} onChange={(e) => edit(t.uid, { title: e.target.value })} className={cell} />
                        </td>
                        <td className="p-1">
                          <select aria-label={`Task ${n} type`} value={t.type} onChange={(e) => edit(t.uid, { type: e.target.value as DraftTask['type'] })} className={cell}>
                            {TYPE_OPTIONS.map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input aria-label={`Task ${n} minutes`} inputMode="numeric" value={t.minutes} onChange={(e) => edit(t.uid, { minutes: e.target.value })} className={cell} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Task ${n} due`} type="date" value={t.due} onChange={(e) => edit(t.uid, { due: e.target.value })} className={cell} />
                        </td>
                        <td className="p-1">
                          <select aria-label={`Task ${n} priority`} value={t.priority} onChange={(e) => edit(t.uid, { priority: e.target.value as DraftTask['priority'] })} className={cell}>
                            {PRIORITY_VALUES.map((v) => (
                              <option key={v} value={v}>
                                {PRIORITY_LABEL[v]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input aria-label={`Task ${n} links`} value={t.links} onChange={(e) => edit(t.uid, { links: e.target.value })} spellCheck={false} className={cell} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <ul className="text-sm text-text-muted">
            {PRIORITY_VALUES.map((v) => (
              <li key={v}>
                {PRIORITY_LABEL[v]}: {PRIORITY_HINT[v]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Button isDisabled={modules.length === 0} onPress={() => setReviewed((r) => ({ input: { kind: 'build', draft: structuredClone(draft) }, n: (r?.n ?? 0) + 1 }))}>
          Review plan
        </Button>
      </div>

      {reviewed && <Review key={reviewed.n} input={reviewed.input} />}
    </div>
  )
}
