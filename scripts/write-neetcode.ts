// Regenerates src/domain/practice/neetcode-problems.json from NeetCode's public problem list.
// Run with `npm run neetcode` (needs network). The download is treated as untrusted data: it is only
// parsed as JSON and reduced to a few validated fields. No problem text is kept.
import { writeFileSync } from 'node:fs'
import { NEETCODE_TOPICS } from '../src/domain/plan-format/topics.ts'

const SOURCE = 'https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json'

// NeetCode category name -> Kiln topic (docs/plan-format.md, "dailyPractice"). Other categories are dropped.
const TOPIC_BY_PATTERN: Record<string, (typeof NEETCODE_TOPICS)[number]> = {
  'Arrays & Hashing': 'arrays-hashing',
  'Two Pointers': 'two-pointers',
  'Sliding Window': 'sliding-window',
  Stack: 'stack',
  'Binary Search': 'binary-search',
  'Linked List': 'linked-list',
  Trees: 'trees',
  Tries: 'tries',
  'Heap / Priority Queue': 'heap',
  Backtracking: 'backtracking',
  Graphs: 'graphs',
  'Advanced Graphs': 'advanced-graphs',
  '1-D Dynamic Programming': 'dp-1d',
  '2-D Dynamic Programming': 'dp-2d',
  Greedy: 'greedy',
  Intervals: 'intervals',
  'Math & Geometry': 'math-geometry',
  'Bit Manipulation': 'bit-manipulation',
}
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`)
const raw: unknown = JSON.parse(await res.text())
if (!Array.isArray(raw)) throw new Error('unexpected shape: not an array')

const problems = []
const seen = new Set<string>()
for (const item of raw as Record<string, unknown>[]) {
  const topic = typeof item.pattern === 'string' ? TOPIC_BY_PATTERN[item.pattern] : undefined
  const slug = typeof item.link === 'string' ? item.link.replace(/\/$/, '') : ''
  const difficulty = typeof item.difficulty === 'string' ? item.difficulty.toLowerCase() : ''
  if (!topic || !SLUG.test(slug) || seen.has(slug) || typeof item.problem !== 'string') continue
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') continue
  seen.add(slug)
  problems.push({
    slug,
    title: item.problem.trim().slice(0, 120),
    difficulty,
    topic,
    ...(item.neetcode150 === true ? { neetcode150: true } : {}),
    ...(item.blind75 === true ? { blind75: true } : {}),
  })
}

const out = {
  notice:
    'Problem titles, slugs, difficulty and categories from NeetCode (https://github.com/neetcode-gh/leetcode, .problemSiteData.json), MIT License, Copyright (c) NeetCode. Reduced snapshot; regenerate with `npm run neetcode`.',
  source: SOURCE,
  problems,
}
writeFileSync(new URL('../src/domain/practice/neetcode-problems.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${problems.length} of ${raw.length} problems`)
