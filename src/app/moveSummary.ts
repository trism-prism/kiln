import { BACKLOG } from '../domain/scheduler'
import { formatDay } from '../lib/date'

const MAX_DATES = 4

/**
 * Says where the scheduler put tasks that were `before` (task id to old date): "Moved 5 overdue tasks: 3 to
 * Thu, Nov 13, 2 to Fri, Nov 14". `assignments` is the scheduler's output. `noun` is e.g. "overdue task".
 */
export function describeMoves(verb: string, noun: string, before: ReadonlyMap<string, string | undefined>, assignments: Record<string, string>): string {
  const perDay = new Map<string, number>()
  let backlog = 0
  for (const [id, old] of before) {
    const now = assignments[id]
    if (!now || now === old) continue
    if (now === BACKLOG) backlog++
    else perDay.set(now, (perDay.get(now) ?? 0) + 1)
  }
  const moved = backlog + [...perDay.values()].reduce((a, b) => a + b, 0)
  if (moved === 0) return before.size === 0 ? `Nothing was ${noun === 'overdue task' ? 'overdue' : 'waiting'}` : `No ${noun}s could be moved`
  const days = [...perDay].sort(([a], [b]) => (a < b ? -1 : 1))
  const parts = days.slice(0, MAX_DATES).map(([d, n]) => `${n} to ${formatDay(d)}`)
  const rest = days.slice(MAX_DATES).reduce((a, [, n]) => a + n, 0)
  if (rest) parts.push(`${rest} to later days`)
  if (backlog) parts.push(`${backlog} to the backlog`)
  return `${verb} ${moved} ${noun}${moved === 1 ? '' : 's'}: ${parts.join(', ')}`
}
