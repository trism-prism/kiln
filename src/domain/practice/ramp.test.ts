import { describe, expect, it } from 'vitest'
import { NEETCODE_POOL, NEETCODE_SLUGS } from './pool'
import { NEETCODE_TOPICS } from '../plan-format'
import { pickProblem, roadmapTopic, targetDifficulty, type Solved } from './index'
import type { Difficulty, PoolProblem } from './pool'

const solved = (n: number, difficulty: Difficulty, topic: string, rating = 3): Solved[] =>
  Array.from({ length: n }, (_, i) => ({ slug: `${difficulty}-${topic}-${i}`, difficulty, topic, rating }))

describe('targetDifficulty', () => {
  it.each<[string, Parameters<typeof targetDifficulty>[0], Difficulty]>([
    ['nothing solved', { startDifficulty: 'easy', solved: [], inFinalDays: false }, 'easy'],
    ['4 good easy', { startDifficulty: 'easy', solved: solved(4, 'easy', 'stack'), topic: 'stack', inFinalDays: false }, 'easy'],
    ['5 good easy, 5 in topic', { startDifficulty: 'easy', solved: solved(5, 'easy', 'stack'), topic: 'stack', inFinalDays: false }, 'medium'],
    [
      '5 good easy but only 1 in the new topic',
      { startDifficulty: 'easy', solved: [...solved(4, 'easy', 'stack'), ...solved(1, 'easy', 'trees')], topic: 'trees', inFinalDays: false },
      'easy',
    ],
    ['5 easy rated Hard do not count', { startDifficulty: 'easy', solved: solved(5, 'easy', 'stack', 2), topic: 'stack', inFinalDays: false }, 'easy'],
    ['rated Easy (4) counts', { startDifficulty: 'easy', solved: solved(5, 'easy', 'stack', 4), topic: 'stack', inFinalDays: false }, 'medium'],
    ['start medium skips the gate', { startDifficulty: 'medium', solved: [], inFinalDays: false }, 'medium'],
    ['start hard', { startDifficulty: 'hard', solved: [], inFinalDays: false }, 'hard'],
    [
      '10 mediums: hard is unlocked, but this is problem 16 of the cycle',
      { startDifficulty: 'easy', solved: [...solved(5, 'easy', 'stack'), ...solved(10, 'medium', 'stack')], topic: 'stack', inFinalDays: false },
      'medium', // 15 solved, 15 % 3 === 0
    ],
    [
      'final 14 days unlock hard',
      { startDifficulty: 'easy', solved: solved(2, 'easy', 'stack'), inFinalDays: true },
      'hard', // 2 solved, 2 % 3 === 2
    ],
  ])('%s', (_name, ctx, expected) => {
    expect(targetDifficulty(ctx)).toBe(expected)
  })

  it('hard is every third problem once unlocked, medium otherwise', () => {
    const base = [...solved(5, 'easy', 'stack'), ...solved(10, 'medium', 'stack')]
    const seq = [0, 1, 2, 3].map((i) =>
      targetDifficulty({ startDifficulty: 'easy', solved: [...base, ...solved(i, 'hard', 'stack')], topic: 'stack', inFinalDays: false }),
    )
    expect(seq).toEqual(['medium', 'medium', 'hard', 'medium'])
  })
})

describe('pool and picking', () => {
  const pool: PoolProblem[] = [
    { slug: 'a1', title: 'A1', difficulty: 'easy', topic: 'arrays-hashing' },
    { slug: 'a2', title: 'A2', difficulty: 'medium', topic: 'arrays-hashing', neetcode150: true },
    { slug: 'a3', title: 'A3', difficulty: 'medium', topic: 'arrays-hashing' },
    { slug: 's1', title: 'S1', difficulty: 'easy', topic: 'stack' },
  ]

  it('the bundled snapshot has valid slugs, topics and attribution', () => {
    expect(NEETCODE_POOL.length).toBeGreaterThan(300)
    expect(NEETCODE_SLUGS.size).toBe(NEETCODE_POOL.length)
    for (const p of NEETCODE_POOL) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(NEETCODE_TOPICS as readonly string[]).toContain(p.topic)
    }
  })

  it('topic beats difficulty; NeetCode 150 comes first; unused only', () => {
    expect(pickProblem(pool, new Set(), 'arrays-hashing', 'medium')?.slug).toBe('a2')
    expect(pickProblem(pool, new Set(['a2']), 'arrays-hashing', 'medium')?.slug).toBe('a3')
    expect(pickProblem(pool, new Set(['a2', 'a3']), 'arrays-hashing', 'medium')?.slug).toBe('a1') // easier before leaving the topic
    expect(pickProblem(pool, new Set(), 'stack', 'hard')?.slug).toBe('s1')
  })

  it('falls back to roadmap order when the topic is used up or missing', () => {
    expect(pickProblem(pool, new Set(['s1']), 'stack', 'easy')?.slug).toBe('a1')
    expect(pickProblem(pool, new Set(), undefined, 'easy')?.slug).toBe('a1')
    expect(roadmapTopic(pool, new Set(['a1', 'a2', 'a3']))).toBe('stack')
    expect(pickProblem(pool, new Set(['a1', 'a2', 'a3', 's1']), 'stack', 'easy')).toBeUndefined()
  })
})
