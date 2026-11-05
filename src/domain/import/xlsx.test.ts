import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { formatIssue } from '../plan-format'
import { importXlsx, readXlsxRows } from './xlsx'

const HEADER = ['moduleId', 'moduleTitle', 'id', 'title', 'type', 'estimatedMinutes', 'description', 'topics', 'fixedDate']

function workbook(sheets: Record<string, XLSX.WorkSheet>): Uint8Array {
  const book = XLSX.utils.book_new()
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, sheet, name)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

describe('readXlsxRows', () => {
  it('prefers the sheet named tasks, keeps formula results and converts date cells', () => {
    const tasks = XLSX.utils.aoa_to_sheet([HEADER, ['m', 'Module', 'exam', 'Exam', 'assessment', '', 'Closed book', 't', '']])
    const excelDate = Date.UTC(2026, 10, 20) / 86400000 + 25569
    tasks['F2'] = { t: 'n', f: '30+60', v: 90 }
    tasks['I2'] = { t: 'n', v: excelDate, z: 'yyyy-mm-dd' }
    tasks['!ref'] = 'A1:I2'
    const other = XLSX.utils.aoa_to_sheet([['nothing']])
    const rows = readXlsxRows(workbook({ Notes: other, Tasks: tasks }))
    expect(rows).toEqual([HEADER, ['m', 'Module', 'exam', 'Exam', 'assessment', '90', 'Closed book', 't', '2026-11-20']])
  })

  it('falls back to the first sheet', () => {
    const rows = readXlsxRows(workbook({ Plan: XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2.5]]) }))
    expect(rows).toEqual([['a', 'b'], ['1', '2.5']])
  })
})

describe('importXlsx', () => {
  it('imports a sheet with an Excel date cell as a fixed plan', () => {
    const sheet = XLSX.utils.aoa_to_sheet([HEADER, ['m', 'Module', 'exam', 'Exam', 'assessment', 60, 'Closed book', 't', '']])
    sheet['I2'] = { t: 'n', v: Date.UTC(2026, 11, 11) / 86400000 + 25569, z: 'yyyy-mm-dd' }
    const r = importXlsx(workbook({ tasks: sheet }), { title: 'Stats', startDate: '2026-11-09' })
    expect(r.issues.map(formatIssue)).toEqual([])
    expect(r.plan?.schedulingMode).toBe('fixed')
    expect(r.plan?.tasks[0]).toMatchObject({ estimatedMinutes: 60, fixedDate: '2026-12-11' })
  })
})
