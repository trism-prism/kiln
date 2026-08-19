// The text the "Copy prompt" buttons put on the clipboard: the part of a prompt file between its
// prompt:start and prompt:end markers, with the field reference generated from the plan schema.
import { schemaReference } from './reference'
import { planJsonSchema } from './schema'

const START = '<!-- prompt:start -->'
const END = '<!-- prompt:end -->'
const PLACEHOLDER = '{{SCHEMA_REFERENCE}}'

/** `markdown` is the content of docs/prompts/auto-dates.md or fixed-dates.md. */
export function buildPrompt(markdown: string): string {
  const a = markdown.indexOf(START)
  const b = markdown.indexOf(END)
  if (a < 0 || b < a) throw new Error('prompt:start and prompt:end markers not found')
  const body = markdown.slice(a + START.length, b).replace(/\r\n/g, '\n').trim()
  if (!body.includes(PLACEHOLDER)) throw new Error(`${PLACEHOLDER} not found in the prompt`)
  const reference = schemaReference(planJsonSchema())
  // split/join: every occurrence, and "$" in the reference is not read as a replacement pattern.
  return body.split(PLACEHOLDER).join(reference)
}
