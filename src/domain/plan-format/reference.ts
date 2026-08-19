// The field reference pasted into the LLM prompts, generated from the plan's JSON Schema
// (planJsonSchema in schema.ts), so the prompts cannot drift from the schema.
//
// No imports: `npm run schema` runs this file directly in Node to refresh the copy in docs/prompts.

type Json = Record<string, unknown>

const isJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** What a list-of-objects field holds, and the name its object is shown under. */
const OBJECT_NAMES: Record<string, string> = {
  sources: 'Source',
  dailyPractice: 'DailyPractice',
  part: 'Part',
  modules: 'Module',
  tasks: 'Task',
  resources: 'Resource',
  practice: 'Practice',
}

const range = (min: unknown, max: unknown) => (typeof min === 'number' && typeof max === 'number' ? `${min}-${max}` : '')

function typeText(name: string, prop: Json): string {
  if ('const' in prop) return `must be ${String(prop.const)}`
  if (Array.isArray(prop.enum)) return `one of ${prop.enum.join(' | ')}`
  switch (prop.type) {
    case 'integer':
      return `integer ${range(prop.minimum, prop.maximum)}`.trim()
    case 'boolean':
      return 'true or false'
    case 'string':
      if (prop.format === 'date') return 'date yyyy-mm-dd'
      if (prop.format === 'uri') return 'absolute http(s) URL'
      if (typeof prop.pattern === 'string') return 'lowercase slug (letters, digits, hyphens)'
      return typeof prop.maxLength === 'number' ? `text, at most ${prop.maxLength} characters` : 'text'
    case 'array': {
      const items = isJson(prop.items) ? prop.items : {}
      const what = items.type === 'object' ? `${OBJECT_NAMES[name] ?? 'object'} objects` : `${typeText(name, items)} each`
      const max = prop.maxItems
      const count =
        typeof max !== 'number' ? '' : typeof prop.minItems === 'number' ? `, ${prop.minItems}-${max} items` : `, at most ${max} items`
      return `list of ${what}${count}`
    }
    case 'object':
      return `${OBJECT_NAMES[name] ?? 'object'} object`
    default:
      return 'value'
  }
}

function fieldLine(name: string, prop: Json, required: boolean): string {
  const dflt = prop.default
  const hasDefault = dflt !== undefined && !Array.isArray(dflt)
  const type = `${typeText(name, prop)}${hasDefault ? `, default ${String(dflt)}` : ''}`
  const description = typeof prop.description === 'string' ? ` ${prop.description}` : ''
  return `- \`${name}\` (${required ? 'required' : 'optional'}): ${type}.${description}`
}

function objectBlock(title: string, schema: Json): string[] {
  const props = isJson(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required) ? schema.required : []
  const about = typeof schema.description === 'string' ? ` ${schema.description}` : ''
  const lines = [`### ${title}`, ...(about ? [about.trim(), ''] : [])]
  for (const [name, prop] of Object.entries(props)) if (isJson(prop)) lines.push(fieldLine(name, prop, required.includes(name)))
  return lines
}

/** The field reference text for a plan's JSON Schema (the output of planJsonSchema()). */
export function schemaReference(schema: Json): string {
  const props = isJson(schema.properties) ? schema.properties : {}
  const itemsOf = (name: string): Json => {
    const p = props[name]
    return isJson(p) && isJson(p.items) ? p.items : {}
  }
  const tasks = itemsOf('tasks')
  const taskProps = isJson(tasks.properties) ? tasks.properties : {}
  const blocks: Json[] = [
    { ...schema, description: 'The top level of the file.' },
    itemsOf('modules'),
    tasks,
    isJson(taskProps.resources) && isJson(taskProps.resources.items) ? taskProps.resources.items : {},
    isJson(taskProps.practice) ? taskProps.practice : {},
    itemsOf('sources'),
    isJson(props.dailyPractice) ? props.dailyPractice : {},
    isJson(props.part) ? props.part : {},
  ]
  const titles = ['Plan', 'Module', 'Task', 'Resource', 'Practice', 'Source', 'DailyPractice', 'Part']
  const out = blocks.flatMap((b, i) => [...objectBlock(titles[i] ?? '', b), ''])
  out.push(
    'Text is plain text, not Markdown. Leave out optional fields you have nothing for instead of writing null or an empty string.',
  )
  return out.join('\n')
}

const START = '<!-- schema-reference:start -->'
const END = '<!-- schema-reference:end -->'

/** Replaces the text between the schema-reference markers of a prompt file with `reference`. */
export function fillReferenceSection(markdown: string, reference: string): string {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const a = markdown.indexOf(START)
  const b = markdown.indexOf(END)
  if (a < 0 || b < a) throw new Error('schema-reference markers not found')
  const body = reference.replace(/\n/g, eol)
  return `${markdown.slice(0, a + START.length)}${eol}${body}${eol}${markdown.slice(b)}`
}
