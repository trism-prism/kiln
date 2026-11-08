// Public entry of the calendar (.ics) module: parsing and the LMS mapping.
export { dayIn, parseIcs, parseLine, parseTime, unescapeText, unfold } from './parse'
export type { IcsEvent, IcsTime } from './parse'
export {
  OTHER_COURSE,
  classify,
  courseKey,
  courseName,
  courseOf,
  coursePlan,
  courses,
  defaultMinutes,
  displayNames,
  doneParts,
  dueOf,
  eventItems,
  examLike,
  kindOf,
  sessions,
  shortHash,
  taskKey,
  taskRows,
} from './lms'
export type { CalendarItem, ItemKind, TaskRow } from './lms'
