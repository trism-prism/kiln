# Data layer

Dexie (IndexedDB) database `kiln`, a small repository API, and JSON backup. No React in here; screens use `dexie-react-hooks` (`useLiveQuery`) on `db` or call the repository functions. Import from `src/data` (`index.ts`).

## Tables

| Table | Holds | Main indexes |
|---|---|---|
| `plans` | plan-level fields, `share` (less/even/more, schema 4) with the matching weight, `favorite`, `dailyPracticeOn`, startDate, deadline, part progress (`partTotal`, `partsIn`) | `key` |
| `modules` | modules of a plan | `[planId+key]`, `planId` |
| `tasks` | plan task fields plus app state: `scheduledDate`, `pinnedDate`, `backlog` (deferred by the scheduler), `status` (open/done/skipped), `completedAt` | `[planId+key]`, `planId`, `moduleId`, `scheduledDate`, `pinnedDate`, `status`, `*topics` |
| `reviewCards` | FSRS card state as plain data (due, stability, difficulty, reps, lapses, state, learningSteps) plus `minutes` per review | `taskId`, `planId`, `due` |
| `reviewLogs` | one row per review | `cardId`, `reviewedAt` |
| `practiceLog` | daily LeetCode problems done | `date`, `slug` |
| `practiceItems` | generated daily LeetCode problems placed on a date, open or done (added in schema 3) | `[planId+date+slug]`, `date`, `planId` |
| `personalTodos` | one-off to-dos outside plans: title, optional date and minutes, done, completedAt, notes (schema 4) | `date` |
| `events` | dated items that take no study time (LMS classes, exams): date, endDate, allDay, start/end ms, course, url, planId, feedId, uid (schema 4) | `date`, `planId`, `feedId`, `uid` |
| `planVersions` | a plan's content, saved by `snapshotPlan` (the plan edit path calls it after saving), newest 20 per plan: createdAt, label, summary, snapshot (schema 4) | `planId` |
| `feeds` | calendar links kept in sync: lms, url, name, planIds, lastFetchedAt, lastResult (schema 4) | |
| `settings` | singleton, id `settings`: minutes per weekday (Mon first), week start, reminder 08:00, optional 20:00 nudge, theme, review cap 25%, blackout dates | |
| `meta` | device-local (`deviceId`, sync key and state); never exported or synced | |

## Record shape

Every synced record has `id` (UUIDv7, `uuid.ts`; settings uses the fixed id `settings`), `updatedAt` (ms epoch), `deleted` (tombstone) and `deviceId`. Records are never removed, only flagged `deleted: true`; reads in `repo.ts` hide them. IndexedDB cannot index booleans, so filter `deleted` in code.

Ids from a plan file (slugs) are stored as `key`, scoped by `planId`; look them up with `[planId+key]`. `dependsOn` on a task holds file keys. Dates are local `yyyy-mm-dd` strings. Types are in `types.ts`.

## Writes

Use `insertRecord`, `updateRecord`, `softDelete`, `softDeletePlan`, `setTaskStatus`, `updateSettings` and `importPlan` so `updatedAt` and `deviceId` are always set. Do not write to the tables directly. `getSettings` returns defaults (with `updatedAt` 0) until the user saves.

## Sync

Every table except `meta` syncs (`src/sync/README.md`). It reuses `rowSchemas` and `mergeRows` from `backup.ts`, so a new field must be added to the row schema there or it is dropped by backup import and by sync.

## Plan settings, to-dos, events, versions (schema 4)

- Share of study time: `setPlanShare(db, planId, share)` writes `share` and the matching `weight` (Less 2, Even 3, More 5) so devices on schema 3 schedule the same; the scheduler uses `planWeight(plan)`. Daily practice: `practiceConfig(plan)` is the effective config (`dailyPracticeOn` false turns it off; true without a file config uses NeetCode, one a day). Both in `plan-settings.ts`. Favorite: `updateRecord(db, 'plans', id, { favorite })`.
- Personal to-dos, events and feeds use `insertRecord`, `updateRecord` and `softDelete`; `setPersonalTodoDone`, `listPersonalTodos` and `eventsBetween(db, from, to)` are in `repo.ts`. A dated to-do with minutes is fixed load on its day for the scheduler (done or not); events take no time. The badge counts open to-dos due today or earlier.
- Versions (`versions.ts`): `snapshotPlan(db, planId, { summary, label? })` stores the plan's content as a plan file (gzip + base64url, built by `planFromRecords`) and tombstones versions beyond the newest 20, emptying their snapshot. `listPlanVersions` lists them newest first; `readSnapshot(v)` returns the plan file, which `importPlan` applies by key keeping progress. `savePlanEdit(db, planId, plan, pins?)` saves an edit (importPlan with `replace: true`: modules and tasks left out are tombstoned, deleted ones in the file come back with their progress), snapshotting before the first edit and after each one with a `describeChanges` summary ("Renamed 2 tasks, added 1"). `restoreVersion(db, planId, v)` applies a version the same way and snapshots it with label "Restored". Snapshots carry no part info, so a split plan counts as whole after an edit or restore. A plan of a few hundred tasks fits the 64 KB sync limit (the 85-task DSA fixture is about 20 KB).
- `softDeletePlan` also tombstones the plan's events and versions.

## Scheduling

`scheduleAll(db, today, { mode, skipOptional, reviewsDue })` (`schedule.ts`) runs the scheduler (src/domain/scheduler) over all complete plans and writes `scheduledDate` or `backlog` in one transaction. A plan's own `skipOptional` flag sends only that plan's optional work to the backlog.

## Daily problems (`practice.ts`)

The scheduler returns generated LeetCode problems; `scheduleAll` stores them in `practiceItems` (`persistPractice`) so they stay the same and can be checked off. Done items and items before today are never touched; today's stored items stay; open items after today follow the new output but only as far as the output reaches (the scheduler generates problems only while it still has tasks to place, so a run with nothing to place leaves the stored ones alone). A `reschedule` run also drops open items before today (it generates fresh ones from today). `completePractice(db, itemId, rating, now)` marks one done, writes the `practiceLog` row (first time only) and creates or rates its re-solve card (a card with `slug` and no `taskId`).

`completeTask`, `reviewCard` and `completePractice` return an `undo()` that puts every record they touched back (`revertWrite` in `repo.ts`).

`seed.ts` (`seedFixtures(db, today)`) loads the fixture plans for local testing and e2e; the app reaches it only through `src/app/devSeed.ts`, which is compiled out of production builds.

## Mastery (`mastery.ts`)

`completeTask(db, taskId, rating, now)` marks the task done and creates its review card on first completion (lessons and tasks with a LeetCode problem; reviews, projects, milestones get none) or rates the existing one, and writes a `reviewLogs` row. `reviewCard(db, cardId, rating, now)` rates a due review. Queries: `dueCards`, `reviewsDue` (scheduler input), `masteryByTopic`, `masteryByPlan`, `brushUp`. `skipTask` / `unskipTask` skip or reopen a task and suspend or resume its card (a suspended card is hidden from every query; unskipping a completed task restores `done`). Queries ignore tombstoned cards, cards of deleted tasks and suspended cards, and use one card per task (smallest id). `scheduleAll` reads `reviewsDue` itself unless you pass one. The maths is in `src/domain/mastery`.

## Adding a migration

1. In `db.ts`, add a new `this.version(n).stores({...})` block after the last one. Never edit a shipped version.
2. List only tables whose indexes change (Dexie carries the others forward). A table is dropped by listing it as `null`.
3. If existing rows need new data, add `.upgrade(tx => tx.table('tasks').toCollection().modify(...))`. New required fields get a default here.
4. Update `types.ts`, the table shapes in `backup.ts`, and add a test that opens a version `n-1` database, adds rows, and reopens with the new version. The backup `schemaVersion` is `db.verno`, so it follows automatically.
