import { describe, expect, it } from 'vitest'
import { extractPlanJson, MAX_INPUT_CHARS, parsePlanJson } from './extract'

const BOM = String.fromCharCode(0xfeff)
const FENCE = '```'

function json(text: string) {
  const r = extractPlanJson(text)
  return r.ok ? r.json : r.issue.message
}

describe('extractPlanJson', () => {
  it('treats text starting with { as the whole JSON', () => {
    expect(json('  {"a": 1}\n')).toBe('{"a": 1}')
    expect(json(`${BOM}{"a": 1}`)).toBe('{"a": 1}')
  })

  it('takes the one json fence out of Markdown', () => {
    const text = `# Plan\n\nSome words\n\n${FENCE}json\n{"a": 1}\n${FENCE}\n\nafter`
    expect(json(text)).toBe('{"a": 1}')
  })

  it('accepts tildes, longer fences, any-case info and an unlabelled block that starts with {', () => {
    expect(json('~~~JSON\n{"a": 1}\n~~~')).toBe('{"a": 1}')
    expect(json(`${FENCE}${FENCE}json\n{"a": 1}\n${FENCE}${FENCE}${FENCE}`)).toBe('{"a": 1}')
    expect(json(`text\n${FENCE}\n{"a": 1}\n${FENCE}`)).toBe('{"a": 1}')
    expect(json(`${BOM}text\n   ${FENCE}json title="x"\n{"a": 1}\n${FENCE}`)).toBe('{"a": 1}')
  })

  it('ignores other fenced blocks and fences nested inside a longer fence', () => {
    const text = `${FENCE}python\nprint(1)\n${FENCE}\n${FENCE}\nnot json\n${FENCE}\n~~~~\n${FENCE}json\n{"x": 1}\n${FENCE}\n~~~~\n${FENCE}json\n{"a": 1}\n${FENCE}`
    expect(json(text)).toBe('{"a": 1}')
  })

  it('reports no block and several blocks with the spec wording', () => {
    expect(json('just words')).toBe('input: no json block found')
    expect(json('')).toBe('input: no json block found')
    const block = `${FENCE}json\n{}\n${FENCE}\n`
    expect(json(`${block}${block}${block}`)).toBe('input: found 3 json blocks; expected exactly 1')
  })

  it('runs an unclosed block to the end of the text', () => {
    expect(json(`${FENCE}json\n{"a": 1}`)).toBe('{"a": 1}')
  })

  it('rejects input over 5 MB', () => {
    expect(json('x'.repeat(MAX_INPUT_CHARS + 1))).toBe('input: text is larger than 5 MB')
  })

  it('returns how many lines come before the JSON', () => {
    const r = extractPlanJson(`\n\n# T\n${FENCE}json\n{\n"a": }\n${FENCE}`)
    expect(r.ok && r.line).toBe(4)
  })
})

describe('parsePlanJson', () => {
  const error = (s: string, line = 0) => {
    const r = parsePlanJson(s, line)
    return r.ok ? 'ok' : r.issue.message
  }

  it('parses valid JSON', () => {
    expect(parsePlanJson('{"a": [1, 2]}')).toEqual({ ok: true, value: { a: [1, 2] } })
  })

  it('reports line and column of the first syntax error', () => {
    expect(error('{\n  "a": 1,\n}')).toBe('json: line 3, column 1: unexpected "}"')
    expect(error('{"a": 1,}')).toBe('json: line 1, column 9: unexpected "}"')
    expect(error('{"a": 1')).toBe('json: line 1, column 8: unexpected end of input')
    expect(error("{'a': 1}")).toBe(`json: line 1, column 2: unexpected "'"`)
    expect(error('{"a": 1 // note\n}')).toBe('json: line 1, column 9: unexpected "/"')
    expect(error('{"a": "x\ny"}')).toBe('json: line 1, column 9: unexpected line break or control character in string')
    expect(error('{"a": "\\q"}')).toBe('json: line 1, column 8: invalid escape sequence in string')
    expect(error('{"a": 01}')).toBe('json: line 1, column 8: unexpected "1"')
  })

  it('adds the lines that come before the block', () => {
    expect(error('{\n"a": }', 10)).toBe('json: line 12, column 6: unexpected "}"')
  })
})
