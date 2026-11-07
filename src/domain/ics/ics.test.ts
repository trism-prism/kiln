import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  OTHER_COURSE,
  classify,
  courseKey,
  coursePlan,
  courses,
  defaultMinutes,
  eventItems,
  parseIcs,
  parseLine,
  parseTime,
  shortHash,
  sessions,
  taskKey,
  taskRows,
  unescapeText,
  unfold,
  type IcsEvent,
} from './index'

const canvas = readFileSync(new URL('../../../fixtures/calendars/canvas.ics', import.meta.url), 'utf8')
const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ev = (over: Partial<IcsEvent>): IcsEvent => ({ uid: 'u1', summary: 'x', categories: [], allDay: false, date: '2030-01-01', start: 0, end: 3_600_000, ...over })

describe('ics parsing', () => {
  it('unfolds CRLF and LF continuation lines and drops a byte order mark', () => {
    expect(unfold('A:one\r\n two\r\n\tthree\r\nB:x')).toEqual(['A:onetwothree', 'B:x'])
    expect(unfold(`${String.fromCharCode(0xfeff)}A:1\n 2`)).toEqual(['A:12'])
  })

  it('splits names, parameters (quoted ones may hold : and ;) and values', () => {
    expect(parseLine('DTSTART;TZID=America/New_York:20300218T100000')).toEqual({ name: 'DTSTART', params: { TZID: 'America/New_York' }, value: '20300218T100000' })
    expect(parseLine('X-A;P="a:b;c":v:w')).toEqual({ name: 'X-A', params: { P: 'a:b;c' }, value: 'v:w' })
    expect(parseLine('no colon')).toBeUndefined()
  })

  it('unescapes TEXT', () => {
    expect(unescapeText('a\\, b\\; c\\nd\\Ne\\\\f')).toBe('a, b; c\nd\ne\\f')
  })

  it('reads UTC, TZID, floating and all-day times', () => {
    expect(parseTime('20300212T045900Z', {})).toEqual({ allDay: false, ms: Date.UTC(2030, 1, 12, 4, 59) })
    // 10:00 in New York in February is 15:00 UTC; in July (daylight time) 14:00 UTC.
    expect(parseTime('20300218T100000', { TZID: 'America/New_York' })).toEqual({ allDay: false, ms: Date.UTC(2030, 1, 18, 15) })
    expect(parseTime('20300718T100000', { TZID: 'America/New_York' })).toEqual({ allDay: false, ms: Date.UTC(2030, 6, 18, 14) })
    expect(parseTime('20300222T235900', { TZID: 'America/Chicago' })).toEqual({ allDay: false, ms: Date.UTC(2030, 1, 23, 5, 59) })
    // A TZID the runtime does not know is read as device-local time, like a floating time.
    expect(parseTime('20300218T100000', { TZID: 'Custom Zone' })).toEqual({ allDay: false, ms: new Date(2030, 1, 18, 10).getTime() })
    expect(parseTime('20300218T100000', {})).toEqual({ allDay: false, ms: new Date(2030, 1, 18, 10).getTime() })
    expect(parseTime('20300215', { VALUE: 'DATE' })).toEqual({ allDay: true, date: '2030-02-15' })
    expect(parseTime('20300215', {})).toEqual({ allDay: true, date: '2030-02-15' })
    expect(parseTime('garbage', {})).toBeUndefined()
  })

  it('parses the Canvas fixture: every VEVENT, folded summary, escapes, URL, all-day ranges, VALARM ignored', () => {
    for (const text of [canvas, canvas.replace(/\r?\n/g, '\r\n')]) {
      const events = parseIcs(text)
      expect(events.map((e) => e.uid)).toEqual([
        'event-assignment-1001',
        'event-assignment-1002',
        'event-assignment-1003',
        'event-assignment-1004',
        'event-assignment-1005',
        'event-calendar-event-2001',
        'event-calendar-event-2002',
        'event-calendar-event-2003',
      ])
      const [ps, essay, reading, , , lecture, , trip] = events
      expect(ps).toMatchObject({ summary: 'Problem Set 3 [MATH-221-001]', allDay: false, start: Date.UTC(2030, 1, 12, 4, 59), end: Date.UTC(2030, 1, 12, 4, 59) })
      expect(ps?.description).toBe('Chapters 4 and 5. Show your work, please.\nSubmit one PDF.')
      expect(ps?.url).toBe('https://canvas.example.edu/courses/11/assignments/1001')
      expect(essay?.summary).toBe('Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France [HIST-110]')
      expect(essay?.description).toBe('Two sources, 1500 words.') // not the VALARM's DESCRIPTION
      expect(reading).toMatchObject({ allDay: true, date: '2030-02-15' })
      expect(reading?.endDate).toBeUndefined()
      expect(lecture).toMatchObject({ allDay: false, start: Date.UTC(2030, 1, 18, 15), end: Date.UTC(2030, 1, 18, 16, 15), location: 'Hall 204' })
      expect(lecture?.date).toBe(localDay(Date.UTC(2030, 1, 18, 15)))
      expect(trip).toMatchObject({ allDay: true, date: '2030-03-10', endDate: '2030-03-12' })
    }
  })

  it('skips events without UID or DTSTART, drops non-http URLs, and defaults a missing DTEND', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT\nSUMMARY:no uid\nDTSTART:20300101T100000Z\nEND:VEVENT',
      'BEGIN:VEVENT\nUID:a\nSUMMARY:no start\nEND:VEVENT',
      'BEGIN:VEVENT\nUID:b\nDTSTART:20300101T100000Z\nURL:javascript:alert(1)\nEND:VEVENT',
      'BEGIN:VTODO\nUID:c\nDTSTART:20300101T100000Z\nEND:VTODO',
      'END:VCALENDAR',
    ].join('\n')
    const out = parseIcs(text)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ uid: 'b', summary: '(untitled)', start: Date.UTC(2030, 0, 1, 10), end: Date.UTC(2030, 0, 1, 10) })
    expect(out[0]?.url).toBeUndefined()
  })
})

describe('LMS mapping', () => {
  const items = classify(parseIcs(canvas))

  it('takes the course from a trailing [CODE] and Canvas kinds from the UID', () => {
    expect(items.map((i) => [i.course, i.title, i.kind])).toEqual([
      ['MATH-221-001', 'Problem Set 3', 'assignment'],
      ['HIST-110', 'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France', 'assignment'],
      ['HIST-110', 'Reading: Chapter 6', 'assignment'],
      ['MATH-221-001', 'Quiz 2', 'assignment'],
      ['CS-150', 'Final Project', 'assignment'],
      ['MATH-221-001', 'Lecture: Limits', 'event'],
      ['MATH-221-001', 'Midterm Exam', 'exam'],
      ['HIST-110', 'Field trip', 'event'],
    ])
    expect(courses(items)).toEqual([
      { course: 'MATH-221-001', tasks: 3, events: 2 },
      { course: 'HIST-110', tasks: 2, events: 1 },
      { course: 'CS-150', tasks: 1, events: 0 },
    ])
  })

  it('uses heuristics for other LMSs: CATEGORIES, a leading code, LOCATION, keywords and zero-length events', () => {
    const one = (e: Partial<IcsEvent>) => classify([ev(e)])[0]
    expect(one({ summary: 'Assignment 2 is due', categories: ['BIO101'] })).toMatchObject({ course: 'BIO101', kind: 'assignment' }) // Moodle
    expect(one({ summary: 'CS 101: Lab 2' })).toMatchObject({ course: 'CS 101', title: 'Lab 2', kind: 'assignment' })
    expect(one({ summary: 'Weekly seminar', location: 'ECON 210' })).toMatchObject({ course: 'ECON 210', kind: 'event' })
    expect(one({ summary: 'Weekly seminar', location: 'Room 5' })).toMatchObject({ course: OTHER_COURSE, kind: 'event' })
    expect(one({ summary: 'Chapter 3 thing', start: 5, end: 5 })).toMatchObject({ kind: 'assignment' }) // a due time
    expect(one({ summary: 'Office hours' })).toMatchObject({ kind: 'event' })
    expect(one({ summary: 'Midterm Reflection Essay', uid: 'event-assignment-9' })).toMatchObject({ kind: 'assignment' }) // the UID decides first
    expect(one({ summary: 'Midterm Exam', uid: 'event-calendar-event-9' })).toMatchObject({ kind: 'exam' })
    expect(one({ summary: 'Final exam', uid: 'abc-1' })).toMatchObject({ kind: 'exam' })
    expect(one({ summary: 'Anything', uid: 'abc-assignment-1@brightspace' })).toMatchObject({ kind: 'assignment' })
  })

  it('defaults minutes by keyword', () => {
    const table: [string, number][] = [
      ['Reading: Chapter 6', 60],
      ['Quiz 2', 30],
      ['Homework 4', 60],
      ['Problem set 3', 60],
      ['Discussion post', 30],
      ['Essay 1', 180],
      ['Term paper', 180],
      ['Lab 3', 90],
      ['Final Project', 240],
      ['Midterm exam', 180],
      ['Reading quiz', 30],
      ['Something else', 60],
    ]
    for (const [title, minutes] of table) expect(defaultMinutes(title).minutes, title).toBe(minutes)
  })

  it('makes grid rows: due on the local day of the due time (midnight counts as the day before), exam prep the day before', () => {
    const rows = taskRows(items)
    expect(rows.map((r) => r.title)).toEqual([
      'Problem Set 3',
      'Reading: Chapter 6',
      'Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France',
      'Quiz 2',
      'Prepare for Midterm Exam',
      'Final Project',
    ])
    const by = (t: string) => rows.find((r) => r.title === t)
    expect(by('Problem Set 3')?.due).toBe(localDay(Date.UTC(2030, 1, 12, 4, 59) - 1))
    expect(by('Reading: Chapter 6')?.due).toBe('2030-02-15')
    expect(by('Prepare for Midterm Exam')).toMatchObject({ minutes: 180, type: 'assessment', due: '2030-03-04' })
    expect(by('Problem Set 3')?.url).toBe('https://canvas.example.edu/courses/11/assignments/1001')
    const midnight = taskRows(classify([ev({ uid: 'event-assignment-1', start: new Date(2030, 1, 3).getTime(), end: new Date(2030, 1, 3).getTime() })]))
    expect(midnight[0]?.due).toBe('2030-02-02')
    expect(eventItems(items).map((i) => i.title)).toEqual(['Lecture: Limits', 'Midterm Exam', 'Field trip'])
  })

  it('keys are stable, valid ids and differ per UID', () => {
    expect(taskKey('event-assignment-1001')).toBe(taskKey('event-assignment-1001'))
    expect(taskKey('event-assignment-1001')).not.toBe(taskKey('event-assignment-1002'))
    expect(taskKey('x')).toMatch(/^a-[0-9a-f]{16}$/)
    expect(courseKey('MATH-221-001')).toBe('course-math-221-001')
    expect(courseKey('Biología 1')).toBe(`course-biolog-a-1-${shortHash('Biología 1')}`)
    expect(courseKey('日本語')).toMatch(/^course-[0-9a-f]{8}$/)
  })

  it('keeps courses apart whose names share a slug or a 40-character start', () => {
    const a = 'Introduction to Comparative Politics in Europe, Section A'
    const b = 'Introduction to Comparative Politics in Europe, Section B'
    expect(courseKey(a)).not.toBe(courseKey(b))
    expect(courseKey('MATH 101')).not.toBe(courseKey('MATH-101'))
    expect(courseKey('math-101')).not.toBe(courseKey('MATH-101'))
    expect(courseKey('MATH-101')).toBe('course-math-101') // plain codes keep their key
    expect(courseKey(a)).toMatch(/^course-[a-z0-9-]{1,40}-[0-9a-f]{8}$/)
    const plan = coursePlan(a, [{ uid: 'u', key: 'a-1', course: a, title: 'T', minutes: 30, due: '2030-02-01', type: 'practice' }], '2030-01-01').plan
    expect(plan?.id).toBe(courseKey(a))
  })

  it('reads the due day in the event zone, else the calendar zone, whatever the device zone', () => {
    const lines = (...l: string[]) => l.join('\n')
    const cal = (head: string[], dt: string[]) =>
      lines('BEGIN:VCALENDAR', 'VERSION:2.0', ...head, 'BEGIN:VEVENT', 'UID:event-assignment-1', 'SUMMARY:Problem Set 3 [MATH-221-001]', ...dt, 'END:VEVENT', 'END:VCALENDAR')
    const due = (text: string) => taskRows(classify(parseIcs(text)))[0]?.due
    // 04:59 UTC is 23:59 the day before in New York (EST) and already the 12th in Tokyo.
    const utc = ['DTSTART:20300212T045900Z', 'DTEND:20300212T045900Z']
    expect(due(cal(['X-WR-TIMEZONE:America/New_York'], utc))).toBe('2030-02-11')
    expect(due(cal(['X-WR-TIMEZONE:Asia/Tokyo'], utc))).toBe('2030-02-12')
    // The event's own TZID wins over the calendar's.
    expect(due(cal(['X-WR-TIMEZONE:Asia/Tokyo'], ['DTSTART;TZID=America/New_York:20300211T235900', 'DTEND;TZID=America/New_York:20300211T235900']))).toBe('2030-02-11')
    // Floating times belong to the calendar zone too.
    expect(due(cal(['X-WR-TIMEZONE:America/New_York'], ['DTSTART:20300211T235900', 'DTEND:20300211T235900']))).toBe('2030-02-11')
    // The Canvas fixture's Problem Set 3 with a New York calendar.
    const ny = canvas.replace('BEGIN:VCALENDAR', 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:America/New_York')
    expect(taskRows(classify(parseIcs(ny))).find((r) => r.title === 'Problem Set 3')?.due).toBe('2030-02-11')
  })

  it('caps SUMMARY at 500 characters', () => {
    const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:u', 'DTSTART:20300101T100000Z', `SUMMARY:${'a'.repeat(5000)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\n')
    expect(parseIcs(text)[0]?.summary).toHaveLength(500)
  })

  it('splits work over 90 minutes into sessions, except assessments', () => {
    expect(sessions({ key: 'k', title: 'Project', minutes: 240, type: 'project' })).toEqual([
      { id: 'k', title: 'Project (session 1 of 3)', minutes: 80 },
      { id: 'k-2', title: 'Project (session 2 of 3)', minutes: 80 },
      { id: 'k-3', title: 'Project (session 3 of 3)', minutes: 80 },
    ])
    expect(sessions({ key: 'k', title: 'Exam prep', minutes: 180, type: 'assessment' })).toEqual([{ id: 'k', title: 'Exam prep', minutes: 180 }])
    expect(sessions({ key: 'k', title: 'Quiz', minutes: 1, type: 'assessment' })).toEqual([{ id: 'k', title: 'Quiz', minutes: 5 }])
  })

  it('builds one valid fixed-mode plan per course with deadlines in due order', () => {
    const rows = taskRows(items).filter((r) => r.course === 'HIST-110')
    const { plan, issues } = coursePlan('HIST-110', rows, '2030-01-01')
    expect(issues).toEqual([])
    expect(plan).toMatchObject({ id: 'course-hist-110', title: 'HIST-110', subject: 'HIST-110', schedulingMode: 'fixed', startDate: '2030-01-01' })
    expect(plan?.tasks.map((t) => [t.title, t.estimatedMinutes, t.deadline, t.order])).toEqual([
      ['Reading: Chapter 6', 60, '2030-02-15', 1],
      ['Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 1 of 2)', 90, rows[1]?.due, 2],
      ['Essay 1: Comparing two accounts of the Industrial Revolution in Britain and France (session 2 of 2)', 90, rows[1]?.due, 3],
    ])
    expect(plan?.tasks[0]?.resources).toEqual([{ title: 'Open in your course', url: 'https://canvas.example.edu/courses/12/assignments/1003', kind: 'other', required: true }])
  })

  it('reports deadlines before the start date as errors', () => {
    const rows = taskRows(items).filter((r) => r.course === 'CS-150')
    expect(coursePlan('CS-150', rows, '2031-01-01').issues.length).toBeGreaterThan(0)
  })
})
