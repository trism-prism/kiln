// The bundled NeetCode problem list (titles and slugs only). Regenerate with `npm run neetcode`.
import snapshot from './neetcode-problems.json'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface PoolProblem {
  slug: string
  title: string
  difficulty: Difficulty
  /** One of NEETCODE_TOPICS. */
  topic: string
  neetcode150?: boolean
  blind75?: boolean
}

/** In NeetCode roadmap order: by topic, then NeetCode's own order. */
export const NEETCODE_POOL: readonly PoolProblem[] = snapshot.problems as PoolProblem[]

/** Pass as `knownSlugs` to validatePlan so unknown LeetCode slugs get a warning. */
export const NEETCODE_SLUGS: ReadonlySet<string> = new Set(NEETCODE_POOL.map((p) => p.slug))
