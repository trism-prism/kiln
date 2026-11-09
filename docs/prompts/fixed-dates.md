# Prompt: plan with fixed dates

The second "Copy prompt" button (fixed dates) copies everything between the `prompt:start` and `prompt:end` HTML comment markers below (each appears exactly once), with `{{SCHEMA_REFERENCE}}` replaced by the field reference generated from the plan schema, so the prompt and the schema cannot drift. The generated copy of that reference at the bottom of this file is for reading only and is not copied; `npm run schema` refreshes it. Use this prompt when some work happens on real dates (exams, classes, interviews, due dates); Kiln still schedules every undated task around them. Spec: `docs/plan-format.md`.

<!-- prompt:start -->
You are helping me create a study plan that I will import into Kiln, a study-plan tracker. Some parts of my plan happen on real dates. Kiln pins those and schedules everything else around them from my daily time budget.

Talk to me in plain, friendly language, as you would to a first-year student. When you speak to me, don't mention JSON, code blocks, schemas, ids or field names; call the block 'your Kiln plan'. After the plan, tell me: 'Copy this whole reply and paste it into Kiln.'

## Step 1: ask before writing

Ask me, in one message, for anything below that I have not already told you, then wait for my answers. You must have my answers to 1 and 2 before you write anything. Never invent, estimate or assume a date. If I write a date that could be read two ways, such as 03/04, ask me which I mean.

If I only want regular study time for a subject, with no lessons or tasks (for example "study psychology 3 hours a week"), ask only for the subject and the time per week, then write a study time plan as described in the rules. It needs no dates.

1. Start date: the day I begin (any format; you convert it).
2. Dated parts: every fixed event or due date (exams, quizzes, class sessions, mock interviews, project due dates), and for each one: what it is, the date, and whether it happens on that day (an event) or must be finished by that day (a due date). If my material already contains dates, list them back and ask me to confirm.
3. Final deadline, if any.
4. Class calendar: Do you have a class calendar link? Paste it here, or say no. If I paste a calendar link, open it and use the classes, exams and due dates in it to build the plan around my class schedule. If you can't open it, say so and ask me to paste the upcoming dates instead. Never guess dates.
5. Goal: what I want to be able to do at the end, and how I will know I am done.
6. Current level: what I already know, specifically.
7. Time: about how many minutes per day I can study.
8. Resources: anything I want to use or avoid, and whether everything must be free, and links to any videos, problem sets, flashcards (Quizlet) or docs I already have.
9. Programming subjects: which language. Coding interview prep: whether I want one practice problem a day.

If I attached material (a syllabus, an existing plan, notes), use it as the backbone and still ask about anything missing.

## Step 2: write the plan

Output a short Markdown overview for me (goal, the dates I gave you, your assumptions, a table of modules with hours), then exactly one ```json code block with the whole plan. No other code blocks. After the block, write only: "Copy this whole reply and paste it into Kiln." (in a long plan, after every part but the last: "Copy this whole reply and paste it into Kiln. Then reply next for the rest of the plan.") The JSON must be strict: no comments, no trailing commas.

Rules:

- Study time plan: when I only want regular study time, the whole plan is `{"schemaVersion": 1, "id": "study-psychology", "title": "Psychology", "subject": "Psychology", "schedulingMode": "auto", "studyMinutesPerWeek": 180}` with my subject and minutes. Use "auto" here even though this prompt is for fixed dates. Leave out `modules`, `tasks`, `sources`, `dailyPractice`, `part` and every date. Kiln plans one session a day from the weekly time. Skip the overview table of modules.
- `"schedulingMode": "fixed"` and `startDate` set to my start date. Set the plan `deadline` only if I gave a final deadline.
- Dates: use only dates I gave you. An event goes in `fixedDate` on its task. A due date goes in `deadline`. Work that must be ready before an event (studying for an exam) may get a `deadline` equal to that event's date. Every other task has no date.
- Date sanity: every date is on or after `startDate` and on or before the plan `deadline`; a task's `fixedDate` is on or before its own `deadline`; a dated task is not before a dated task it depends on. Never put `notBeforeDay` on a task with a `fixedDate`.
- Size: total `estimatedMinutes` should be about 90% of my daily minutes times the days available, leaving about 10% of the time free for catching up. If the material does not fit, keep it but mark the least essential work `recommended` or `optional`, and say so in the overview.
- Sessions: every task is one sitting of 20 to 90 minutes (an exam or mock may be longer, up to 180). Split longer work into tasks ("Part 1 of 3") chained with `dependsOn`. Expand every day or week of a source plan into concrete tasks.
- Realistic minutes for my level: include reading or watching (about 1.5x video length for a beginner), notes and exercises. Beginner coding problems: easy 30-45, medium 45-75, hard 75-90.
- Fill every task completely. `description` says exactly what to do (which chapter, which video section, which exercises). Lessons get 2-4 `objectives`, `keyConcepts`, 2-4 `verificationQuestions`, `topics` and at least one resource. Add `tradeoffs` wherever the topic involves real choices. Every resource gets `minutes`.
- One problem per practice task, in `practice`, and it `dependsOn` the lesson that teaches it. Use a LeetCode slug only if you are sure it is the official one; otherwise omit `practice` and name the problem in `description`.
- Priority: `core` for what the goal needs, `recommended` for useful but skippable work, `optional` for extra depth. Kiln drops optional work first, then recommended, when a date cannot be met. A task may only depend on tasks of the same or higher priority. Dated events are `core`.
- Links: give every resource a working `url`, in any subject, when it is a video, article, course, documentation page, book, tool, visualizer, flashcard deck (for example Quizlet) or other web page, and every practice problem that has a web page (for provider other, `url` is required). Look each link up (use web search or browsing if you have it) instead of writing it from memory. For a chapter of a longer video, link the video at the chapter's start: append `&t=<seconds>s` to a `youtube.com/watch?v=` link (or `?t=<seconds>` to a `youtu.be` link), taking the time only from the video's own chapter list or description; if you do not know the time, link the video without one. If you can browse, check that each link opens the right page; if you cannot, treat the link as unverified. Never guess a link: for an unverified link, omit `url`, still give the title, author or channel, and `section`, and list those items in a short note placed before the JSON block (in a long plan, in the reply for the last part) so I know which links are missing.
- Ids: lowercase slugs, unique across modules, tasks and sources, descriptive (`ci-for-means`, not `t7`). `order` starts at 1 in each module.
- Topics: short kebab-case strings, reused exactly across tasks. For data structures and algorithms use these where they fit: arrays-hashing, two-pointers, sliding-window, stack, binary-search, linked-list, trees, tries, heap, backtracking, graphs, advanced-graphs, dp-1d, dp-2d, greedy, intervals, math-geometry, bit-manipulation.
- Long plans: if the plan has more than 40 tasks, split it into parts of whole modules, at most 40 tasks each. Every part is a complete JSON block with the same `id`, `title`, `schedulingMode`, `startDate` and `"part": {"index": n, "total": N}`; `sources` and `dailyPractice` go in part 1 only; `dependsOn` may point to earlier parts. Write part 1, then stop; after its block write only: "Copy this whole reply and paste it into Kiln. Then reply next for the rest of the plan."
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

## Field reference (generated copy, not copied)

<!-- schema-reference:start -->
### Plan
The top level of the file.

- `schemaVersion` (required): must be 1.
- `id` (required): lowercase slug (letters, digits, hyphens). stable plan id
- `title` (required): text, at most 120 characters.
- `description` (optional): text, at most 2000 characters.
- `goal` (optional): text, at most 500 characters.
- `subject` (optional): text, at most 120 characters.
- `level` (optional): one of beginner | intermediate | advanced.
- `audience` (optional): text, at most 300 characters.
- `schedulingMode` (required): one of auto | fixed. auto: the file has no dates; fixed: startDate and at least one date are required
- `startDate` (optional): date yyyy-mm-dd. fixed mode only (required there); day 1 of the plan
- `deadline` (optional): date yyyy-mm-dd. fixed mode only; not before startDate
- `sources` (optional): list of Source objects, at most 50 items.
- `dailyPractice` (optional): DailyPractice object. The daily problem slot.
- `studyMinutesPerWeek` (optional): integer 15-2400. study time plan only: minutes per week, from which Kiln plans a daily session; leave out modules, tasks, sources, dailyPractice and part
- `part` (optional): Part object. Present only when the plan is split across several files.
- `modules` (optional): list of Module objects, at most 100 items. at least 1 unless studyMinutesPerWeek is set
- `tasks` (optional): list of Task objects, at most 2000 items. at least 1 unless studyMinutesPerWeek is set

### Module
- `id` (required): lowercase slug (letters, digits, hyphens). unique across modules, tasks and sources
- `title` (required): text, at most 120 characters.
- `order` (required): integer 1-1000. unique among modules; gaps allowed
- `summary` (optional): text, at most 1000 characters.
- `notBeforeDay` (optional): integer 1-3650. plan day (day 1 is the start date); never earlier than a previous module has

### Task
- `id` (required): lowercase slug (letters, digits, hyphens). unique across modules, tasks and sources
- `moduleId` (required): lowercase slug (letters, digits, hyphens). id of a module
- `order` (required): integer 1-10000. unique within the module
- `title` (required): text, at most 120 characters. for a problem, its name
- `type` (required): one of lesson | practice | review | project | assessment | milestone.
- `estimatedMinutes` (required): integer 0-180. all time for the session; every type except milestone needs at least 5; keep at most 90 except for assessments
- `priority` (optional): one of core | recommended | optional, default core. what may be deferred when time runs short
- `topics` (optional): list of text, at most 40 characters each, at most 10 items. kebab-case tags, reused exactly across tasks
- `description` (optional): text, at most 4000 characters. exactly what to do in this session
- `objectives` (optional): list of text, at most 300 characters each, at most 12 items.
- `keyConcepts` (optional): list of text, at most 300 characters each, at most 20 items.
- `tradeoffs` (optional): list of text, at most 300 characters each, at most 10 items.
- `verificationQuestions` (optional): list of text, at most 300 characters each, at most 12 items.
- `resources` (optional): list of Resource objects, at most 10 items.
- `practice` (optional): Practice object. practice and assessment tasks only
- `dependsOn` (optional): list of lowercase slug (letters, digits, hyphens) each, at most 20 items. task ids of the same or higher priority; no cycles
- `notBeforeDay` (optional): integer 1-3650. plan day; not with fixedDate; not before its module has
- `fixedDate` (optional): date yyyy-mm-dd. fixed mode only
- `deadline` (optional): date yyyy-mm-dd. fixed mode only

### Resource
- `title` (required): text, at most 200 characters.
- `url` (optional): absolute http(s) URL. a working link to the exact page; omit only if it cannot be verified
- `kind` (required): one of video | article | book | course | docs | tool | visualizer | problem | other.
- `minutes` (optional): integer 0-600. time this resource alone takes
- `required` (optional): true or false, default true. false marks extra reading
- `section` (optional): text, at most 200 characters. which part, e.g. "Chapter 5" or "1:02:00-1:30:00"
- `sourceId` (optional): lowercase slug (letters, digits, hyphens). id of an entry in sources

### Practice
practice and assessment tasks only

- `provider` (required): one of leetcode | other.
- `slug` (optional): lowercase slug (letters, digits, hyphens). required for leetcode; the official slug from the problem URL
- `url` (optional): absolute http(s) URL. required for provider other
- `title` (required): text, at most 120 characters. the problem's name
- `difficulty` (required): one of easy | medium | hard.

### Source
A whole work the plan draws on, such as a course or a book.

- `id` (required): lowercase slug (letters, digits, hyphens). unique across modules, tasks and sources
- `title` (required): text, at most 200 characters.
- `url` (optional): absolute http(s) URL.
- `kind` (required): one of video | article | book | course | docs | tool | visualizer | problem | other.

### DailyPractice
The daily problem slot.

- `source` (required): one of neetcode | plan. neetcode tops up from the NeetCode list; plan uses only problems in the plan
- `perDay` (optional): integer 1-5, default 1. problems per study day
- `language` (optional): text, at most 30 characters. e.g. python
- `startDifficulty` (optional): one of easy | medium | hard, default easy.
- `topicFollowsLessons` (optional): true or false, default true. true: generated problems match the most recent lesson topics

### Part
Present only when the plan is split across several files.

- `index` (required): integer 1-20.
- `total` (required): integer 1-20. at least index

Text is plain text, not Markdown. Leave out optional fields you have nothing for instead of writing null or an empty string.
<!-- schema-reference:end -->
