// "Edit plan": the plan's content as a draft, saved through savePlanEdit (by key, progress kept).
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { db, editBase, planFromRecords, savePlanEdit, uuidv7 } from '../../data'
import { checkMeaning } from '../../domain/plan-format/semantic'
import { planSchema, type Plan, type PlanModule, type Priority, type Resource, type Task } from '../../domain/plan-format'
import { Button, IconButton } from '../../ui/button'
import { Checkbox, ListBoxItem, Select, TextAreaField, TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { rescheduleOverdue } from '../actions'
import { PRIORITY_LABEL } from '../priority'
import type { PlanDetail } from '../queries'

interface Draft {
  title: string
  goal: string
  description: string
  modules: { module: PlanModule; tasks: Task[] }[]
}

const PRIORITIES = Object.keys(PRIORITY_LABEL) as Priority[]

/** A new file id: a slug of the title plus random characters, so it never matches a deleted record's key. */
const newKey = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item'}-${uuidv7().slice(-6)}`

const swap = <T,>(list: T[], i: number, j: number): T[] => {
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

/** The draft as a plan file: positions become order numbers, blank optional text is left out. */
function toPlan(base: Plan, d: Draft): Plan {
  return {
    ...base,
    title: d.title.trim(),
    goal: d.goal.trim() || undefined,
    description: d.description.trim() || undefined,
    modules: d.modules.map(({ module }, i) => ({ ...module, title: module.title.trim(), order: i + 1 })),
    tasks: d.modules.flatMap(({ module, tasks }) =>
      tasks.map((t, j) => ({
        ...t,
        title: t.title.trim(),
        moduleId: module.id,
        order: j + 1,
        resources: t.resources.map((r) => ({ ...r, title: r.title.trim(), url: r.url?.trim() || undefined })),
      })),
    ),
  }
}

/** 'Task "Intro": title must not be empty' for each problem with the plan file's shape, and each cycle or module-order problem the plan did not already have (`base`: the plan as opened). */
function shapeErrors(plan: Plan, base?: Plan): string[] {
  const parsed = planSchema.safeParse(plan)
  const where = (kind: unknown, i: unknown, p: Plan = plan) => {
    const item = kind === 'tasks' ? p.tasks[i as number] : kind === 'modules' ? p.modules[i as number] : undefined
    return item ? `${kind === 'tasks' ? 'Task' : 'Module'} "${item.title || 'untitled'}"` : 'Plan'
  }
  if (!parsed.success) {
    return parsed.error.issues.map(({ path, message }) => {
      const [kind, i, ...field] = path
      const w = where(kind, i)
      return `${w}: ${(w === 'Plan' ? path : field).join(' ')} ${message}`
    })
  }
  // The two authoring rules the editor can break (the others are not checked, see save).
  // Problems the plan already had when opened (sample or older plans) do not block an unrelated edit.
  const rules = (p: Plan) =>
    checkMeaning(p as unknown as Record<string, unknown>)
    .filter((x) => x.severity === 'error' && ((x.loc[0] === 'tasks' && x.field === 'dependsOn' && x.rest.startsWith('creates a cycle')) || (x.loc[0] === 'modules' && x.field === 'notBeforeDay')))
    .map((x) => `${where(x.loc[0], x.loc[1], p)}: ${x.field} ${x.rest}`)
  const known = new Set(base ? rules(base).map(sameIssue) : [])
  return rules(plan).filter((m) => !known.has(sameIssue(m)))
}

/** An issue message without list positions, so moving a module does not make an old problem look new. */
const sameIssue = (m: string) => m.replace(/\[\d+\]/g, '[]')

function Row({ label, first, last, onUp, onDown, onDelete, children }: { label: string; first: boolean; last: boolean; onUp: () => void; onDown: () => void; onDelete: () => void; children: ReactNode }) {
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <IconButton aria-label={`Move ${label} up`} isDisabled={first} onPress={onUp}>
        <ArrowUp size={18} />
      </IconButton>
      <IconButton aria-label={`Move ${label} down`} isDisabled={last} onPress={onDown}>
        <ArrowDown size={18} />
      </IconButton>
      <IconButton aria-label={`Delete ${label}`} data-act="delete" onPress={onDelete}>
        <Trash2 size={18} />
      </IconButton>
    </div>
  )
}

function TaskFields({ task, all, pin, onChange, onPin }: { task: Task; all: Task[]; pin: string; onChange: (t: Task) => void; onPin: (d: string) => void }) {
  const setLink = (i: number, r: Resource | undefined) =>
    onChange({ ...task, resources: r ? task.resources.map((x, j) => (j === i ? r : x)) : task.resources.filter((_, j) => j !== i) })
  return (
    <div id={`details-${task.id}`} className="grid gap-4 rounded-md bg-surface-muted p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Minutes"
          type="number"
          value={String(task.estimatedMinutes)}
          onChange={(v) => onChange({ ...task, estimatedMinutes: Math.max(0, Math.round(Number(v) || 0)) })}
        />
        <Select label="Priority" selectedKey={task.priority} onSelectionChange={(k) => onChange({ ...task, priority: k as Priority })}>
          {PRIORITIES.map((p) => (
            <ListBoxItem key={p} id={p}>
              {PRIORITY_LABEL[p]}
            </ListBoxItem>
          ))}
        </Select>
        <TextField label="Deadline (optional)" type="date" value={task.deadline ?? ''} onChange={(v) => onChange({ ...task, deadline: v || undefined })} />
        <TextField label="Pinned to (optional)" type="date" value={pin} onChange={onPin} />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Links</legend>
        {task.resources.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <TextField label="Link title" className="min-w-40 flex-1" value={r.title} onChange={(v) => setLink(i, { ...r, title: v })} />
            <TextField label="URL" type="url" className="min-w-40 flex-1" value={r.url ?? ''} onChange={(v) => setLink(i, { ...r, url: v })} />
            <IconButton aria-label={`Remove link ${r.title}`} onPress={() => setLink(i, undefined)}>
              <Trash2 size={18} />
            </IconButton>
          </div>
        ))}
        <Button variant="quiet" className="w-fit" onPress={() => onChange({ ...task, resources: [...task.resources, { title: '', kind: 'other', required: true }] })}>
          <Plus size={16} /> Add link
        </Button>
      </fieldset>
      <details className="text-sm">
        <summary className="cursor-default font-medium">Depends on ({task.dependsOn.length})</summary>
        <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto">
          {all
            .filter((o) => o.id !== task.id)
            .map((o) => (
              <Checkbox
                key={o.id}
                isSelected={task.dependsOn.includes(o.id)}
                onChange={(on) => onChange({ ...task, dependsOn: on ? [...task.dependsOn, o.id] : task.dependsOn.filter((d) => d !== o.id) })}
              >
                {o.title || 'Untitled task'}
              </Checkbox>
            ))}
        </div>
      </details>
    </div>
  )
}

export function PlanEditor({ detail, onClose }: { detail: PlanDetail; onClose: () => void }) {
  const [base] = useState(() =>
    planFromRecords(
      detail.plan,
      detail.modules.map((m) => m.module),
      detail.modules.flatMap((m) => m.tasks),
    ),
  )
  // What the editor opened with: save refuses if another device changed any of it meanwhile.
  const [opened] = useState(() =>
    editBase(
      detail.plan,
      detail.modules.map((m) => m.module),
      detail.modules.flatMap((m) => m.tasks),
    ),
  )
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  // A selector (inside the form) to focus after the next render: the row after a delete, a new field.
  const focusSel = useRef<string | undefined>(undefined)
  const setFocusSel = (sel: string) => {
    focusSel.current = sel
  }
  useEffect(() => heading.current?.focus(), [])
  useEffect(() => {
    if (focusSel.current) form.current?.querySelector<HTMLElement>(focusSel.current)?.focus()
    focusSel.current = undefined
  })
  const [draft, setDraft] = useState<Draft>(() => ({
    title: base.title,
    goal: base.goal ?? '',
    description: base.description ?? '',
    modules: [...base.modules]
      .sort((a, b) => a.order - b.order)
      .map((module) => ({ module, tasks: base.tasks.filter((t) => t.moduleId === module.id).sort((a, b) => a.order - b.order) })),
  }))
  // Pinned days by task key ('' = not pinned). Pins are app state, saved next to the plan content.
  const [pins, setPins] = useState<Record<string, string>>(() => Object.fromEntries(detail.modules.flatMap((m) => m.tasks).map((t) => [t.key, t.pinnedDate ?? ''])))
  const [open, setOpen] = useState<string>()
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const allTasks = draft.modules.flatMap((m) => m.tasks)
  const setModules = (modules: Draft['modules']) => setDraft({ ...draft, modules })
  const setModule = (i: number, next: Draft['modules'][number]) => setModules(draft.modules.map((m, j) => (j === i ? next : m)))
  // Deleting removes the tasks and every dependency on them.
  const without = (modules: Draft['modules'], gone: Set<string>) =>
    modules.map((m) => ({ ...m, tasks: m.tasks.filter((t) => !gone.has(t.id)).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => !gone.has(d)) })) }))

  const save = async () => {
    const plan = toPlan(base, draft)
    // Only the file shape is checked. The authoring rules (validatePlan) are not: plans joined from parts
    // or reordered here can break them (module notBeforeDay order), and the scheduler copes with the rest.
    const found = shapeErrors(plan, base)
    setErrors(found)
    if (found.length) return
    setSaving(true)
    try {
      const v = await savePlanEdit(db, detail.plan.id, plan, Object.fromEntries(Object.entries(pins).map(([k, d]) => [k, d || undefined])), opened)
      onClose()
      toasts.add(
        { title: 'Plan saved', description: `${v.summary}. Reschedule to place new or changed tasks.`, action: { label: 'Reschedule', onPress: () => void rescheduleOverdue() } },
        { timeout: 10000 },
      )
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      ref={form}
      className="grid gap-6"
      aria-label="Edit plan"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h2 ref={heading} tabIndex={-1} className="text-base font-medium outline-none">
        Edit plan
      </h2>
      <div className="grid gap-4">
        <TextField label="Plan name" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
        <TextAreaField label="Goal" rows={2} value={draft.goal} onChange={(goal) => setDraft({ ...draft, goal })} />
        <TextAreaField label="Description" rows={3} value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
      </div>

      {draft.modules.map((m, i) => (
        <section key={m.module.id} data-module={m.module.id} aria-label={`Module ${i + 1}`} className="grid gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
          <Row
            label={`module ${m.module.title || i + 1}`}
            first={i === 0}
            last={i === draft.modules.length - 1}
            onUp={() => setModules(swap(draft.modules, i, i - 1))}
            onDown={() => setModules(swap(draft.modules, i, i + 1))}
            onDelete={() => {
              setModules(without(draft.modules, new Set(m.tasks.map((t) => t.id))).filter((_, j) => j !== i))
              const next = draft.modules[i + 1]
              setFocusSel(next ? `[data-module="${next.module.id}"] [data-act="delete"]` : '[data-add-module]')
            }}
          >
            <TextField label="Module name" value={m.module.title} onChange={(title) => setModule(i, { ...m, module: { ...m.module, title } })} />
          </Row>
          <ul className="grid gap-3">
            {m.tasks.map((t, j) => {
              const setTask = (next: Task) => setModule(i, { ...m, tasks: m.tasks.map((x) => (x.id === t.id ? next : x)) })
              return (
                <li key={t.id} data-task={t.id} className="grid gap-2 border-t border-border pt-3">
                  <Row
                    label={`task ${t.title || j + 1}`}
                    first={j === 0}
                    last={j === m.tasks.length - 1}
                    onUp={() => setModule(i, { ...m, tasks: swap(m.tasks, j, j - 1) })}
                    onDown={() => setModule(i, { ...m, tasks: swap(m.tasks, j, j + 1) })}
                    onDelete={() => {
                      setModules(without(draft.modules, new Set([t.id])))
                      const next = m.tasks[j + 1]
                      setFocusSel(next ? `[data-task="${next.id}"] [data-act="delete"]` : `[data-add-task="${m.module.id}"]`)
                    }}
                  >
                    <TextField label="Task name" value={t.title} onChange={(title) => setTask({ ...t, title })} />
                  </Row>
                  <Button variant="quiet" className="w-fit" aria-expanded={open === t.id} aria-controls={`details-${t.id}`} onPress={() => setOpen(open === t.id ? undefined : t.id)}>
                    {open === t.id ? 'Hide details' : 'Details'}
                  </Button>
                  {open === t.id && <TaskFields task={t} all={allTasks} pin={pins[t.id] ?? ''} onChange={setTask} onPin={(d) => setPins({ ...pins, [t.id]: d })} />}
                </li>
              )
            })}
          </ul>
          <Button
            variant="secondary"
            className="w-fit"
            data-add-task={m.module.id}
            onPress={() => {
              const id = newKey('task')
              const task: Task = {
                id,
                moduleId: m.module.id,
                order: m.tasks.length + 1,
                title: '',
                type: 'lesson',
                estimatedMinutes: 30,
                priority: 'core',
                topics: [],
                objectives: [],
                keyConcepts: [],
                tradeoffs: [],
                verificationQuestions: [],
                resources: [],
                dependsOn: [],
              }
              setModule(i, { ...m, tasks: [...m.tasks, task] })
              setOpen(id)
              setFocusSel(`[data-task="${id}"] input`)
            }}
          >
            <Plus size={16} /> Add task
          </Button>
        </section>
      ))}
      <Button
        variant="secondary"
        className="w-fit"
        data-add-module
        onPress={() => setModules([...draft.modules, { module: { id: newKey('module'), title: '', order: draft.modules.length + 1 }, tasks: [] }])}
      >
        <Plus size={16} /> Add module
      </Button>

      {errors.length > 0 && (
        <div role="alert" className="grid gap-1 rounded-md border border-danger p-4 text-sm">
          <p className="font-medium">Fix these before saving:</p>
          <ul className="list-disc pl-5">
            {errors.slice(0, 10).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onPress={onClose}>
          Cancel
        </Button>
        <Button type="submit" isDisabled={saving}>
          Save plan
        </Button>
      </div>
    </form>
  )
}
