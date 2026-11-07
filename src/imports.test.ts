// No two source modules import each other (directly or round a loop). A cycle makes one side see the
// other's exports as undefined during load, which fails only in some import orders. Type-only imports are erased, so they don't count.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(__dirname)

function graph(): Map<string, string[]> {
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(root, f))
  const out = new Map<string, string[]>()
  for (const f of files) {
    const deps: string[] = []
    for (const m of readFileSync(f, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.[^']+)'/gm)) {
      const base = resolve(dirname(f), m[1]!)
      const hit = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''].map((e) => base + e).find((p) => /\.tsx?$/.test(p) && existsSync(p))
      if (hit) deps.push(hit)
    }
    out.set(f, deps)
  }
  return out
}

it('has no import cycles', () => {
  const g = graph()
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const cycles: string[] = []
  const visit = (f: string) => {
    state.set(f, 'open')
    stack.push(f)
    for (const d of g.get(f) ?? []) {
      if (state.get(d) === 'open') cycles.push([...stack.slice(stack.indexOf(d)), d].map((p) => relative(root, p)).join(' -> '))
      else if (!state.has(d)) visit(d)
    }
    stack.pop()
    state.set(f, 'done')
  }
  for (const f of g.keys()) if (!state.has(f)) visit(f)
  expect(cycles).toEqual([])
})
