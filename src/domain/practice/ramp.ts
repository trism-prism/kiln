// The daily LeetCode ramp (docs/plan-format.md, "dailyPractice"). Pure functions.
import { NEETCODE_TOPICS } from '../plan-format/topics'
import type { Difficulty, PoolProblem } from './pool'

/** A problem the learner solved. `rating` is 1-4 (Again, Hard, Good, Easy) when known. */
export interface Solved {
  slug: string
  difficulty: Difficulty
  topic?: string
  rating?: number
}

export interface RampContext {
  startDifficulty: Difficulty
  solved: readonly Solved[]
  /** Topic of the problem about to be chosen. */
  topic?: string
  /** True within the plan's last 14 days. */
  inFinalDays: boolean
}

/** Minutes a generated problem takes. Plan problems use their task's estimate. */
export const PRACTICE_MINUTES: Record<Difficulty, number> = { easy: 25, medium: 40, hard: 60 }

const EASY_FOR_MEDIUM = 5
const EASY_FOR_MEDIUM_IN_TOPIC = 2
const MEDIUMS_FOR_HARD = 10

/**
 * The difficulty to try next.
 * - Medium unlocks after 5 easy problems rated Good or Easy, at least 2 of them in `topic`
 *   (so a fresh topic starts with easy problems again). A start of medium or hard skips this gate.
 * - Hard unlocks after 10 mediums, or in the final 14 days. Once unlocked, every third problem is
 *   hard and the rest are medium (easy if medium is still locked). A start of hard is always hard.
 */
export function targetDifficulty(ctx: RampContext): Difficulty {
  if (ctx.startDifficulty === 'hard') return 'hard'
  const goodEasy = ctx.solved.filter((s) => s.difficulty === 'easy' && (s.rating ?? 0) >= 3)
  const inTopic = ctx.topic === undefined ? goodEasy.length : goodEasy.filter((s) => s.topic === ctx.topic).length
  const mediumUnlocked = ctx.startDifficulty === 'medium' || (goodEasy.length >= EASY_FOR_MEDIUM && inTopic >= EASY_FOR_MEDIUM_IN_TOPIC)
  const mediums = ctx.solved.filter((s) => s.difficulty === 'medium').length
  const hardUnlocked = mediums >= MEDIUMS_FOR_HARD || ctx.inFinalDays
  if (hardUnlocked && ctx.solved.length % 3 === 2) return 'hard'
  return mediumUnlocked ? 'medium' : 'easy'
}

/** The first roadmap topic that still has an unused problem. */
export function roadmapTopic(pool: readonly PoolProblem[], excluded: ReadonlySet<string>): string | undefined {
  return NEETCODE_TOPICS.find((t) => pool.some((p) => p.topic === t && !excluded.has(p.slug)))
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/** Preference order for a target: the target, then easier ones (nearest first), then harder ones. */
function difficultyOrder(target: Difficulty): Difficulty[] {
  const i = DIFFICULTIES.indexOf(target)
  return [target, ...DIFFICULTIES.slice(0, i).reverse(), ...DIFFICULTIES.slice(i + 1)]
}

/**
 * Picks an unused problem. The topic wins over difficulty (the point is to match the lessons), then
 * the target difficulty, then easier, then harder. Inside that, NeetCode 150 problems first, then
 * roadmap order. With no problem left in the topic, falls back to the first roadmap topic with one.
 * Returns undefined when the pool is used up.
 */
export function pickProblem(
  pool: readonly PoolProblem[],
  excluded: ReadonlySet<string>,
  topic: string | undefined,
  target: Difficulty,
): PoolProblem | undefined {
  const open = pool.filter((p) => !excluded.has(p.slug))
  const inTopic = topic === undefined ? [] : open.filter((p) => p.topic === topic)
  const fallbackTopic = roadmapTopic(pool, excluded)
  for (const candidates of [inTopic, open.filter((p) => p.topic === fallbackTopic)]) {
    for (const d of difficultyOrder(target)) {
      const found = candidates.find((p) => p.difficulty === d && p.neetcode150) ?? candidates.find((p) => p.difficulty === d)
      if (found) return found
    }
  }
  return undefined
}
