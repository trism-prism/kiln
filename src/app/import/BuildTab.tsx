// Manual builder: a form that produces a plan object, then the same review and import as a pasted plan.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CheckboxGroup, Input, Label, Text, TextField as AriaTextField } from 'react-aria-components'
import { NEETCODE_POOL } from '../../domain/practice'
import { PRIORITY_VALUES, TYPE_VALUES } from './builder-options'
import { Button } from '../../ui/button'
import { Checkbox, ListBoxItem, Select, TextField } from '../../ui/form'
import { Card } from '../../ui/surface'
import { emptyDraft, emptyModule, emptyTask, type Draft, type DraftModule, type DraftTask } from './builder'
import type { Input as ReviewInput } from './logic'
import { Review } from './Review'

const control =
  'h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text placeholder:text-text-muted data-focused:border-focus'

export function BuildTab() {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  // The snapshot being reviewed: changes to the form do not touch it until "Review plan" is pressed again.
  const [reviewed, setReviewed] = useState<{ input: ReviewInput; n: number }>()

  const setModule = (mi: number, patch: Partial<DraftModule>) =>
    setDraft((d) => ({ ...d, modules: d.modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }))
  const setTask = (mi: number, ti: number, patch: Partial<DraftTask>) =>
    setDraft((d) => ({
      ...d,
      modules: d.modules.map((m, i) => (i === mi ? { ...m, tasks: m.tasks.map((t, j) => (j === ti ? { ...t, ...patch } : t)) } : m)),
    }))
  const all = draft.modules.flatMap((m) => m.tasks)

  return (
    <div className="grid gap-6">
      <p className="text-sm text-text-muted">
        Build a plan without an AI chat: name it, add modules (chapters or weeks), and add tasks. Kiln checks it like any imported plan.
      </p>
      <TextField label="Plan title" value={draft.title} onChange={(title) => setDraft((d) => ({ ...d, title }))} className="max-w-xl" />

      <datalist id="neetcode-slugs">
        {NEETCODE_POOL.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.title}
          </option>
        ))}
      </datalist>

      {draft.modules.map((m, mi) => (
        <Card key={m.uid} className="grid gap-4">
          <section aria-label={`Module ${mi + 1}`} className="grid gap-4">
            <div className="flex items-end gap-3">
              <TextField label={`Module ${mi + 1} title`} value={m.title} onChange={(title) => setModule(mi, { title })} className="flex-1" />
              {draft.modules.length > 1 && (
                <Button variant="secondary" aria-label={`Remove module ${mi + 1}`} onPress={() => setDraft((d) => ({ ...d, modules: d.modules.filter((_, i) => i !== mi) }))}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            {m.tasks.map((t, ti) => {
              const others = all.filter((o) => o.uid !== t.uid && o.title.trim() !== '')
              const n = `${mi + 1}.${ti + 1}`
              return (
                <fieldset key={t.uid} className="grid gap-4 rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">Task {n}</legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Title" value={t.title} onChange={(title) => setTask(mi, ti, { title })} className="md:col-span-2" />
                    <Select label="Type" selectedKey={t.type} onSelectionChange={(k) => setTask(mi, ti, { type: k as DraftTask['type'] })}>
                      {TYPE_VALUES.map((v) => (
                        <ListBoxItem key={v} id={v}>
                          {v}
                        </ListBoxItem>
                      ))}
                    </Select>
                    <TextField label="Minutes" inputMode="numeric" value={t.minutes} onChange={(minutes) => setTask(mi, ti, { minutes })} description="5 to 90 for most tasks; 0 for a milestone" />
                    <Select label="Priority" selectedKey={t.priority} onSelectionChange={(k) => setTask(mi, ti, { priority: k as DraftTask['priority'] })}>
                      {PRIORITY_VALUES.map((v) => (
                        <ListBoxItem key={v} id={v}>
                          {v}
                        </ListBoxItem>
                      ))}
                    </Select>
                    <TextField label="Topics" value={t.topics} onChange={(topics) => setTask(mi, ti, { topics })} description="Separated by commas, e.g. arrays, hash maps" />
                    <AriaTextField value={t.slug} onChange={(slug) => setTask(mi, ti, { slug })} className="grid gap-1.5 text-sm">
                      <Label className="font-medium">LeetCode problem (optional)</Label>
                      <Input list="neetcode-slugs" autoComplete="off" spellCheck={false} placeholder="two-sum" className={control} />
                      <Text slot="description" className="text-sm text-text-muted">Start typing a problem name or its slug</Text>
                    </AriaTextField>
                    <TextField label="Pin to a date (optional)" type="date" value={t.pinned} onChange={(pinned) => setTask(mi, ti, { pinned })} description="Kiln keeps the task on this day" />
                  </div>
                  {others.length > 0 && (
                    <details>
                      <summary className="cursor-default text-sm font-medium">Depends on ({t.dependsOn.length})</summary>
                      <CheckboxGroup aria-label={`Task ${n} depends on`} value={t.dependsOn} onChange={(dependsOn) => setTask(mi, ti, { dependsOn })} className="mt-3 grid gap-2">
                        {others.map((o) => (
                          <Checkbox key={o.uid} value={o.uid}>
                            {o.title}
                          </Checkbox>
                        ))}
                      </CheckboxGroup>
                    </details>
                  )}
                  {m.tasks.length > 1 && (
                    <div>
                      <Button variant="quiet" aria-label={`Remove task ${n}`} onPress={() => setModule(mi, { tasks: m.tasks.filter((_, j) => j !== ti) })}>
                        <Trash2 /> Remove task
                      </Button>
                    </div>
                  )}
                </fieldset>
              )
            })}
            <div>
              <Button variant="secondary" onPress={() => setModule(mi, { tasks: [...m.tasks, emptyTask()] })}>
                <Plus /> Add task to module {mi + 1}
              </Button>
            </div>
          </section>
        </Card>
      ))}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onPress={() => setDraft((d) => ({ ...d, modules: [...d.modules, emptyModule()] }))}>
          <Plus /> Add module
        </Button>
        <Button onPress={() => setReviewed((r) => ({ input: { kind: 'build', draft: structuredClone(draft) }, n: (r?.n ?? 0) + 1 }))}>Review plan</Button>
      </div>

      {reviewed && <Review key={reviewed.n} input={reviewed.input} />}
    </div>
  )
}
