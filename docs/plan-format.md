# Kiln plan format (schemaVersion 1)

This is the authoritative spec for a Kiln study plan file. The Zod schema in `src/domain/plan-format` implements it; the JSON Schema and the field reference in the LLM prompts are generated from that Zod schema. When this document and the schema disagree, fix one of them in the same change.

A plan file can describe any subject (algorithms, a language, music theory, a university course). It is written by an LLM using one of the prompts in `docs/prompts/`, or by hand, and it carries everything the scheduler needs. Kiln assigns real calendar dates from the user's minutes-per-weekday budget, except where the plan pins dates (fixed mode).

## File shape

~~~~
# Any Markdown for people        <- ignored by Kiln
...
```json
{ "schemaVersion": 1, ... }      <- the only machine data
```
...more Markdown is allowed after the block, also ignored
~~~~

- The Markdown is for people only. Kiln never reads or stores it.
- All machine data is in exactly one fenced JSON block.
- The JSON is strict RFC 8259 JSON: no comments, no trailing commas, double-quoted keys.

### How Kiln finds the JSON block

1. Strip a leading byte-order mark and surrounding whitespace.
2. If the text starts with `{`, the whole text is the JSON (the user copied only the code block).
3. Otherwise collect the fenced code blocks (three or more backticks or tildes). A block is a candidate when its info string is `json` (any case), or when it has no info string and its content starts with `{`.
4. Exactly one candidate: parse it. None: error `input: no json block found`. More than one: error `input: found 3 json blocks; expected exactly 1`.

Input over 5 MB is rejected before parsing with `input: text is larger than 5 MB`. A JSON syntax error is reported as `json: line L, column C: ...` with the line counted in the pasted text.

## Decisions

| Decision | Reason |
|---|---|
| Priority is a word: `core`, `recommended`, `optional` (default `core`) | LLMs use defined words consistently but drift on numeric scales, and a number would be confused with the per-plan weight (1-5) the user sets in the app. |
| Plan order is `module.order`, then `task.order`; array order is ignored | Explicit numbers survive hand edits, CSV sorting and merges; array position does not. |
| Priority never reorders tasks; it only decides what is deferred | The author's order is the teaching order; priority answers "what can go if time runs out". |
| A task may depend only on tasks of equal or higher priority | Deferring optional work can then never block core work. |
| One LeetCode (or other) problem per practice task | Each problem gets its own check-off, rating and spaced re-solve. |
| The scheduler never splits a task | Splitting is a teaching decision; authors split long work into sessions of 90 minutes or less. |
| `estimatedMinutes` is 5-180 (milestones 0-180); over 90 is a warning except for assessments | Under 5 minutes is not a session; over 180 cannot fit most days and must be split; exams and mocks are legitimately long. |
| Plan days are calendar days counted from the start date (day 1 = start date) | Matches how source plans say "week 3, day 15", independent of which weekdays have a budget. |
| Auto-mode files contain no calendar dates at all | An auto plan is reusable by anyone from any start date; the user sets start date and deadline in the app. |
| Fixed mode requires `startDate` and at least one date | Without a date it is an auto plan; the start date anchors `notBeforeDay` against the pinned dates. |
| `fixedDate` and `notBeforeDay` cannot both be set on a task | Two placement rules for one task contradict each other. |
| Ids are lowercase slugs, unique across modules, tasks and sources | One namespace keeps references unambiguous and avoids case-mismatch bugs. |
| `null` and empty strings mean "absent"; strings are trimmed | LLMs emit `"url": null`; treating it as absent avoids pointless errors. |
| Unknown fields are a warning and are dropped | LLMs add extras such as `"week": 3`; the import should not fail on them, but the user should see them. |
| Derived values (`totalEstimate` and other totals) are never stored | They would go stale the moment a task changes. |
| Text fields are plain text; line breaks are kept, Markdown is not rendered | No renderer dependency and no HTML injection surface. |
| Verification questions have no answers | Keeps files small; the learner answers from the resources, which is the active recall the reviews rely on. |
| Topics are normalized to kebab-case on import | Hand and LLM spellings ("Sliding Window", "sliding_window") must count as one topic for mastery. |
| Large plans may be split into parts (`part`) | A fully detailed 16-week plan is longer than most chat UIs output in one reply. |
| The old `dailyPractice.ramp` field is dropped | The ramp rules are fixed app behaviour (see dailyPractice), so there is nothing to configure. |

## Common types

| Type | Rule |
|---|---|
| id | String matching `^[a-z0-9][a-z0-9-]{0,63}$`. Prefer descriptive slugs (`arrays-dynamic-intro`) over positions (`t17`), so ids stay meaningful after the plan is reordered. |
| date | `yyyy-mm-dd`, a real calendar date, year 2000-2100, local time (no time zone). |
| planDay | Integer 1-3650. Day 1 is the plan's start date. |
| text(n) | String, trimmed, at most n characters. Empty after trimming means absent. |
| list(n, m) | Array of at most n strings, each text(m). Absent means `[]`. |
| minutes | Integer (no decimals, no strings). |

## Plan (top level)

| Field | Type | Required | Constraints | Meaning and scheduler use |
|---|---|---|---|---|
| `schemaVersion` | integer | yes | must be `1` | Format version. A higher number is rejected with "made for a newer version of Kiln". |
| `id` | id | yes | | Stable plan identity. Re-importing a file with the same `id` offers to update the existing plan. |
| `title` | text(120) | yes | min 1 char | Shown on the dashboard card. |
| `description` | text(2000) | no | | What the plan covers. |
| `goal` | text(500) | no | | The outcome the learner wants, e.g. "Pass DSA rounds at large tech companies". |
| `subject` | text(120) | no | | e.g. "Data structures and algorithms", "Spanish". |
| `level` | enum | no | `beginner`, `intermediate`, `advanced` | The learner's level at the start; estimates were sized for it. Display only. |
| `audience` | text(300) | no | | Who the plan is for. Display only. |
| `schedulingMode` | enum | yes | `auto`, `fixed` | See Scheduling modes. |
| `startDate` | date | fixed: yes; auto: forbidden | | Default start date offered at import (the user can change it). Day 1 of the plan. |
| `deadline` | date | no; auto: forbidden | `>= startDate` | All `core` and `recommended` tasks should be done by the end of this day. Drives deferral (see Priority). In auto mode the user sets a deadline in the app instead. |
| `sources` | Source[] | no | at most 50 | Whole works the plan draws on (a course, a book). Lets Kiln total study time per source. |
| `dailyPractice` | DailyPractice | no | | Daily problem slot. Absent means no daily slot. |
| `part` | Part | no | | Present only when the plan is split across several files. |
| `modules` | Module[] | yes | 1-100 | Ordered groups of tasks (weeks, units, chapters). |
| `tasks` | Task[] | yes | 1-2000 | The schedulable work. |

Derived, never stored: total estimate (sum of `estimatedMinutes`), minutes per module, per topic and per source, task counts, projected end date. A file that contains `totalEstimate` gets the warning `totalEstimate is derived by Kiln and was ignored`.

## Scheduling modes

| Rule | `auto` | `fixed` |
|---|---|---|
| `startDate` | forbidden | required |
| plan `deadline` | forbidden | optional |
| task `fixedDate` | forbidden | optional |
| task `deadline` | forbidden | optional |
| `notBeforeDay` (module and task) | optional | optional |
| At least one date | n/a | required: `deadline`, or a task `fixedDate` or `deadline` |

- **auto**: the file has no calendar dates. On import the user picks a start date (default: tomorrow) and optionally a deadline; Kiln places every task. Used for self-paced plans.
- **fixed**: some dates are real (an exam, a class session, a mock interview, a project due date). Pinned tasks go exactly on their `fixedDate`; every other task is placed by the scheduler around them. A fully dated syllabus is a fixed plan where every task has a `fixedDate`.
- Error text for a date in auto mode: `fixedDate is not allowed when schedulingMode is "auto"; use "fixed" or pin the date in Kiln after import`.
- After import, the user can pin or move any task in the app in either mode. The file mode only describes where the dates came from.

## Module

| Field | Type | Required | Constraints | Meaning and scheduler use |
|---|---|---|---|---|
| `id` | id | yes | unique in plan | |
| `title` | text(120) | yes | | e.g. "Week 3: Stacks and queues". |
| `order` | integer | yes | 1-1000, unique among modules | Position of the module in plan order. Gaps are allowed. |
| `summary` | text(1000) | no | | What the module covers. Shown on the modules page. |
| `notBeforeDay` | planDay | no | non-decreasing in module order | No task in this module is scheduled before this plan day. Use it to keep a weekly rhythm or to wait for a class to reach a topic. |

A module with no tasks is a warning and is ignored.

## Task

| Field | Type | Required | Constraints | Meaning and scheduler use |
|---|---|---|---|---|
| `id` | id | yes | unique in plan | Mapped to an app UUID on import; never shown. |
| `moduleId` | id | yes | must match a module | |
| `order` | integer | yes | 1-10000, unique within its module | Position within the module. Plan order = (module order, task order). The scheduler takes ready tasks in plan order. |
| `title` | text(120) | yes | | For a problem, the problem's name ("Two Sum"). |
| `type` | enum | yes | see Task types | Decides mastery behaviour and validation warnings. |
| `estimatedMinutes` | minutes | yes | 5-180; milestone 0-180 | All time for the session: reading, watching, exercises, notes. The scheduler fits it into a day's remaining budget. Over 90 is a warning ("split into sessions"), except for assessments. |
| `priority` | enum | no | `core` (default), `recommended`, `optional` | What may be deferred. See Priority. |
| `topics` | list(10, 40) | no | normalized to kebab-case | Tags for mastery % per topic and for matching daily problems to recent lessons. Reuse the same topic strings across tasks. |
| `description` | text(4000) | no | | What to do in this session, concretely (which pages, which exercises, what to build). |
| `objectives` | list(12, 300) | no | | What the learner can do afterwards ("Explain why append is amortized O(1)"). |
| `keyConcepts` | list(20, 300) | no | | Terms and ideas to master. Display only. |
| `tradeoffs` | list(10, 300) | no | | Choices to be able to defend ("TCP: reliable, higher latency vs UDP: ..."). Display only. |
| `verificationQuestions` | list(12, 300) | no | | Self-check questions. Shown on the task page and reused as the prompts of the spaced reviews Kiln generates for this task. |
| `resources` | Resource[] | no | at most 10 | What to study, in order. |
| `practice` | Practice | no | only on `practice` and `assessment` | One problem to solve. |
| `dependsOn` | id[] | no | at most 20; task ids only | Tasks that must be completed or scheduled earlier before this one. Hard constraint. |
| `notBeforeDay` | planDay | no | `>=` its module's `notBeforeDay`; not with `fixedDate` | Earliest plan day for this task. Hard constraint. Use it to space repeated sessions (e.g. one mock per day). |
| `fixedDate` | date | fixed mode only | see Date rules | The task goes on exactly this date, even if that day is over budget (reported, not moved). |
| `deadline` | date | fixed mode only | see Date rules | The task should be done by the end of this day. Misses are reported, not hidden. |

Absent lists are `[]`. Absent `priority` is `core`.

### Task types

| Type | Use for | Mastery |
|---|---|---|
| `lesson` | Learning new material | Rated on completion; creates spaced reviews. |
| `practice` | Exercises or one problem | Rated; creates spaced re-solves. |
| `review` | Author-planned consolidation (weekly recap) | Rated; no spaced reviews (it is a review). |
| `project` | Building something; split into session-sized tasks chained with `dependsOn` | Rated; no spaced reviews. |
| `assessment` | Quiz, mock interview, timed test, exam | Rated; the rating feeds topic mastery; no spaced reviews. |
| `milestone` | A checkpoint marker ("Phase 1 done"), usually 0-15 minutes | Not rated. |

Author-planned `review` tasks are separate from the spaced reviews Kiln generates (those are capped at 25% of a day's budget and are not in the file).

### Priority

| Value | Meaning | Scheduler |
|---|---|---|
| `core` | Needed to reach the goal | Always scheduled. Never deferred automatically. |
| `recommended` | Strongly useful, but the goal is reachable without it | Scheduled normally. Deferred only after every optional task, when a deadline would otherwise be missed. |
| `optional` | Extra depth, stretch problems, alternative resources | Scheduled normally while time allows. First to move to the plan's "Optional backlog" when a deadline would be missed, or when the user turns on "Skip optional work". |

Deferral is deterministic: when the projected finish misses a deadline, the scheduler moves `optional` tasks to the backlog, latest in plan order first, until the deadline is met; then `recommended` tasks the same way. It never moves `core` tasks. Remaining misses are reported. Backlog tasks are not deleted; the user can schedule them again. Because dependencies only point to equal or higher priority, deferring a task never strands a task above it.

### Resource

| Field | Type | Required | Constraints | Meaning |
|---|---|---|---|---|
| `title` | text(200) | yes | | e.g. "Dynamic arrays (video)" or "Designing Data-Intensive Applications". |
| `url` | string | no | absolute `http`/`https` URL, at most 2000 chars | Omit when unsure the URL exists. Never guessed. |
| `kind` | enum | yes | `video`, `article`, `book`, `course`, `docs`, `tool`, `visualizer`, `problem`, `other` | Icon and filtering. |
| `minutes` | minutes | no | 0-600 | Time this resource alone takes. Feeds per-source totals. |
| `required` | boolean | no | default `true` | `false` marks "extra reading"; shown as optional on the task page. |
| `section` | text(200) | no | | Which part: "Chapter 5, pp. 120-145", "1:02:00-1:30:00", "Sections 3.1-3.3". |
| `sourceId` | id | no | must match a `sources[].id` | Links the resource to a whole work for per-source totals. |

The task's `estimatedMinutes` is authoritative for scheduling; resource minutes are informational. If the required resources add up to more than `estimatedMinutes`, that is a warning.

### Source

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | id | yes | unique in plan |
| `title` | text(200) | yes | |
| `url` | string | no | absolute `http`/`https` URL |
| `kind` | enum | yes | same values as `resource.kind` |

### Practice

| Field | Type | Required | Constraints | Meaning |
|---|---|---|---|---|
| `provider` | enum | yes | `leetcode`, `other` | |
| `slug` | string | leetcode: yes; other: no | `^[a-z0-9]+(-[a-z0-9]+)*$` | The LeetCode URL slug (`two-sum`). Kiln builds `https://leetcode.com/problems/<slug>/`. A slug missing from Kiln's bundled NeetCode list is a warning. |
| `url` | string | other: yes; leetcode: no | absolute `http`/`https` URL | Link to the problem for non-LeetCode providers. |
| `title` | text(120) | yes | | The problem's name. |
| `difficulty` | enum | yes | `easy`, `medium`, `hard` | Shown on the task; counts toward the LeetCode ramp. |

A LeetCode slug used twice in a plan is a warning (re-solves come from spaced review, not duplicates).

## dailyPractice

| Field | Type | Required | Constraints | Meaning |
|---|---|---|---|---|
| `source` | enum | yes | `neetcode`, `plan` | Where daily problems come from. |
| `perDay` | integer | no | 1-5, default 1 | Problems per study day (a day with budget above 0). |
| `language` | text(30) | no | | e.g. "python". Display only ("Solve in Python"); the app setting wins if set. |
| `startDifficulty` | enum | no | `easy` (default), `medium`, `hard` | Where the ramp starts for generated problems. |
| `topicFollowsLessons` | boolean | no | default `true` | `true`: generated problems match the topics of the most recent lesson. `false`: NeetCode roadmap order. |

How the scheduler uses it (step 3 of each day, after pinned tasks and spaced reviews):

1. The slot takes up to `perDay` of the plan's own tasks that have a `practice` field, in plan order, whose dependencies are completed or scheduled on an earlier day and whose `notBeforeDay` has been reached. So the plan's named problems come first, and each one should `dependsOn` the lesson that teaches it, or the slot may pull it forward.
2. `source: "plan"`: nothing else. Days without a ready plan problem have no daily problem.
3. `source: "neetcode"`: if fewer than `perDay` plan problems were ready, Kiln tops up from its bundled NeetCode list (titles and slugs only), skipping problems already in the plan or already solved. Generated problems count against the day's budget at 25 / 40 / 60 minutes for easy / medium / hard.
4. Ramp (generated problems only; plan problems keep their stated difficulty): start at `startDifficulty`; move to medium after 5 easy problems rated Good or Easy, at least 2 of them in the current topic; add hard after 10 mediums, or in the plan's final 14 days.

Plan problems the slot did not take are scheduled as ordinary tasks when plan order reaches them.

Topic matching for NeetCode uses these topic strings. DSA plans should tag lessons and problems with them (other topics are fine too; they just do not match):

| Topic | NeetCode category |
|---|---|
| `arrays-hashing` | Arrays & Hashing |
| `two-pointers` | Two Pointers |
| `sliding-window` | Sliding Window |
| `stack` | Stack |
| `binary-search` | Binary Search |
| `linked-list` | Linked List |
| `trees` | Trees |
| `tries` | Tries |
| `heap` | Heap / Priority Queue |
| `backtracking` | Backtracking |
| `graphs` | Graphs |
| `advanced-graphs` | Advanced Graphs |
| `dp-1d` | 1-D Dynamic Programming |
| `dp-2d` | 2-D Dynamic Programming |
| `greedy` | Greedy |
| `intervals` | Intervals |
| `math-geometry` | Math & Geometry |
| `bit-manipulation` | Bit Manipulation |

## Parts (large plans)

A plan too long for one LLM reply is written as several files with the same `id`.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `part.index` | integer | yes | 1-20 |
| `part.total` | integer | yes | `>= index`, at most 20 |

- Every part repeats `schemaVersion`, `id`, `title` and `schedulingMode` (and `startDate` in fixed mode). Other plan fields are taken from part 1; a later part with different values gets a warning.
- A part holds whole modules: each task's module is in the same part. `sources` and `dailyPractice` belong in part 1.
- Module `order` is global across parts. Parts are imported in index order.
- `dependsOn` and `sourceId` may point to ids in parts already imported; pointing to a later part is an error.
- Part 1 creates the plan; later parts are added to it (new ids added, existing ids updated, nothing removed). The plan is not scheduled until all `total` parts are in; until then it shows "part 2 of 4 missing".

## Date rules

All checks below are errors.

- Every date is a real calendar date (`2026-02-30` fails).
- `fixedDate` and `deadline` (task and plan) are `>= startDate`.
- A task's `fixedDate` is `<=` its own `deadline` and `<=` the plan `deadline`.
- A task's `deadline` is `<=` the plan `deadline`.
- If task A `dependsOn` B and both have a `fixedDate`, A's date is `>=` B's (same day is allowed; B is listed first).
- A task's earliest day (`startDate` + effective `notBeforeDay` - 1, where effective is the larger of the task's and its module's) must not be after its `deadline`, and a pinned task's `fixedDate` must not be before its module's earliest day.
- At import (not in the file check), a `fixedDate` or `deadline` before today is a warning; those tasks start overdue.

## How the scheduler uses a plan

The scheduler is a pure, deterministic function (stage 4). It runs on import and when the user presses Reschedule; dates are otherwise stable. For each day from the start date, within that weekday's budget:

1. Pinned tasks (`fixedDate`, or pinned in the app) go on their date, even over budget.
2. Spaced reviews that are due, up to 25% of the budget.
3. The daily practice slot (see dailyPractice).
4. Ready tasks in plan order: dependencies completed or already scheduled, `notBeforeDay` reached. Tasks are never split. Several plans are interleaved by the per-plan weight set in the app.

The first task of a day always fits, however long, so a day may run over its budget by that day's reviews and practice.

Then deadlines are checked and priority-based deferral runs (see Priority). Budget, start date, blackout days, the plan weight and the auto-mode deadline are app settings, never file fields.

## Validation

Validation runs in two passes: shape (types, required fields, enums, ranges, lengths, patterns), then meaning (the rules below). All problems are reported at once, in file order, up to 100. Errors block import; warnings do not.

### Errors (meaning)

- `schemaVersion` is not 1 (a higher number: `schemaVersion is 2; this plan was made for a newer version of Kiln`).
- Ids: an id does not match the id pattern; an id is used twice among modules, tasks and sources.
- Order: two modules share an `order`; two tasks in the same module share an `order`.
- References: `moduleId`, `dependsOn` or `sourceId` does not match an id of the right kind (a module id in `dependsOn` is an error).
- Dependencies: a task depends on itself; `dependsOn` forms a cycle (message names the cycle: `a -> b -> a`); a task depends on a task of lower priority (`core` on `recommended` or `optional`, `recommended` on `optional`).
- Mode: any rule in Scheduling modes.
- Dates: any rule in Date rules.
- `notBeforeDay`: a task's is earlier than its module's; module values decrease in module order; a task has both `notBeforeDay` and `fixedDate`.
- Practice: `practice` on a type other than `practice` or `assessment`; leetcode without `slug`; other without `url`.
- Minutes: outside 5-180 (0-180 for milestones).
- Parts: rules in Parts.

### Warnings

- Unknown field (dropped): `week is not a known field and was dropped`. Derived field such as `totalEstimate` (ignored): `totalEstimate is derived by Kiln and was ignored`.
- `estimatedMinutes` over 90 on any type except `assessment`: split into sessions.
- A lesson without `objectives`, `verificationQuestions`, `resources` or `topics`; a practice or assessment task without `description` or `topics`.
- A resource without `minutes`; required resource minutes add up to more than `estimatedMinutes`.
- LeetCode slug not in the bundled list, or used twice.
- `dependsOn` points to a task later in plan order; duplicate entries in `dependsOn` (deduplicated).
- Task `notBeforeDay` values decrease within a module.
- Empty module (ignored).
- `dailyPractice.source` is `neetcode` but no task topic matches a NeetCode topic.
- A later part's plan fields differ from part 1.

### Message format

```
<location> "<label>": <message>
```

- **location**: JSON path to the nearest object, 0-based indices: `tasks[13]`, `tasks[13].resources[2]`, `modules[0]`. The top level is `plan`. CSV/XLSX rows use `row 15` (the spreadsheet row number, header is row 1). Problems before parsing use `input` or `json`.
- **label**: that object's `title`, cut to 40 characters. Omitted, with its quotes, when the object has no title.
- **message**: the field (relative path) then the problem, lowercase.
- Warnings start with `warning: `.

Examples:

```
tasks[13] "Two Sum": estimatedMinutes is required
tasks[13] "Two Sum": estimatedMinutes must be an integer from 5 to 180
tasks[4] "Dynamic arrays": dependsOn[1] "arrays-intro" does not match any task id
tasks[7] "Sliding window drills": dependsOn creates a cycle: sw-drills -> sw-intro -> sw-drills
tasks[2] "Hash maps": id "hash-maps" is also used by modules[1]
tasks[9] "Mock exam": fixedDate is not allowed when schedulingMode is "auto"; use "fixed" or pin the date in Kiln after import
tasks[13].resources[0] "NeetCode walkthrough": url must be an absolute http(s) URL
plan "DSA in 16 weeks": schedulingMode must be one of: auto, fixed
json: line 12, column 5: unexpected "}"
input: found 2 json blocks; expected exactly 1
row 15 "Two Sum": type must be one of: lesson, practice, review, project, milestone, assessment
warning: tasks[20] "Edit Distance": estimatedMinutes is 120; split work over 90 minutes into sessions
```

## Ids and re-import

Plan-local ids (`id` on the plan, modules, tasks, sources) live only in the file. On import (stage 3) Kiln creates a UUIDv7 for every record and stores the plan-local id next to it. Re-importing a file whose plan `id` matches an existing plan offers:

- **Update**: records are matched by plan-local id. Matched tasks keep their completion, ratings, review history and assigned dates; changed fields (title, estimate, resources) are applied, and changed estimates take effect at the next Reschedule. New ids are added and scheduled. Tasks missing from the file are listed and, after confirmation, removed (tombstoned, so sync can propagate it).
- **Import as a copy**: a new plan with new UUIDs.

So keep ids stable when you edit or regenerate a plan: change a title freely, but do not rename an id unless the task really is a different task.

## Example (fixed mode)

```json
{
  "schemaVersion": 1,
  "id": "stats-101-final",
  "title": "Intro Statistics: final exam prep",
  "goal": "Score at least 85% on the STAT 101 final",
  "subject": "Statistics",
  "level": "beginner",
  "schedulingMode": "fixed",
  "startDate": "2026-11-09",
  "deadline": "2026-12-11",
  "modules": [
    { "id": "inference", "title": "Inference", "order": 1, "summary": "Confidence intervals and hypothesis tests." }
  ],
  "tasks": [
    {
      "id": "ci-means", "moduleId": "inference", "order": 1,
      "title": "Confidence intervals for a mean", "type": "lesson", "estimatedMinutes": 60,
      "topics": ["confidence-intervals"],
      "description": "Read the section, then work examples 1-3 by hand before checking.",
      "objectives": ["Build a t-interval for a mean and interpret it in one sentence"],
      "keyConcepts": ["standard error", "t distribution", "margin of error"],
      "verificationQuestions": ["Why does the interval widen when the sample is smaller?"],
      "resources": [
        { "title": "Course textbook", "kind": "book", "minutes": 40, "section": "Section 8.1" }
      ]
    },
    {
      "id": "ci-exercises", "moduleId": "inference", "order": 2,
      "title": "Interval exercises", "type": "practice", "estimatedMinutes": 45, "priority": "recommended",
      "topics": ["confidence-intervals"], "dependsOn": ["ci-means"],
      "description": "Exercises 8.3, 8.7 and 8.12; check answers against the solutions manual."
    },
    {
      "id": "final-exam", "moduleId": "inference", "order": 3,
      "title": "Final exam", "type": "assessment", "estimatedMinutes": 120,
      "topics": ["confidence-intervals"], "dependsOn": ["ci-means"],
      "description": "In person, closed book.", "fixedDate": "2026-12-11"
    }
  ]
}
```
