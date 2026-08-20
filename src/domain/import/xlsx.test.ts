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

describe('readXlsxRows details', () => {
  it('reads dates in the 1904 date system', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['d']])
    sheet['A2'] = { t: 'n', v: Date.UTC(2026, 10, 20) / 86400000 + 25569 - 1462, z: 'yyyy-mm-dd' }
    sheet['!ref'] = 'A1:A2'
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'tasks')
    book.Workbook = { WBProps: { date1904: true } }
    const data = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(readXlsxRows(data)).toEqual([['d'], ['2026-11-20']])
  })

  it('rounds binary noise in numbers and keeps the text of time-only cells', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['n', 't']])
    sheet['A2'] = { t: 'n', v: 0.1 + 0.2 }
    sheet['B2'] = { t: 'n', v: 0.5, z: 'h:mm', w: '12:00' }
    sheet['!ref'] = 'A1:B2'
    expect(readXlsxRows(workbook({ tasks: sheet }))).toEqual([['n', 't'], ['0.3', '12:00']])
  })

  it('trims the extent to the cells that exist when the declared range is larger', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a', 'b']])
    sheet['!ref'] = 'A1:J200'
    expect(readXlsxRows(workbook({ tasks: sheet }))).toEqual([['a', 'b']])
  })

  it('rejects sheets over 5000 rows or 64 columns, and files over 5 MB', () => {
    const tall = XLSX.utils.aoa_to_sheet([['a']])
    tall['A5001'] = { t: 's', v: 'x' }
    tall['!ref'] = 'A1:A5001'
    const wide = XLSX.utils.aoa_to_sheet([['a']])
    wide['BM1'] = { t: 's', v: 'x' }
    wide['!ref'] = 'A1:BM1'
    const info = { title: 'T' }
    expect(importXlsx(workbook({ tasks: tall }), info).issues.map(formatIssue)).toEqual(['input: the sheet has more than 5000 rows'])
    expect(importXlsx(workbook({ tasks: wide }), info).issues.map(formatIssue)).toEqual(['input: the sheet has more than 64 columns'])
    expect(importXlsx(new Uint8Array(5 * 1024 * 1024 + 1), info).issues.map(formatIssue)).toEqual(['input: file is larger than 5 MB'])
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
