/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import planImportDoc from '../../../docs/plan-import.md?raw'
import { formatIssue } from '../plan-format'
import { parseCsv } from './csv'
import { importSheetText, looksLikeSheet } from './sheet'
import { importXlsx, readXlsxRows } from './xlsx'

const file = (name: string) => readFileSync(new URL(`../../../public/${name}`, import.meta.url))
const info = { title: 'Template check' }

describe('plan templates', () => {
  const csv = file('kiln-plan-template.csv').toString('utf8')

  it('the CSV is the example in docs/plan-import.md', () => {
    const block = /```csv\r?\n([\s\S]*?)```/.exec(planImportDoc)?.[1]
    expect(csv.replace(/\r\n/g, '\n')).toBe(block?.replace(/\r\n/g, '\n'))
  })

  it('the CSV imports with no errors', () => {
    expect(looksLikeSheet(csv)).toBe(true)
    const r = importSheetText(csv, info)
    expect(r.issues.filter((i) => i.severity === 'error').map(formatIssue)).toEqual([])
    expect(r.plan?.tasks.map((t) => t.id)).toEqual(['hash-map-basics', 'two-sum', 'contains-duplicate'])
  })

  it('the XLSX has the same cells as the CSV and imports with no errors', () => {
    const xlsx = file('kiln-plan-template.xlsx')
    expect(readXlsxRows(xlsx)).toEqual(parseCsv(csv))
    const r = importXlsx(xlsx, info)
    expect(r.issues.filter((i) => i.severity === 'error').map(formatIssue)).toEqual([])
    expect(r.plan?.tasks).toHaveLength(3)
  })
})
