import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads plain rows with LF, CRLF and no final newline', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })

  it('reads quoted cells: delimiter, doubled quotes and line breaks', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line1\nline2', 'z'],
    ])
  })

  it('keeps empty cells and blank lines as rows', () => {
    expect(parseCsv('a,,c\n\n,,')).toEqual([['a', '', 'c'], [''], ['', '', '']])
  })

  it('drops a byte-order mark', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'a,b')).toEqual([['a', 'b']])
  })

  it('detects semicolon and tab delimiters from the first line', () => {
    expect(parseCsv('a;b;c\n1;2,5;3')).toEqual([['a', 'b', 'c'], ['1', '2,5', '3']])
    expect(parseCsv('a\tb\n"x\ty"\tz')).toEqual([['a', 'b'], ['x\ty', 'z']])
    expect(detectDelimiter('"a;b",c')).toBe(',')
    expect(detectDelimiter('one column')).toBe(',')
  })
})
