// Regenerates everything derived from the Zod plan schema. Run with `npm run schema`:
//  - docs/plan-schema.json (JSON Schema)
//  - the field reference at the bottom of each file in docs/prompts
// Imports use explicit .ts extensions so Node can run this file directly.
import { readFileSync, writeFileSync } from 'node:fs'
import { fillReferenceSection, schemaReference } from '../src/domain/plan-format/reference.ts'
import { planJsonSchema } from '../src/domain/plan-format/schema.ts'

const schema = planJsonSchema()
writeFileSync(new URL('../docs/plan-schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n')
console.log('wrote docs/plan-schema.json')

for (const name of ['auto-dates', 'fixed-dates']) {
  const file = new URL(`../docs/prompts/${name}.md`, import.meta.url)
  writeFileSync(file, fillReferenceSection(readFileSync(file, 'utf8'), schemaReference(schema)))
  console.log(`wrote docs/prompts/${name}.md`)
}
