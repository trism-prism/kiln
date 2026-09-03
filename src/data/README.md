# Data layer

Dexie (IndexedDB) database `kiln`, a small repository API, and JSON backup. No React in here; screens use `dexie-react-hooks` (`useLiveQuery`) on `db` or call the repository functions. Import from `src/data` (`index.ts`).

## Tables

| Table | Holds | Main indexes |
|---|---|---|
| `plans` | plan-level fields, weight 1-5, startDate, deadline, part progress (`partTotal`, `partsIn`) | `key` |
| `modules` | modules of a plan | `[planId+key]`, `planId` |
| `tasks` | plan task fields plus app state: `scheduledDate`, `pinnedDate`, `backlog` (deferred by the scheduler), `status` (open/done/skipped), `completedAt` | `[planId+key]`, `planId`, `moduleId`, `scheduledDate`, `pinnedDate`, `status`, `*topics` |
| `reviewCards` | FSRS card state as plain data (due, stability, difficulty, reps, lapses, state, learningSteps) plus `minutes` per review | `taskId`, `planId`, `due` |
| `reviewLogs` | one row per review | `cardId`, `reviewedAt` |
| `practiceLog` | daily LeetCode problems done | `date`, `slug` |
| `practiceItems` | generated daily LeetCode problems placed on a date, open or done (added in schema 3) | `[planId+date+slug]`, `date`, `planId` |
| `settings` | singleton, id `settings`: minutes per weekday (Mon first), week start, reminder 08:00, optional 20:00 nudge, theme, review cap 25%, blackout dates | |
| `meta` | device-local (`deviceId`, sync key and state); never exported or synced | |

## Record shape

Every synced record has `id` (UUIDv7, `uuid.ts`; settings uses the fixed id `settings`), `updatedAt` (ms epoch), `deleted` (tombstone) and `deviceId`. Records are never removed, only flagged `deleted: true`; reads in `repo.ts` hide them. IndexedDB cannot index booleans, so filter `deleted` in code.

Ids from a plan file (slugs) are stored as `key`, scoped by `planId`; look them up with `[planId+key]`. `dependsOn` on a task holds file keys. Dates are local `yyyy-mm-dd` strings. Types are in `types.ts`.

## Writes

Use `insertRecord`, `updateRecord`, `softDelete`, `softDeletePlan`, `setTaskStatus`, `updateSettings` and `importPlan` so `updatedAt` and `deviceId` are always set. Do not write to the tables directly. `getSettings` returns defaults (with `updatedAt` 0) until the user saves.

## Sync

Every table except `meta` syncs (`src/sync/README.md`). It reuses `rowSchemas` and `mergeRows` from `backup.ts`, so a new field must be added to the row schema there or it is dropped by backup import and by sync.

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
