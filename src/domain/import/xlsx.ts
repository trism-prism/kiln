// XLSX reading. Kept apart from sheet.ts so the large `xlsx` package is only loaded when a user
// picks an .xlsx file: import this module with `await import('./xlsx')`.
import * as XLSX from 'xlsx'
import { importSheetRows, type SheetPlanInfo } from './sheet'
import type { SemanticOptions, ValidationResult } from '../plan-format'

/** Cells of the sheet named `tasks` (or the first sheet) as text; formula cells give their cached value. */
export function readXlsxRows(data: ArrayBuffer | Uint8Array): string[][] {
  const book = XLSX.read(data, { type: 'array', cellNF: true })
  const name = book.SheetNames.find((n) => n.trim().toLowerCase() === 'tasks') ?? book.SheetNames[0]
  const sheet = name === undefined ? undefined : book.Sheets[name]
  if (sheet?.['!ref'] === undefined) return []
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const rows: string[][] = []
  // From row 1 and column A, so row numbers match what Excel shows.
  for (let r = 0; r <= range.e.r; r++) {
    const cells: string[] = []
    for (let c = 0; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      cells.push(cell === undefined ? '' : cellText(cell))
    }
    rows.push(cells)
  }
  return rows
}

function cellText(cell: XLSX.CellObject): string {
  if (cell.v === undefined || cell.v === null) return ''
  if (cell.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v) as { y: number; m: number; d: number }
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return cell.t === 'e' ? (cell.w ?? '') : String(cell.v)
}

export function importXlsx(data: ArrayBuffer | Uint8Array, info: SheetPlanInfo, opts: SemanticOptions = {}): ValidationResult {
  return importSheetRows(readXlsxRows(data), info, opts)
}
