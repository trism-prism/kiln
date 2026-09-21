import { describe, expect, it } from 'vitest'
import autoDates from '../../../docs/prompts/auto-dates.md?raw'
import fixedDates from '../../../docs/prompts/fixed-dates.md?raw'
import schemaFile from '../../../docs/plan-schema.json?raw'
import { buildPrompt } from './prompts'
import { fillReferenceSection, schemaReference } from './reference'
import { planJsonSchema } from './schema'

const files = { 'auto-dates.md': autoDates, 'fixed-dates.md': fixedDates }
const count = (text: string, part: string) => text.split(part).length - 1

describe.each(Object.entries(files))('prompt file %s', (_name, markdown) => {
  it('has exactly one marker pair and one placeholder inside it', () => {
    expect(count(markdown, '<!-- prompt:start -->')).toBe(1)
    expect(count(markdown, '<!-- prompt:end -->')).toBe(1)
    const inside = markdown.slice(markdown.indexOf('<!-- prompt:start -->'), markdown.indexOf('<!-- prompt:end -->'))
    expect(count(inside, '{{SCHEMA_REFERENCE}}')).toBe(1)
    expect(count(markdown, '<!-- schema-reference:start -->')).toBe(1)
    expect(count(markdown, '<!-- schema-reference:end -->')).toBe(1)
  })

  it('has an up-to-date generated reference at the bottom (run `npm run schema` to refresh)', () => {
    expect(fillReferenceSection(markdown, schemaReference(planJsonSchema()))).toBe(markdown)
  })

  it('builds a prompt with the reference filled in and nothing outside the markers', () => {
    const prompt = buildPrompt(markdown)
    expect(prompt).not.toContain('{{SCHEMA_REFERENCE}}')
    expect(prompt).not.toContain('prompt:start')
    expect(prompt).toContain(schemaReference(planJsonSchema()))
    expect(prompt.startsWith('You are helping me create a study plan')).toBe(true)
  })

  it('asks for a class calendar and keeps the questions plain', () => {
    const prompt = buildPrompt(markdown)
    expect(prompt).toContain('Do you have a class calendar link? Paste it here, or say no.')
    expect(prompt).toContain('Talk to me in plain, friendly language')
    expect(prompt).toContain('Copy this whole reply and paste it into Kiln.')
    // The questions are relayed to me as written; the reference further down keeps its yyyy-mm-dd format for the AI.
    expect(prompt.slice(0, prompt.indexOf('## Step 2'))).not.toContain('yyyy-mm-dd')
    expect(prompt).not.toContain('reviews Kiln adds')
    // The closing line for a long plan is the same, word for word, in the closing rule and the long-plan rule.
    const long = '"Copy this whole reply and paste it into Kiln. Then reply next for the rest of the plan."'
    expect(prompt).toContain(`(in a long plan, after every part but the last: ${long})`)
    expect(prompt).toContain(`Write part 1, then stop; after its block write only: ${long}`)
  })
})

describe('fixed-dates prompt', () => {
  it('has the AI confirm a date that reads two ways', () => {
    expect(buildPrompt(fixedDates)).toContain('could be read two ways, such as 03/04, ask me which I mean')
  })
})

describe('buildPrompt', () => {
  it('rejects malformed files and accepts CRLF', () => {
    expect(() => buildPrompt('no markers')).toThrow('markers')
    expect(() => buildPrompt('<!-- prompt:start -->no placeholder<!-- prompt:end -->')).toThrow('SCHEMA_REFERENCE')
    expect(buildPrompt('<!-- prompt:start -->\r\nA {{SCHEMA_REFERENCE}} B\r\n<!-- prompt:end -->')).toMatch(/^A ### Plan/)
    const twice = buildPrompt('<!-- prompt:start -->{{SCHEMA_REFERENCE}} and {{SCHEMA_REFERENCE}}<!-- prompt:end -->')
    expect(twice).not.toContain('{{SCHEMA_REFERENCE}}')
    expect(twice.split('### Plan')).toHaveLength(3)
  })
})

describe('schemaReference', () => {
  it('mentions every field of every object in the schema', () => {
    const text = schemaReference(planJsonSchema())
    const names = new Set<string>()
    const walk = (node: unknown) => {
      if (typeof node !== 'object' || node === null) return
      const props = (node as { properties?: Record<string, unknown> }).properties
      for (const [name, child] of Object.entries(props ?? {})) {
        names.add(name)
        walk(child)
      }
      walk((node as { items?: unknown }).items)
    }
    walk(planJsonSchema())
    expect(names.size).toBeGreaterThan(40)
    for (const name of names) expect(text).toContain(`\`${name}\``)
  })

  it('states types, ranges, enums and defaults', () => {
    const text = schemaReference(planJsonSchema())
    expect(text).toContain('- `schemaVersion` (required): must be 1.')
    expect(text).toContain('- `type` (required): one of lesson | practice | review | project | assessment | milestone.')
    expect(text).toContain('- `priority` (optional): one of core | recommended | optional, default core.')
    expect(text).toContain('- `resources` (optional): list of Resource objects, at most 10 items.')
    expect(text).toContain('- `startDate` (optional): date yyyy-mm-dd.')
  })
})

describe('docs/plan-schema.json', () => {
  it('equals planJsonSchema() (run `npm run schema` to refresh)', () => {
    expect(JSON.parse(schemaFile)).toEqual(planJsonSchema())
  })
})

describe('study time plans in the prompts', () => {
  it.each(Object.entries(files))('%s describes a study time plan', (_name, markdown) => {
    const prompt = buildPrompt(markdown)
    expect(prompt).toContain('"studyMinutesPerWeek": 180')
    expect(prompt).toContain('If I only want regular study time for a subject')
  })
})
