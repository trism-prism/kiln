import type { Priority, TaskType } from '../../domain/plan-format'

/** The builder's plain task types. "review" stays internal (Kiln makes review tasks itself). */
export const TYPE_OPTIONS: [TaskType, string][] = [
  ['lesson', 'Learn'],
  ['practice', 'Practice'],
  ['project', 'Project'],
  ['assessment', 'Exam'],
  ['milestone', 'Milestone'],
]
export const PRIORITY_VALUES: Priority[] = ['core', 'recommended', 'optional']
