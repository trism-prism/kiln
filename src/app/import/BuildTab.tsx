// Quick add: type tasks one per line, fix them in the preview table, then the same review and import
// as a pasted plan.
import { useMemo, useState } from 'react'
import { toLocalISODate } from '../../lib/date'
import { PRIORITY_HINT, PRIORITY_LABEL } from '../priority'
import { PRIORITY_VALUES, TYPE_OPTIONS } from './builder-options'
import { Button } from '../../ui/button'
import { DateField } from '../../ui/date'
import { TextField } from '../../ui/form'
import type { Draft, DraftTask } from './builder'
import type { Input as ReviewInput } from './logic'
import { dropPastDue, keptEdits, MAX_REPEAT, parseQuickAdd } from './quick-add'
import { Review } from './Review'

const cell = 'h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-text'
const EXAMPLE = '# Week 1\nRead chapter 1 45m\nWatch the lecture https://youtube.com/...\nPractice set 1 1h fri\nExtra reading ?'

export function BuildTab() {
  const today = toLocalISODate(new Date())
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [repeat, setRepeat] = useState('1')
  // Fixes made in the table, by row uid (the line's text and which copy of that text it is, see parseQuickAdd).
  const [edits, setEdits] = useState<Record<string, Partial<DraftTask>>>({})
  // The snapshot being reviewed: changes do not touch it until "Review plan" is pressed again.
  const [reviewed, setReviewed] = useState<{ input: ReviewInput; n: number }>()

  // The count in use. It changes only when the box holds a whole number of 1 or more, so clearing the box
  // to type a new number doesn't fall back to 1 on the way (which would drop the copies' edits).
  const [times, setTimes] = useState(1)
  const typedTimes = /^\s*[0-9]+\s*$/.test(repeat) ? Number(repeat) : undefined
  const [droppedEdits, setDroppedEdits] = useState({ changed: 0, recounted: 0 })
  const parsed = useMemo(() => parseQuickAdd(text, today, times), [text, today, times])
  // Past dates are cleared after the table edits apply, so a date typed in the table is checked too.
  const { modules, dropped: pastDates } = useMemo(
    () => dropPastDue(parsed.map((m) => ({ ...m, tasks: m.tasks.map((t) => ({ ...t, ...edits[t.uid] })) })), today),
    [parsed, today, edits],
  )
  const taskCount = modules.reduce((n, m) => n + m.tasks.length, 0)
  // Edits belong to a line's text. When the text changes, edits whose line is gone are dropped, so an
  // old fix does not come back when the line is typed again; so are all edits on identical lines once
  // their number changes, as there is no telling which copy was removed or added.
  function change(nextText: string, nextTimes: number) {
    const next = keptEdits(edits, parsed, parseQuickAdd(nextText, today, nextTimes))
    if (next.changed + next.recounted > 0) setEdits(next.edits)
    setDroppedEdits({ changed: next.changed, recounted: next.recounted })
  }
  const draft: Draft = { title, modules }
  const edit = (uid: string, patch: Partial<DraftTask>) => setEdits((e) => ({ ...e, [uid]: { ...e[uid], ...patch } }))
  let row = 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <TextField label="Plan title" value={title} onChange={setTitle} className="max-w-xl" />
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="quick-add" className="font-medium">
          Tasks, one per line
        </label>
        <textarea
          id="quick-add"
          aria-describedby="quick-add-help"
          value={text}
          onChange={(e) => {
            change(e.target.value, times)
            setText(e.target.value)
          }}
          rows={10}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="min-h-40 w-full rounded-md border border-border-strong bg-surface-raised p-3 text-sm text-text placeholder:text-text-muted"
        />
        <p id="quick-add-help" className="text-text-muted">
          Start a line with # for a new module. Add a time (45m), a day (fri or nov 20), ! for Essential, ? for Optional, and any links.
        </p>
      </div>
      <TextField
        label="Repeat"
        suffix="times"
        inputMode="numeric"
        value={repeat}
        onChange={(v) => {
          setRepeat(v)
          const n = /^\s*[0-9]+\s*$/.test(v) ? Number(v) : 0
          if (n < 1) return
          const next = Math.min(n, MAX_REPEAT)
          if (next !== times) change(text, next)
          setTimes(next)
        }}
        // Leaving the box empty or unreadable shows the count still in use.
        onBlur={() => {
          if (typedTimes === undefined || typedTimes < 1) setRepeat(String(times))
        }}
        description={times > 1 ? 'Numbers like the 1 in Week 1 go up in each copy.' : undefined}
        isInvalid={(typedTimes ?? 0) > MAX_REPEAT}
        errorMessage={`Up to ${MAX_REPEAT} times.`}
      />

      <p role="status" className="text-sm text-text-muted">
        {taskCount === 0 ? '' : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} in ${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`}
      </p>
      {droppedEdits.changed > 0 && (
        <p className="text-sm text-warning">
          {droppedEdits.changed} table {droppedEdits.changed === 1 ? 'edit was' : 'edits were'} dropped because{' '}
          {droppedEdits.changed === 1 ? 'its line' : 'their lines'} changed.
        </p>
      )}
      {droppedEdits.recounted > 0 && (
        <p className="text-sm text-warning">
          {droppedEdits.recounted} table {droppedEdits.recounted === 1 ? 'edit was' : 'edits were'} dropped because identical lines were added or removed.
        </p>
      )}
      {pastDates > 0 && (
        <p className="text-sm text-warning">
          {pastDates} due {pastDates === 1 ? 'date is' : 'dates are'} in the past and {pastDates === 1 ? 'was' : 'were'} cleared. Pick a date from today on to keep one.
        </p>
      )}

      {modules.length > 0 && (
        <div className="grid gap-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="pb-2 text-left font-medium">Preview: fix anything here</caption>
              <thead className="text-left text-text-muted">
                <tr>
                  <th scope="col" className="min-w-40 p-1 font-medium">Title</th>
                  <th scope="col" className="w-32 p-1 font-medium">Type</th>
                  <th scope="col" className="w-20 p-1 font-medium">Minutes</th>
                  <th scope="col" className="w-40 p-1 font-medium sm:w-44">Due</th>
                  <th scope="col" className="w-36 p-1 font-medium">Priority</th>
                  <th scope="col" className="min-w-20 p-1 font-medium">Links</th>
                </tr>
              </thead>
              {modules.map((m) => (
                <tbody key={m.uid}>
                  <tr>
                    <th colSpan={6} scope="rowgroup" className="p-1 pt-3 text-left font-semibold">
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
                          <DateField size="sm" placeholder="" aria-label={`Task ${n} due`} value={t.due} min={today} onChange={(due) => edit(t.uid, { due })} />
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
        <Button isDisabled={modules.length === 0} aria-describedby={modules.length === 0 ? 'review-reason' : undefined} onPress={() => setReviewed((r) => ({ input: { kind: 'build', draft: structuredClone(draft) }, n: (r?.n ?? 0) + 1 }))}>
          Review plan
        </Button>
        {modules.length === 0 && (
          <p id="review-reason" className="mt-2 text-sm text-text-muted">
            Type at least one task above to review the plan.
          </p>
        )}
      </div>

      {reviewed && <Review key={reviewed.n} input={reviewed.input} />}
    </div>
  )
}
