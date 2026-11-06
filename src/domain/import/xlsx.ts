// XLSX reading. Kept apart from sheet.ts so the large `xlsx` package is only loaded when a user
// picks an .xlsx file: import this module with `await import('./xlsx')`.
import * as XLSX from 'xlsx'
import { inputIssue, MAX_INPUT_CHARS, type SemanticOptions, type ValidationResult } from '../plan-format'
import { importSheetRows, tooBig, type SheetPlanInfo } from './sheet'

export const MAX_SHEET_ROWS = 5000
export const MAX_SHEET_COLUMNS = 64

/** A sheet that is too large to read. */
export class SheetTooLarge extends Error {}

/** Cells of the sheet named `tasks` (or the first sheet) as text; formula cells give their cached value. */
export function readXlsxRows(data: ArrayBuffer | Uint8Array): string[][] {
  const book = XLSX.read(data, { type: 'array', cellNF: true })
  const date1904 = book.Workbook?.WBProps?.date1904 === true
  const name = book.SheetNames.find((n) => n.trim().toLowerCase() === 'tasks') ?? book.SheetNames[0]
  const sheet = name === undefined ? undefined : book.Sheets[name]
  if (sheet === undefined) return []
  // The extent comes from the cells that exist: a sheet's declared range can be huge and empty.
  const cells = new Map<string, XLSX.CellObject>()
  let lastRow = -1
  let lastColumn = -1
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue
    const { r, c } = XLSX.utils.decode_cell(key)
    cells.set(key, sheet[key] as XLSX.CellObject)
    lastRow = Math.max(lastRow, r)
    lastColumn = Math.max(lastColumn, c)
  }
  if (lastRow >= MAX_SHEET_ROWS) throw new SheetTooLarge(`the sheet has more than ${MAX_SHEET_ROWS} rows`)
  if (lastColumn >= MAX_SHEET_COLUMNS) throw new SheetTooLarge(`the sheet has more than ${MAX_SHEET_COLUMNS} columns`)
  // From row 1 and column A, so row numbers match what Excel shows.
  const rows: string[][] = []
  for (let r = 0; r <= lastRow; r++) {
    const row: string[] = []
    for (let c = 0; c <= lastColumn; c++) {
      const cell = cells.get(XLSX.utils.encode_cell({ r, c }))
      row.push(cell === undefined ? '' : cellText(cell, date1904))
    }
    rows.push(row)
  }
  return rows
}

function cellText(cell: XLSX.CellObject, date1904: boolean): string {
  if (cell.v === undefined || cell.v === null) return ''
  if (cell.t === 'e') return cell.w ?? ''
  if (cell.t === 'n' && typeof cell.v === 'number') {
    if (typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) {
      // A format with no year or day part (h:mm) is a time of day, not a date: keep Excel's own text.
      if (!/[yd]/i.test(cell.z.replace(/"[^"]*"/g, ''))) return cell.w ?? String(cell.v)
      const d = XLSX.SSF.parse_date_code(cell.v, { date1904 }) as { y: number; m: number; d: number }
      return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
    // Drops binary noise such as 0.1 + 0.2 = 0.30000000000000004.
    return String(Number(cell.v.toPrecision(15)))
  }
  return String(cell.v)
}

export function importXlsx(data: ArrayBuffer | Uint8Array, info: SheetPlanInfo, opts: SemanticOptions = {}): ValidationResult {
  if (data.byteLength > MAX_INPUT_CHARS) return tooBig('file')
  try {
    return importSheetRows(readXlsxRows(data), info, opts)
  } catch (e) {
    if (e instanceof SheetTooLarge) return { issues: [inputIssue('input', e.message)] }
    throw e
  }
}
