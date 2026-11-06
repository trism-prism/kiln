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
| `settings` | singleton, id `settings`: minutes per weekday (Mon first), week start, reminder 08:00, optional 20:00 nudge, theme, review cap 25%, blackout dates | |
| `meta` | device-local (`deviceId`); never exported or synced | |

## Record shape

Every synced record has `id` (UUIDv7, `uuid.ts`; settings uses the fixed id `settings`), `updatedAt` (ms epoch), `deleted` (tombstone) and `deviceId`. Records are never removed, only flagged `deleted: true`; reads in `repo.ts` hide them. IndexedDB cannot index booleans, so filter `deleted` in code.

Ids from a plan file (slugs) are stored as `key`, scoped by `planId`; look them up with `[planId+key]`. `dependsOn` on a task holds file keys. Dates are local `yyyy-mm-dd` strings. Types are in `types.ts`.

## Writes

Use `insertRecord`, `updateRecord`, `softDelete`, `softDeletePlan`, `setTaskStatus`, `updateSettings` and `importPlan` so `updatedAt` and `deviceId` are always set. Do not write to the tables directly. `getSettings` returns defaults (with `updatedAt` 0) until the user saves.

## Scheduling

`scheduleAll(db, today, { mode, skipOptional, reviewsDue })` (`schedule.ts`) runs the scheduler (src/domain/scheduler) over all complete plans and writes `scheduledDate` or `backlog` in one transaction.

## Mastery (`mastery.ts`)

`completeTask(db, taskId, rating, now)` marks the task done and creates its review card on first completion (lessons and tasks with a LeetCode problem; reviews, projects, milestones get none) or rates the existing one, and writes a `reviewLogs` row. `reviewCard(db, cardId, rating, now)` rates a due review. Queries: `dueCards`, `reviewsDue` (scheduler input), `masteryByTopic`, `masteryByPlan`, `brushUp`. Cards of deleted tasks and tombstoned cards are ignored. The maths is in `src/domain/mastery`.

## Adding a migration

1. In `db.ts`, add a new `this.version(n).stores({...})` block after the last one. Never edit a shipped version.
2. List only tables whose indexes change (Dexie carries the others forward). A table is dropped by listing it as `null`.
3. If existing rows need new data, add `.upgrade(tx => tx.table('tasks').toCollection().modify(...))`. New required fields get a default here.
4. Update `types.ts`, the table shapes in `backup.ts`, and add a test that opens a version `n-1` database, adds rows, and reopens with the new version. The backup `schemaVersion` is `db.verno`, so it follows automatically.
