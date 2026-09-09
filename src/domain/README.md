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

## practice

`practice/ramp.ts`: `targetDifficulty` (easy until 5 Good/Easy easy problems with at least 2 in the topic, then medium; after 10 mediums or in the final 14 days every third problem is hard) and `pickProblem` (topic first, then difficulty, NeetCode 150 first). `neetcode-problems.json` is a reduced snapshot of NeetCode's MIT problem list (title, slug, difficulty, topic); regenerate with `npm run neetcode`. `NEETCODE_SLUGS` is the `knownSlugs` set for `validatePlan`.

## todo

`todo/index.ts`: `buildTodoItems` turns scheduled tasks, stored daily problems, live review cards, personal to-dos and calendar events into dated items (a review due today or earlier is listed today, like the badge counts it; reviews are never overdue; skipped and undated tasks are left out). A personal to-do is a one-off task outside any plan: with no day it is listed today and never overdue, a done one is listed on the day it was completed; its minutes count toward its day. An event is a dated item that takes no study time (no checkbox) and is listed on its first day. `todoView(items, { from, to }, today)` cuts items to a day range grouped by day, oldest first; when the range includes today every open overdue item (any age) is pinned in an `overdue` list above, otherwise there is no pinned section and only items dated inside the range are listed. A range with `from > to` is empty.

To-do list preferences (`TodoPrefs`, kept per device in meta, read with `parseTodoPrefs`, which falls back to the defaults for anything damaged): visible items (personal to-dos, events, completed, favorite plans only, applied by `filterTodoItems`), a From anchor (4/3/2 weeks ago, last week, this week, today) and an Until anchor (today, this week, next week, in 2/3/4 weeks), plus an optional custom From and Until month and day. `rangeBounds(prefs, today, weekStart)` resolves them: week anchors count from the first day of the week per the week-start setting; a custom From is its latest occurrence on or before today; a custom Until is its first occurrence on or after the From (so the range never inverts: Jan 1 to Dec 31 is this year, Sep 1 to Aug 31 crosses New Year); 29 Feb resolves to the nearest leap year in that direction; a date that never exists (30 Feb) is ignored.
