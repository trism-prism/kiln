Pure TypeScript domain modules (no React): plan-format, import, scheduler, practice, mastery, badge, todo. Added from stage 2 on.

## scheduler

`schedule(input) -> output` (`scheduler/schedule.ts`) is pure and deterministic; `scheduleAll(db, today, opts)` in `src/data/schedule.ts` reads the database, calls it and writes `scheduledDate` / `backlog` in one transaction. Rules beyond docs/plan-format.md ("How the scheduler uses a plan"), each covered by a test:

- Days run from the later of today and the earliest plan start, for at most 3 years. Daily problems are generated only while work remains to place.
- Already dated open tasks keep their date and use up that day's budget (so does work done today). `initial` places the undated ones (backlog tasks included). `reschedule` also releases open tasks dated before today and keeps backlog tasks in the backlog. Pinned tasks never move.
- Plans take turns by fewest placed minutes per weight, ties to the lower plan id. A task that does not fit waits; later ready tasks of the same module may fill the room, tasks of later modules never jump past it.
- The first task of a day always fits, however long. The budget is a target: a day can run over when that first task is larger than the room reviews and practice left. Without this a long assessment could wait forever.
- Reviews take at most `reviewCapPercent` of the budget (default 25), and never more than is left after pinned and dated work. The caller supplies the minutes due per date.
- Daily problems: plan problems first (ready, fit), then generated NeetCode ones at 25 / 40 / 60 minutes. The ramp assumes every problem scheduled in the run is rated Good. The topic is the NeetCode topic of the latest lesson placed, else roadmap order. Generated problems are returned; `scheduleAll` stores them (see src/data/README.md, daily problems).
- Deadlines: for a plan that misses its deadline, the fewest tasks that fix it are sent to the backlog (optional before recommended, latest in plan order first, never core, dependents of a deferred task go with it). If deferring everything allowed still misses, nothing is deferred and the miss is reported.
- The practice slot obeys the same module block as ordinary tasks. Generated problems stop after the plan's deadline and once the plan has nothing left to place.
- Violations: `plan-deadline`, `task-deadline`, and `dependency` (a pinned or already dated task whose open dependency is in the backlog, undated, or not dated earlier).
- Tasks that can never be placed (a dependency cycle, a core task behind a backlog task) or cannot start within the horizon are listed in `unplaceable`.

## ics

`ics/parse.ts` reads LMS calendar feeds (RFC 5545): unfolding, VEVENT (nested VALARM skipped), DTSTART/DTEND as UTC, TZID (IANA, via Intl), floating or all-day (DTEND exclusive), SUMMARY, DESCRIPTION, URL (http/https only), UID, LOCATION, CATEGORIES. RRULE, DURATION and VTIMEZONE bodies are ignored (an unknown TZID reads as device-local time). `ics/lms.ts` maps items to Kiln: course from a trailing `[CODE]` (Canvas), else CATEGORIES (Moodle), a leading code ("CS 101: ...") or a code-like LOCATION; kind from the Canvas UID (`event-assignment-*`, `event-calendar-event-*`), else exam/assignment keywords or a zero-length event (a due time). Assignments become grid rows due on the local day of the due time (midnight = the day before), exams get a "Prepare for ..." row due the day before plus an event. Minute defaults by keyword (exam prep 180, project 240, essay/paper 180, lab 90, quiz 30, discussion 30, homework/problem set 60, reading 60, else 60). `coursePlan` builds a fixed-mode plan file per course (`course-<slug>`, one Assignments module, task ids hashed from the UID so re-imports match, work over 90 minutes split into sessions except assessments).

## practice

`practice/ramp.ts`: `targetDifficulty` (easy until 5 Good/Easy easy problems with at least 2 in the topic, then medium; after 10 mediums or in the final 14 days every third problem is hard) and `pickProblem` (topic first, then difficulty, NeetCode 150 first). `neetcode-problems.json` is a reduced snapshot of NeetCode's MIT problem list (title, slug, difficulty, topic); regenerate with `npm run neetcode`. `NEETCODE_SLUGS` is the `knownSlugs` set for `validatePlan`.

## todo

`todo/index.ts`: `buildTodoItems` turns scheduled tasks, stored daily problems and live review cards into dated items (a review due today or earlier is listed today, like the badge counts it; reviews are never overdue; skipped and undated tasks are left out), and `todoView(items, range, today)` cuts them into a range (`today`, `next7` = today..+6, `next28`, `past7`, `past28`) grouped by day. Forward ranges pin every open overdue item in an `overdue` list; past ranges list what was dated in the window, done or still open, newest day first.
