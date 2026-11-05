# Prompt: plan with fixed dates

The "Copy prompt (fixed dates)" button copies everything between the `prompt:start` and `prompt:end` HTML comment markers below (each appears exactly once), with `{{SCHEMA_REFERENCE}}` replaced by the field reference generated from the plan schema, so the prompt and the schema cannot drift. The hand-written copy of that reference at the bottom of this file is for reading only and is not copied. Use this prompt when some work happens on real dates (exams, classes, interviews, due dates); Kiln still schedules every undated task around them. Spec: `docs/plan-format.md`.

<!-- prompt:start -->
You are helping me create a study plan that I will import into Kiln, a study-plan tracker. Some parts of my plan happen on real dates. Kiln pins those and schedules everything else around them from my daily time budget.

## Step 1: ask before writing

Ask me, in one message, for anything below that I have not already told you, then wait for my answers. You must have my answers to 1 and 2 before you write anything. Never invent, estimate or assume a date.

1. Start date: the day I begin (yyyy-mm-dd).
2. Dated parts: every fixed event or due date (exams, quizzes, class sessions, mock interviews, project due dates), and for each one: what it is, the date, and whether it happens on that day (an event) or must be finished by that day (a due date). If my material already contains dates, list them back and ask me to confirm.
3. Final deadline, if any.
4. Goal: what I want to be able to do at the end, and how I will know I am done.
5. Current level: what I already know, specifically.
6. Time: about how many minutes per day I can study.
7. Resources: anything I want to use or avoid, and whether everything must be free.
8. Programming subjects: which language. Coding interview prep: whether I want one practice problem a day.

If I attached material (a syllabus, an existing plan, notes), use it as the backbone and still ask about anything missing.

## Step 2: write the plan

Output a short Markdown overview for me (goal, the dates I gave you, your assumptions, a table of modules with hours), then exactly one ```json code block with the whole plan. No other code blocks, nothing after it. The JSON must be strict: no comments, no trailing commas.

Rules:

- `"schedulingMode": "fixed"` and `startDate` set to my start date. Set the plan `deadline` only if I gave a final deadline.
- Dates: use only dates I gave you. An event goes in `fixedDate` on its task. A due date goes in `deadline`. Work that must be ready before an event (studying for an exam) may get a `deadline` equal to that event's date. Every other task has no date.
- Date sanity: every date is on or after `startDate` and on or before the plan `deadline`; a task's `fixedDate` is on or before its own `deadline`; a dated task is not before a dated task it depends on. Never put `notBeforeDay` on a task with a `fixedDate`.
- Size: total `estimatedMinutes` should be about my daily minutes times the days available, minus 20% for the reviews Kiln adds. If the material does not fit, keep it but mark the least essential work `recommended` or `optional`, and say so in the overview.
- Sessions: every task is one sitting of 20 to 90 minutes (an exam or mock may be longer, up to 180). Split longer work into tasks ("Part 1 of 3") chained with `dependsOn`. Expand every day or week of a source plan into concrete tasks.
- Realistic minutes for my level: include reading or watching (about 1.5x video length for a beginner), notes and exercises. Beginner coding problems: easy 30-45, medium 45-75, hard 75-90.
- Fill every task completely. `description` says exactly what to do (which chapter, which video section, which exercises). Lessons get 2-4 `objectives`, `keyConcepts`, 2-4 `verificationQuestions`, `topics` and at least one resource. Add `tradeoffs` wherever the topic involves real choices. Every resource gets `minutes`.
- One problem per practice task, in `practice`, and it `dependsOn` the lesson that teaches it. Use a LeetCode slug only if you are sure it is the official one; otherwise omit `practice` and name the problem in `description`.
- Priority: `core` for what the goal needs, `recommended` for useful but skippable work, `optional` for extra depth. Kiln drops optional work first, then recommended, when a date cannot be met. A task may only depend on tasks of the same or higher priority. Dated events are `core`.
- URLs: include `url` only when you are confident the page exists at that address. Otherwise omit `url` and give the title, author or channel, and `section` so I can find it. Never invent a link.
- Ids: lowercase slugs, unique across modules, tasks and sources, descriptive (`ci-for-means`, not `t7`). `order` starts at 1 in each module.
- Topics: short kebab-case strings, reused exactly across tasks. For data structures and algorithms use these where they fit: arrays-hashing, two-pointers, sliding-window, stack, binary-search, linked-list, trees, tries, heap, backtracking, graphs, advanced-graphs, dp-1d, dp-2d, greedy, intervals, math-geometry, bit-manipulation.
- Long plans: if the plan has more than 40 tasks, split it into parts of whole modules, at most 40 tasks each. Every part is a complete JSON block with the same `id`, `title`, `schedulingMode`, `startDate` and `"part": {"index": n, "total": N}`; `sources` and `dailyPractice` go in part 1 only; `dependsOn` may point to earlier parts. Write part 1, then stop and tell me to reply "next".
- Before you answer, check: ids unique, every `moduleId`, `dependsOn` and `sourceId` exists, no dependency cycles, all minutes are whole numbers, every date is one I gave you.

## Field reference

{{SCHEMA_REFERENCE}}

## Example (shape only; a real plan has far more tasks)

```json
{
  "schemaVersion": 1,
  "id": "stats-101-final",
  "title": "Intro statistics: final exam prep",
  "description": "Inference and regression for the STAT 101 final.",
  "goal": "Score at least 85% on the final",
  "subject": "Statistics",
  "level": "beginner",
  "audience": "First-year student",
  "schedulingMode": "fixed",
  "startDate": "2026-11-09",
  "deadline": "2026-12-11",
  "modules": [
    { "id": "inference", "title": "Inference", "order": 1, "summary": "Confidence intervals and tests." },
    { "id": "regression", "title": "Regression", "order": 2, "summary": "Simple linear regression." }
  ],
  "tasks": [
    {
      "id": "ci-for-means", "moduleId": "inference", "order": 1,
      "title": "Confidence intervals for a mean", "type": "lesson", "estimatedMinutes": 60, "priority": "core",
      "topics": ["confidence-intervals"],
      "description": "Read section 8.1, then work examples 1-3 by hand before checking.",
      "objectives": ["Build a t-interval for a mean", "Interpret an interval in one sentence"],
      "keyConcepts": ["standard error", "t distribution", "margin of error"],
      "tradeoffs": ["Higher confidence level: wider interval vs lower: narrower but misses more often"],
      "verificationQuestions": ["Why does the interval widen for smaller samples?", "What does 95% confidence refer to?"],
      "resources": [{ "title": "Course textbook", "kind": "book", "minutes": 40, "section": "Section 8.1" }]
    },
    {
      "id": "midterm-2", "moduleId": "inference", "order": 2,
      "title": "Midterm 2", "type": "assessment", "estimatedMinutes": 75, "priority": "core",
      "topics": ["confidence-intervals"], "dependsOn": ["ci-for-means"],
      "description": "In class, closed book, covers chapter 8.",
      "fixedDate": "2026-11-20"
    },
    {
      "id": "least-squares", "moduleId": "regression", "order": 1,
      "title": "Least squares regression", "type": "lesson", "estimatedMinutes": 75, "priority": "core",
      "topics": ["regression"], "dependsOn": ["midterm-2"],
      "description": "Read section 10.1, fit a line to the chapter's height data by hand, then check with a calculator.",
      "objectives": ["Compute slope and intercept", "Interpret the slope in context"],
      "keyConcepts": ["residual", "least squares", "r squared"],
      "verificationQuestions": ["Why do we square residuals instead of summing them?"],
      "resources": [{ "title": "Course textbook", "kind": "book", "minutes": 45, "section": "Section 10.1" }],
      "deadline": "2026-12-11"
    },
    {
      "id": "final-exam", "moduleId": "regression", "order": 2,
      "title": "Final exam", "type": "assessment", "estimatedMinutes": 120, "priority": "core",
      "topics": ["confidence-intervals", "regression"], "dependsOn": ["least-squares"],
      "description": "In person, closed book, cumulative.",
      "fixedDate": "2026-12-11"
    }
  ]
}
```
<!-- prompt:end -->

## Field reference (hand-written copy, not copied)

<!-- schema-reference:hand -->
This is what `{{SCHEMA_REFERENCE}}` expands to. Once the schema code exists, the generated text replaces it and this copy can be checked against it.

- Plan: `schemaVersion` 1 (required); `id` (required); `title` (required, at most 120 chars); `description`; `goal`; `subject`; `level` beginner | intermediate | advanced; `audience`; `schedulingMode` auto | fixed (required); `startDate` yyyy-mm-dd (fixed: required; auto: not allowed); `deadline` yyyy-mm-dd (fixed only); `sources[]`; `dailyPractice`; `part`; `modules[]` (required); `tasks[]` (required).
- Module: `id`, `title`, `order` (integer from 1, unique) required; `summary`; `notBeforeDay` (integer from 1, plan day; never earlier than a previous module's).
- Task: `id`, `moduleId`, `order` (integer from 1, unique in its module), `title`, `type` lesson | practice | review | project | milestone | assessment, `estimatedMinutes` (integer 5-180; milestone 0-180; keep at most 90) required; `priority` core | recommended | optional (default core); `topics[]`; `description`; `objectives[]`; `keyConcepts[]`; `tradeoffs[]`; `verificationQuestions[]`; `resources[]` (at most 10); `practice` (practice and assessment tasks only); `dependsOn[]` (task ids of the same or higher priority, no cycles); `notBeforeDay` (not with fixedDate; not before its module's); `fixedDate` yyyy-mm-dd (fixed only); `deadline` yyyy-mm-dd (fixed only).
- Resource: `title`, `kind` video | article | book | course | docs | tool | visualizer | problem | other required; `url` (absolute http or https, only if certain); `minutes` (integer); `required` (boolean, default true); `section`; `sourceId`.
- Source: `id`, `title`, `kind` required; `url`.
- Practice: `provider` leetcode | other, `title`, `difficulty` easy | medium | hard required; `slug` (required for leetcode); `url` (required for other).
- dailyPractice: `source` neetcode | plan (required); `perDay` 1-5 (default 1); `language`; `startDifficulty` easy | medium | hard (default easy); `topicFollowsLessons` boolean (default true).
- part: `index`, `total` (integers, 1-20).
- Ids: lowercase letters, digits and hyphens, at most 64 chars, unique across modules, tasks and sources. Text is plain (no Markdown). Lists hold at most 10-20 short items.
