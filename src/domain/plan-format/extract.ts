// Finds the JSON in pasted text or a plan file (docs/plan-format.md, "How Kiln finds the JSON block")
// and turns JSON syntax errors into `json: line L, column C: ...` issues.
import { inputIssue, type Issue } from './issues'

export const MAX_INPUT_CHARS = 5 * 1024 * 1024

export type Extracted = { ok: true; json: string; line: number } | { ok: false; issue: Issue }

/**
 * The JSON text of a plan file. `line` is how many lines of the input come before the JSON, so a
 * syntax error can be reported against the text the user pasted.
 */
export function extractPlanJson(input: string): Extracted {
  if (input.length > MAX_INPUT_CHARS) return { ok: false, issue: inputIssue('input', 'text is larger than 5 MB') }
  // trim() also removes a leading byte-order mark.
  const text = input.trim()
  const line = countLines(input.slice(0, input.length - input.trimStart().length))
  if (text.startsWith('{')) return { ok: true, json: text, line }

  const lines = text.split('\n')
  const found: { json: string; line: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]?.trimEnd() ?? '')
    const fence = open?.[1]
    const info = open?.[2]?.trim()
    if (fence === undefined || info === undefined || (fence.startsWith('`') && info.includes('`'))) continue
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !closesFence(lines[j] ?? '', fence)) body.push(lines[j++] ?? '')
    const content = body.join('\n')
    const language = info.split(/\s+/)[0]?.toLowerCase()
    if (language === 'json' || (info === '' && content.trimStart().startsWith('{'))) {
      found.push({ json: content, line: line + i + 1 })
    }
    i = j
  }
  const [only] = found
  if (found.length === 1 && only !== undefined) return { ok: true, ...only }
  const problem = found.length === 0 ? 'no json block found' : `found ${found.length} json blocks; expected exactly 1`
  return { ok: false, issue: inputIssue('input', problem) }
}

/** Parses the extracted JSON; a syntax error becomes an issue with its line and column. */
export function parsePlanJson(json: string, line = 0): { ok: true; value: unknown } | { ok: false; issue: Issue } {
  try {
    return { ok: true, value: JSON.parse(json) as unknown }
  } catch (e) {
    const where = locateJsonError(json)
    const text = where
      ? `line ${line + where.line}, column ${where.column}: ${where.message}`
      : e instanceof Error
        ? e.message
        : 'invalid JSON'
    return { ok: false, issue: inputIssue('json', text) }
  }
}

function countLines(s: string): number {
  return s.split('\n').length - 1
}

function closesFence(line: string, fence: string): boolean {
  const t = line.trim()
  return t.length >= fence.length && [...t].every((c) => c === fence[0])
}

// Browsers word JSON.parse errors differently and some give no position, so the first syntax error
// is found with a small RFC 8259 scanner instead.
class JsonSyntaxError extends Error {
  pos: number
  constructor(pos: number, message: string) {
    super(message)
    this.pos = pos
  }
}

function locateJsonError(s: string): { line: number; column: number; message: string } | null {
  let i = 0
  const unexpected = (): never => {
    throw new JsonSyntaxError(i, i >= s.length ? 'unexpected end of input' : `unexpected "${s.charAt(i)}"`)
  }
  const skip = () => {
    while (i < s.length && ' \t\n\r'.includes(s.charAt(i))) i++
  }
  const string = () => {
    i++
    for (;;) {
      const c = s.charAt(i)
      if (i >= s.length) unexpected()
      if (c === '"') return void i++
      if (c < ' ') throw new JsonSyntaxError(i, 'unexpected line break or control character in string')
      if (c === '\\') {
        const e = s.charAt(i + 1)
        if (e === 'u' ? !/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6)) : !'"\\/bfnrt'.includes(e) || e === '') {
          throw new JsonSyntaxError(i, 'invalid escape sequence in string')
        }
        i += e === 'u' ? 6 : 2
      } else i++
    }
  }
  const value = (): void => {
    skip()
    const c = s.charAt(i)
    if (c === '{') {
      i++
      skip()
      if (s.charAt(i) === '}') return void i++
      for (;;) {
        skip()
        if (s.charAt(i) !== '"') unexpected()
        string()
        skip()
        if (s.charAt(i) !== ':') unexpected()
        i++
        value()
        skip()
        if (s.charAt(i) === ',') i++
        else if (s.charAt(i) === '}') return void i++
        else unexpected()
      }
    } else if (c === '[') {
      i++
      skip()
      if (s.charAt(i) === ']') return void i++
      for (;;) {
        value()
        skip()
        if (s.charAt(i) === ',') i++
        else if (s.charAt(i) === ']') return void i++
        else unexpected()
      }
    } else if (c === '"') string()
    else {
      const literal = /true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y
      literal.lastIndex = i
      const m = literal.exec(s)
      if (!m) unexpected()
      i += m?.[0].length ?? 0
    }
  }
  try {
    value()
    skip()
    if (i < s.length) unexpected()
    return null
  } catch (e) {
    if (!(e instanceof JsonSyntaxError)) return null
    const before = s.slice(0, e.pos)
    return { line: countLines(before) + 1, column: e.pos - before.lastIndexOf('\n'), message: e.message }
  }
}
