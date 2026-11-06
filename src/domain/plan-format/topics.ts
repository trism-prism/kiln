// Topic helpers. The NeetCode table is the one in docs/plan-format.md ("dailyPractice").

export const NEETCODE_TOPICS = [
  'arrays-hashing',
  'two-pointers',
  'sliding-window',
  'stack',
  'binary-search',
  'linked-list',
  'trees',
  'tries',
  'heap',
  'backtracking',
  'graphs',
  'advanced-graphs',
  'dp-1d',
  'dp-2d',
  'greedy',
  'intervals',
  'math-geometry',
  'bit-manipulation',
] as const

/** "Sliding Window", "sliding_window" and "sliding-window" are one topic. */
export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
