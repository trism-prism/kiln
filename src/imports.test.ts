// No two source modules import each other (directly or round a loop). A cycle makes one side see the
// other's exports as undefined during load, which fails only in some import orders. Type-only imports are erased, so they don't count.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(__dirname)

/** Relative paths a module imports at run time, in either quote style, including side-effect imports (`import './x'`). */
const imported = (src: string) => [...src.matchAll(/^(?:import|export)\s+(?!type\b)(?:[^'"]*?from\s+)?(['"])(\.[^'"]+)\1/gm)].map((m) => m[2]!)

function graph(): Map<string, string[]> {
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(root, f))
  const out = new Map<string, string[]>()
  for (const f of files) {
    const deps: string[] = []
    for (const path of imported(readFileSync(f, 'utf8'))) {
      const base = resolve(dirname(f), path)
      const hit = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''].map((e) => base + e).find((p) => /\.tsx?$/.test(p) && existsSync(p))
      if (hit) deps.push(hit)
    }
    out.set(f, deps)
  }
  return out
}

it('reads every kind of run-time import', () => {
  const src = [
    `import a from './a'`,
    `import { b } from "./b"`,
    `import './c'`,
    `import "./d"`,
    `export * from './e'`,
    `import type { F } from './f'`,
    `import x from 'react'`,
  ].join('\n')
  expect(imported(src)).toEqual(['./a', './b', './c', './d', './e'])
})

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
