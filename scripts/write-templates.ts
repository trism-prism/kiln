// Builds public/kiln-plan-template.xlsx from public/kiln-plan-template.csv (the CSV is the source).
// Run with `npm run templates`.
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { parseCsv } from '../src/domain/import/csv.ts'

const rows = parseCsv(readFileSync(new URL('../public/kiln-plan-template.csv', import.meta.url), 'utf8'))
const sheet = XLSX.utils.aoa_to_sheet(rows)
sheet['!cols'] = (rows[0] ?? []).map((name) => ({ wch: Math.max(14, name.length + 2) }))
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, sheet, 'tasks')
writeFileSync(new URL('../public/kiln-plan-template.xlsx', import.meta.url), XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
console.log('wrote public/kiln-plan-template.xlsx')
