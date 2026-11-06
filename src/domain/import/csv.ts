// CSV reader (RFC 4180): quoted cells with delimiters, doubled quotes and line breaks, a leading
// byte-order mark, and a delimiter (comma, semicolon or tab) detected from the first line.
// No imports: `npm run templates` runs this file directly in Node.

const DELIMITERS = [',', ';', '\t']

/** A quoted cell that never closes; `row` is the row where its quote opened (header = row 1). */
export class CsvError extends Error {
  row: number
  constructor(row: number, message: string) {
    super(message)
    this.row = row
  }
}

function firstLine(text: string): string {
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i)
    if (c === '"') quoted = !quoted
    else if (!quoted && (c === '\n' || c === '\r')) return text.slice(0, i)
  }
  return text
}

/**
 * The delimiter that splits the first line into the most known column names (`known`, any case);
 * without `known`, the one that occurs most. Ties go to the comma.
 */
export function detectDelimiter(text: string, known: readonly string[] = []): string {
  const line = firstLine(text)
  const names = new Set(known.map((k) => k.toLowerCase()))
  const score = (d: string) => {
    let cells: string[]
    try {
      cells = parseRows(line, d)[0] ?? []
    } catch {
      cells = []
    }
    return names.size > 0 ? cells.filter((c) => names.has(c.trim().toLowerCase())).length : cells.length - 1
  }
  return DELIMITERS.reduce((best, d) => (score(d) > score(best) ? d : best), ',')
}

/** Rows of cells. A blank line is a row with one empty cell, so row numbers match a spreadsheet. */
export function parseCsv(input: string, known: readonly string[] = []): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  return parseRows(text, detectDelimiter(text, known))
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let openedAt = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i)
    if (quoted) {
      if (c !== '"') cell += c
      else if (text.charAt(i + 1) === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (c === '"' && cell === '') {
      quoted = true
      openedAt = rows.length + 1
    } else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (quoted) throw new CsvError(openedAt, 'a quoted cell is never closed')
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows
}
