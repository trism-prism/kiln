// Where each LMS keeps its calendar link. Menus differ between schools and versions, so the wording
// stays general; Google Classroom goes through Google Calendar and is marked as varying.
import type { Lms } from '../../data'

export interface LmsGuide {
  id: Lms
  name: string
  steps: string[]
  mayVary?: boolean
}

export const LMS_GUIDES: LmsGuide[] = [
  {
    id: 'canvas',
    name: 'Canvas',
    steps: ['Open Calendar in the menu on the left.', 'At the bottom right, select Calendar feed.', 'Copy the link (it ends in .ics).'],
  },
  {
    id: 'blackboard',
    name: 'Blackboard',
    steps: ['Open Calendar.', 'Open the calendar settings (the gear) and choose Share calendar.', 'Generate the link and copy it.'],
  },
  {
    id: 'moodle',
    name: 'Moodle',
    steps: [
      'Open Calendar, then Import or export calendars, then Export calendar.',
      'Choose All events and a time range such as Recent and next 60 days.',
      'Select Get calendar URL and copy it.',
    ],
  },
  {
    id: 'brightspace',
    name: 'Brightspace (D2L)',
    steps: ['Open Calendar.', 'Select Subscribe (below the calendar) and choose All calendars.', 'Copy the link.'],
  },
  {
    id: 'schoology',
    name: 'Schoology',
    steps: ['Open Calendar.', 'Select Export at the top right.', 'Copy the iCal feed link.'],
  },
  {
    id: 'google',
    name: 'Google Classroom',
    mayVary: true,
    steps: [
      'Classroom puts due dates in Google Calendar. Open Google Calendar on a computer.',
      'Open Settings, then choose the class calendar under Settings for my calendars.',
      'Under Integrate calendar, copy the Secret address in iCal format.',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    steps: ['Look for Export, Subscribe or Calendar feed in your calendar.', 'Copy the link that ends in .ics, or download the .ics file.'],
  },
]
