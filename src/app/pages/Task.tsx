import { useState, type ReactNode } from 'react'
import { BookOpen, Boxes, ExternalLink, FileText, GraduationCap, Library, Link as LinkIcon, PlayCircle, Puzzle, Wrench, type LucideIcon } from 'lucide-react'
import { useParams } from 'react-router'
import { Button, Link } from '../../ui/button'
import { Badge, EmptyState, Skeleton } from '../../ui/surface'
import { TextField } from '../../ui/form'
import { formatDay, isRealISODate } from '../../lib/date'
import { cardMinutes, localDate } from '../../domain/mastery'
import { practiceLanguage } from '../../data'
import { pinTask, rescheduleOverdue, toggleSkip } from '../actions'
import { Page } from '../Page'
import { DifficultyBadge, LeetCodeLink, minutesText } from '../parts'
import { PRIORITY_LABEL } from '../priority'
import { useTaskDetail } from '../queries'
import { useCompleter } from '../rating'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  )
}

const List = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1.5 pl-5 text-sm">
    {items.map((t, i) => (
      <li key={i}>{t}</li>
    ))}
  </ul>
)

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

const KIND_ICON: Record<string, LucideIcon> = { video: PlayCircle, article: FileText, book: BookOpen, course: GraduationCap, docs: Library, tool: Wrench, visualizer: Boxes, problem: Puzzle }

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)

export default function TaskPage() {
  const { taskId } = useParams()
  const detail = useTaskDetail(taskId)
  const { complete, sheet } = useCompleter()
  const [pinDate, setPinDate] = useState('')
  // The pin field shows its own error for text it can't read; Pin waits until it is fixed.
  const [pinBad, setPinBad] = useState(false)

  if (detail === undefined) {
    return (
      <Page title="Task">
        <Skeleton className="h-48 w-full" />
      </Page>
    )
  }
  if (detail === null) {
    return (
      <Page title="Task">
        <EmptyState title="Task not found" action={<Link href="/todo">Back to To Do</Link>}>
          This task may belong to a plan that was removed.
        </EmptyState>
      </Page>
    )
  }

  const { task, plan, module, dependencies } = detail
  const done = task.status === 'done'
  const skipped = task.status === 'skipped'
  const hasCard = cardMinutes(task) !== undefined
  const lc = task.practice?.provider === 'leetcode' && task.practice.slug ? task.practice : undefined
  const validPin = isRealISODate(pinDate) && !pinBad

  return (
    <Page title={task.title}>
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <article className="grid min-w-0 gap-8">
          <header className={`grid gap-3 rounded-lg border border-border p-5 ${done || skipped ? 'bg-surface-muted text-text-muted' : 'bg-surface-raised'}`}>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                <li>
                  <Link href="/plans">Plans</Link>
                </li>
                {plan && (
                  <li className="flex gap-2">
                    <span aria-hidden="true">/</span>
                    <Link href={`/plans/${plan.id}`}>{plan.title}</Link>
                  </li>
                )}
                {module && (
                  <li className="flex gap-2">
                    <span aria-hidden="true">/</span>
                    <span>{module.title}</span>
                  </li>
                )}
              </ol>
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              {done && <Badge tone="success">Completed {task.completedAt ? formatDay(localDate(task.completedAt), true) : ''}</Badge>}
              {skipped && <Badge>Skipped</Badge>}
              {task.backlog && <Badge tone="warning">In the backlog</Badge>}
              <Badge>{cap(task.type)}</Badge>
              <Badge>{PRIORITY_LABEL[task.priority]}</Badge>
              {lc && <DifficultyBadge difficulty={lc.difficulty} />}
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Due">{task.scheduledDate ? formatDay(task.scheduledDate, true) : 'Not scheduled'}</Fact>
              <Fact label="Time">{minutesText(task.estimatedMinutes)}</Fact>
              <Fact label="Priority">{PRIORITY_LABEL[task.priority]}</Fact>
              <Fact label="Type">{cap(task.type)}</Fact>
              {task.pinnedDate && <Fact label="Pinned to">{formatDay(task.pinnedDate, true)}</Fact>}
            </dl>
          </header>

          {task.description && (
            <Section title="Description">
              <p className="text-sm whitespace-pre-line">{task.description}</p>
            </Section>
          )}
          {lc && (
            <Section title="Practice">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>{task.practice?.title}</span>
                <LeetCodeLink slug={lc.slug!} title={task.practice?.title ?? task.title} language={plan ? practiceLanguage(plan) : undefined} />
              </div>
            </Section>
          )}
          {task.objectives.length > 0 && (
            <Section title="Objectives">
              <List items={task.objectives} />
            </Section>
          )}
          {task.keyConcepts.length > 0 && (
            <Section title="Key concepts">
              <List items={task.keyConcepts} />
            </Section>
          )}
          {task.tradeoffs.length > 0 && (
            <Section title="Tradeoffs">
              <List items={task.tradeoffs} />
            </Section>
          )}
          {task.verificationQuestions.length > 0 && (
            <Section title="Check yourself">
              <p className="text-sm text-text-muted">Answer these without looking anything up.</p>
              <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                {task.verificationQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </Section>
          )}
          {task.resources.length > 0 && (
            <Section title="Resources">
              <ul className="grid gap-2 text-sm">
                {task.resources.map((r, i) => {
                  const Icon = KIND_ICON[r.kind] ?? LinkIcon
                  const url = r.url ?? plan?.sources.find((s) => s.id === r.sourceId)?.url // a resource may take its link from its source
                  const detail = [cap(r.kind), r.section, r.minutes ? minutesText(r.minutes) : undefined, r.required ? undefined : 'Optional'].filter(Boolean).join(' · ')
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {url ? (
                        <Link href={url} target="_blank" rel="noopener noreferrer" aria-label={`${r.title} (${cap(r.kind)}, opens in a new tab)`} variant="secondary">
                          <Icon size={16} aria-hidden="true" />
                          {r.title}
                          <ExternalLink size={14} aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-2">
                          <Icon size={16} aria-hidden="true" className="text-text-muted" />
                          {r.title}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{detail}</span>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}
          {dependencies.length > 0 && (
            <Section title="Do these first">
              <ul className="grid gap-1.5 text-sm">
                {dependencies.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Link href={`/task/${d.id}`}>{d.title}</Link>
                    {d.status === 'done' && <Badge tone="success">Done</Badge>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </article>

        <aside aria-label="Actions" className="grid h-fit gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <Button
            isDisabled={skipped}
            variant={done ? 'secondary' : 'primary'}
            onPress={() => complete({ kind: 'task', id: task.id, title: task.title, rates: hasCard })}
          >
            {done ? 'Rate again' : 'Mark done'}
          </Button>
          <Button variant="secondary" onPress={() => void toggleSkip(task.id, !skipped, task.title)}>
            {skipped ? 'Unskip' : 'Skip'}
          </Button>
          <div className="grid gap-2">
            <TextField label="Pin to date" type="date" value={pinDate} onChange={setPinDate} onInvalidChange={setPinBad} description="The scheduler keeps a pinned task on its day." />
            <div className="flex gap-2">
              <Button variant="secondary" isDisabled={!validPin} onPress={() => void pinTask(task.id, pinDate)}>
                Pin
              </Button>
              {task.pinnedDate && (
                <Button variant="quiet" onPress={() => void pinTask(task.id, undefined)}>
                  Unpin
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-2 border-t border-border pt-4">
            <Button variant="secondary" onPress={() => void rescheduleOverdue()}>
              Reschedule this plan
            </Button>
            <p className="text-xs text-text-muted">Moves overdue work to the next days with room. Plans share the daily time, so it covers all of them.</p>
          </div>
        </aside>
      </div>
      {sheet}
    </Page>
  )
}
