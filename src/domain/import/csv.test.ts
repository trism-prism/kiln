import { describe, expect, it } from 'vitest'
import { CsvError, detectDelimiter, parseCsv } from './csv'

describe('CSV edge cases', () => {
  it('reports the row where an unclosed quote opened', () => {
    const text = 'a,b\n1,2\n3,"never closed\n4,5'
    expect(() => parseCsv(text)).toThrow(CsvError)
    expect(() => parseCsv(text)).toThrow('never closed')
    try {
      parseCsv(text)
    } catch (e) {
      expect((e as CsvError).row).toBe(3)
    }
  })

  it('picks the delimiter that yields the most known column names', () => {
    const known = ['moduleId', 'id', 'title']
    expect(detectDelimiter('moduleId;id;title,extra', known)).toBe(';')
    expect(detectDelimiter('moduleId\tid\ttitle', known)).toBe('\t')
    expect(detectDelimiter('a;b;c', known)).toBe(',')
    expect(detectDelimiter('"moduleId,x";id;title', known)).toBe(';')
  })
})

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
