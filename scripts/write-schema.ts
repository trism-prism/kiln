// Writes docs/plan-schema.json from the Zod plan schema. Run with `npm run schema`.
import { writeFileSync } from 'node:fs'
import { planJsonSchema } from '../src/domain/plan-format/schema.ts'

const out = new URL('../docs/plan-schema.json', import.meta.url)
writeFileSync(out, JSON.stringify(planJsonSchema(), null, 2) + '\n')
console.log("wrote docs/plan-schema.json")
