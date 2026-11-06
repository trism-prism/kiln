Pure TypeScript domain modules (no React): plan-format, import, scheduler, practice, mastery, badge. Added from stage 2 on.

## scheduler

`schedule(input) -> output` (`scheduler/schedule.ts`) is pure and deterministic; `scheduleAll(db, today, opts)` in `src/data/schedule.ts` reads the database, calls it and writes `scheduledDate` / `backlog` in one transaction. Rules beyond docs/plan-format.md ("How the scheduler uses a plan"), each covered by a test:

- Days run from the later of today and the earliest plan start, for at most 3 years. Daily problems are generated only while work remains to place.
- Already dated open tasks keep their date and use up that day's budget (so does work done today). `initial` places the undated ones (backlog tasks included). `reschedule` also releases open tasks dated before today and keeps backlog tasks in the backlog. Pinned tasks never move.
- Plans take turns by fewest placed minutes per weight, ties to the lower plan id. A task that does not fit waits; later ready tasks of the same module may fill the room, tasks of later modules never jump past it.
- The first task of a day always fits, however long. The budget is a target: a day can run over by the reviews and practice already on it. Without this a long assessment could wait forever.
- Reviews take at most `reviewCapPercent` of the budget (default 25), and never more than is left after pinned and dated work. The caller supplies the minutes due per date.
- Daily problems: plan problems first (ready, fit), then generated NeetCode ones at 25 / 40 / 60 minutes. The ramp assumes every problem scheduled in the run is rated Good. The topic is the NeetCode topic of the latest lesson placed, else roadmap order. Generated problems are returned, not stored.
- Deadlines: for a plan that misses its deadline, the fewest tasks that fix it are sent to the backlog (optional before recommended, latest in plan order first, never core, dependents of a deferred task go with it). If deferring everything allowed still misses, nothing is deferred and the miss is reported.
- Tasks that can never be placed (a dependency cycle, a core task behind a backlog task) or find no day within the horizon are listed in `unplaceable`.

## practice

`practice/ramp.ts`: `targetDifficulty` (easy until 5 Good/Easy easy problems with at least 2 in the topic, then medium; after 10 mediums or in the final 14 days every third problem is hard) and `pickProblem` (topic first, then difficulty, NeetCode 150 first). `neetcode-problems.json` is a reduced snapshot of NeetCode's MIT problem list (title, slug, difficulty, topic); regenerate with `npm run neetcode`. `NEETCODE_SLUGS` is the `knownSlugs` set for `validatePlan`.
