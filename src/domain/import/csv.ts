// CSV reader (RFC 4180): quoted cells with delimiters, doubled quotes and line breaks, a leading
// byte-order mark, and a delimiter (comma, semicolon or tab) detected from the first line.
// No imports: `npm run templates` runs this file directly in Node.

const DELIMITERS = [',', ';', '\t']

/** The delimiter that occurs most in the first line outside quotes; a comma when none does. */
export function detectDelimiter(text: string): string {
  const counts = new Map(DELIMITERS.map((d) => [d, 0]))
  let quoted = false
  for (const c of text) {
    if (c === '"') quoted = !quoted
    else if (!quoted && (c === '\n' || c === '\r')) break
    else if (!quoted && counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return DELIMITERS.reduce((best, d) => ((counts.get(d) ?? 0) > (counts.get(best) ?? 0) ? d : best), ',')
}

/** Rows of cells. A blank line is a row with one empty cell, so row numbers match a spreadsheet. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
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
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows
}
