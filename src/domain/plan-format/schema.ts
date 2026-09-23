// Zod schema for a Kiln plan file (schemaVersion 1). Spec: docs/plan-format.md.
//
// This file is the shape layer only (types, enums, ranges, lengths, patterns). Rules that compare
// several fields (mode and date rules, references, cycles, priority) live in validate.ts. Field
// descriptions (`.meta`) feed both docs/plan-schema.json and the field reference in the LLM prompts.
//
// Keep this file self-contained (imports only zod): `npm run schema` runs it directly in Node.
import { z } from 'zod'

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export const SCHEDULING_MODES = ['auto', 'fixed'] as const
export const TASK_TYPES = ['lesson', 'practice', 'review', 'project', 'assessment', 'milestone'] as const
export const PRIORITIES = ['core', 'recommended', 'optional'] as const
export const RESOURCE_KINDS = ['video', 'article', 'book', 'course', 'docs', 'tool', 'visualizer', 'problem', 'other'] as const
export const PROVIDERS = ['leetcode', 'other'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const DAILY_SOURCES = ['neetcode', 'plan'] as const

// Every schema node carries an error function so messages read "<field> <predicate>" without Zod's
// English defaults: a missing value is "is required", anything else gets the predicate.
const msg = (predicate: string) => (iss: { input?: unknown }) => (iss.input === undefined ? 'is required' : predicate)

const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: msg(`must be one of: ${values.join(', ')}`) })

const text = (max: number) =>
  z
    .string({ error: msg('must be text') })
    .min(1, { error: msg('must not be empty') })
    .max(max, { error: msg(`must be at most ${max} characters`) })

const idString = z.string({ error: msg('must be a lowercase slug: letters, digits and hyphens, at most 64 characters') }).regex(ID_PATTERN, {
  error: msg('must be a lowercase slug: letters, digits and hyphens, at most 64 characters'),
})

const int = (min: number, max: number) => {
  const predicate = `must be an integer from ${min} to ${max}`
  return z
    .number({ error: msg(predicate) })
    .int({ error: msg(predicate) })
    .min(min, { error: msg(predicate) })
    .max(max, { error: msg(predicate) })
}

const date = z
  .iso.date({ error: msg('must be a real date as yyyy-mm-dd') })
  .refine((v) => Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100, { error: 'must be a date in 2000-2100' })

const url = z
  .url({ protocol: /^https?$/, error: msg('must be an absolute http(s) URL') })
  .max(2000, { error: msg('must be at most 2000 characters') })

const list = (maxItems: number, maxText: number) =>
  z
    .array(text(maxText), { error: msg('must be a list of text') })
    .max(maxItems, { error: msg(`must have at most ${maxItems} items`) })
    .default([])

const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape, { error: msg('must be an object') })

export const sourceSchema = obj({
  id: idString.meta({ description: 'unique across modules, tasks and sources' }),
  title: text(200),
  url: url.optional(),
  kind: oneOf(RESOURCE_KINDS),
}).meta({ description: 'A whole work the plan draws on, such as a course or a book.' })

export const resourceSchema = obj({
  title: text(200),
  url: url.optional().meta({ description: 'a working link to the exact page; omit only if it cannot be verified' }),
  kind: oneOf(RESOURCE_KINDS),
  minutes: int(0, 600).optional().meta({ description: 'time this resource alone takes' }),
  required: z.boolean({ error: msg('must be true or false') }).default(true).meta({ description: 'false marks extra reading' }),
  section: text(200).optional().meta({ description: 'which part, e.g. "Chapter 5" or "1:02:00-1:30:00"' }),
  sourceId: idString.optional().meta({ description: 'id of an entry in sources' }),
})

export const practiceSchema = obj({
  provider: oneOf(PROVIDERS),
  slug: z
    .string({ error: msg('must be a LeetCode URL slug such as two-sum') })
    .regex(SLUG_PATTERN, { error: msg('must be a LeetCode URL slug such as two-sum') })
    .optional()
    .meta({ description: 'required for leetcode; the official slug from the problem URL' }),
  url: url.optional().meta({ description: 'required for provider other' }),
  title: text(120).meta({ description: "the problem's name" }),
  difficulty: oneOf(DIFFICULTIES),
}).meta({ description: 'One problem to solve.' })

export const dailyPracticeSchema = obj({
  source: oneOf(DAILY_SOURCES).meta({ description: 'neetcode tops up from the NeetCode list; plan uses only problems in the plan' }),
  perDay: int(1, 5).default(1).meta({ description: 'problems per study day' }),
  language: text(30).optional().meta({ description: 'e.g. python' }),
  startDifficulty: oneOf(DIFFICULTIES).default('easy'),
  topicFollowsLessons: z.boolean({ error: msg('must be true or false') }).default(true).meta({
    description: 'true: generated problems match the most recent lesson topics',
  }),
}).meta({ description: 'The daily problem slot.' })

export const partSchema = obj({
  index: int(1, 20),
  total: int(1, 20).meta({ description: 'at least index' }),
}).meta({ description: 'Present only when the plan is split across several files.' })

export const moduleSchema = obj({
  id: idString.meta({ description: 'unique across modules, tasks and sources' }),
  title: text(120),
  order: int(1, 1000).meta({ description: 'unique among modules; gaps allowed' }),
  summary: text(1000).optional(),
  notBeforeDay: int(1, 3650).optional().meta({ description: 'plan day (day 1 is the start date); never earlier than a previous module has' }),
})

export const taskSchema = obj({
  id: idString.meta({ description: 'unique across modules, tasks and sources' }),
  moduleId: idString.meta({ description: 'id of a module' }),
  order: int(1, 10000).meta({ description: 'unique within the module' }),
  title: text(120).meta({ description: 'for a problem, its name' }),
  type: oneOf(TASK_TYPES),
  estimatedMinutes: int(0, 180).meta({
    description: 'all time for the session; every type except milestone needs at least 5; keep at most 90 except for assessments',
  }),
  priority: oneOf(PRIORITIES).default('core').meta({ description: 'what may be deferred when time runs short' }),
  topics: list(10, 40).meta({ description: 'kebab-case tags, reused exactly across tasks' }),
  description: text(4000).optional().meta({ description: 'exactly what to do in this session' }),
  objectives: list(12, 300),
  keyConcepts: list(20, 300),
  tradeoffs: list(10, 300),
  verificationQuestions: list(12, 300),
  resources: z.array(resourceSchema, { error: msg('must be a list of resources') }).max(10, { error: msg('must have at most 10 items') }).default([]),
  practice: practiceSchema.optional().meta({ description: 'practice and assessment tasks only' }),
  dependsOn: z
    .array(idString, { error: msg('must be a list of task ids') })
    .max(20, { error: msg('must have at most 20 items') })
    .default([])
    .meta({ description: 'task ids of the same or higher priority; no cycles' }),
  notBeforeDay: int(1, 3650).optional().meta({ description: 'plan day; not with fixedDate; not before its module has' }),
  fixedDate: date.optional().meta({ description: 'fixed mode only' }),
  deadline: date.optional().meta({ description: 'fixed mode only' }),
})

export const planSchema = obj({
  schemaVersion: z.literal(1, { error: msg('must be 1') }),
  id: idString.meta({ description: 'stable plan id' }),
  title: text(120),
  description: text(2000).optional(),
  goal: text(500).optional(),
  subject: text(120).optional(),
  level: oneOf(LEVELS).optional(),
  audience: text(300).optional(),
  schedulingMode: oneOf(SCHEDULING_MODES).meta({
    description: 'auto: the file has no dates; fixed: startDate and at least one date are required',
  }),
  startDate: date.optional().meta({ description: 'fixed mode only (required there); day 1 of the plan' }),
  deadline: date.optional().meta({ description: 'fixed mode only; not before startDate' }),
  sources: z.array(sourceSchema, { error: msg('must be a list of sources') }).max(50, { error: msg('must have at most 50 items') }).default([]),
  dailyPractice: dailyPracticeSchema.optional(),
  studyMinutesPerWeek: int(15, 2400).optional().meta({
    description: 'study time plan only: minutes per week, from which Kiln plans a daily session; leave out modules, tasks, sources, dailyPractice and part',
  }),
  part: partSchema.optional(),
  // "At least 1" is checked in semantic.ts: a study time plan has none.
  modules: z
    .array(moduleSchema, { error: msg('must be a list of modules') })
    .max(100, { error: msg('must have at most 100 items') })
    .default([])
    .meta({ description: 'at least 1 unless studyMinutesPerWeek is set' }),
  tasks: z
    .array(taskSchema, { error: msg('must be a list of tasks') })
    .max(2000, { error: msg('must have at most 2000 items') })
    .default([])
    .meta({ description: 'at least 1 unless studyMinutesPerWeek is set' }),
})

/** A parsed plan: defaults applied (lists are arrays, priority is set). */
export type Plan = z.output<typeof planSchema>
export type PlanModule = z.output<typeof moduleSchema>
export type Task = z.output<typeof taskSchema>
export type Resource = z.output<typeof resourceSchema>
export type Source = z.output<typeof sourceSchema>
export type Practice = z.output<typeof practiceSchema>
export type DailyPractice = z.output<typeof dailyPracticeSchema>
export type Part = z.output<typeof partSchema>
export type Priority = (typeof PRIORITIES)[number]
export type TaskType = (typeof TASK_TYPES)[number]

/** What a file may contain: optional fields and defaulted fields can be left out. */
export type PlanInput = z.input<typeof planSchema>

/** The JSON Schema written to docs/plan-schema.json by `npm run schema`. */
export function planJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(planSchema, { io: 'input' })
}
