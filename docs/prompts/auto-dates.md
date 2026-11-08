# Prompt: Kiln assigns the dates

The first "Copy prompt" button (Kiln assigns the dates) copies everything between the `prompt:start` and `prompt:end` HTML comment markers below (each appears exactly once), with `{{SCHEMA_REFERENCE}}` replaced by the field reference generated from the plan schema, so the prompt and the schema cannot drift. The generated copy of that reference at the bottom of this file is for reading only and is not copied; `npm run schema` refreshes it. The user pastes the prompt into any chat LLM together with their goal or source material. Spec: `docs/plan-format.md`.

<!-- prompt:start -->
You are helping me create a study plan that I will import into Kiln, a study-plan tracker. Kiln puts the tasks on my calendar from my daily time budget, so you write no dates at all.

Talk to me in plain, friendly language, as you would to a first-year student. When you speak to me, don't mention JSON, code blocks, schemas, ids or field names; call the block 'your Kiln plan'. After the plan, tell me: 'Copy this whole reply and paste it into Kiln.'

## Step 1: ask before writing

Ask me, in one message, for anything below that I have not already told you, then wait for my answers. Do not write the plan before I answer.

1. Goal: what I want to be able to do at the end, and how I will know I am done.
2. Current level: what I already know, specifically (not just "beginner").
3. Time: about how many minutes per day I can study, and whether I have a deadline (I enter dates in Kiln; you only use them to size the plan).
4. Class calendar: Do you have a class calendar link? Paste it here, or say no. If I paste a calendar link, open it and use the classes, exams and due dates in it to build the plan around my class schedule. If you can't open it, say so and ask me to paste the upcoming dates instead. Never guess dates. Use the calendar only to order the modules so each topic comes before the class needs it; still write no dates.
5. Resources: anything I want to use or avoid, and whether everything must be free, and links to any videos, problem sets, flashcards (Quizlet) or docs I already have.
6. Programming subjects: which language. Coding interview prep: whether I want one practice problem a day.

If I attached material (a syllabus, an existing plan, notes), use it as the backbone and still ask about anything missing.

## Step 2: write the plan

Output a short Markdown overview for me (goal, your assumptions, a table of modules with hours), then exactly one ```json code block with the whole plan. No other code blocks. After the block, write only: "Copy this whole reply and paste it into Kiln." The JSON must be strict: no comments, no trailing commas.

Rules:

- `"schedulingMode": "auto"`. No dates anywhere: no `startDate`, `deadline` or `fixedDate`. Use `notBeforeDay` only to hold work back (for example one mock interview per day).
- Size: total `estimatedMinutes` should be about 90% of my daily minutes times the days I have, leaving about 10% of the time free for catching up. If the material does not fit, keep it but mark the least essential work `recommended` or `optional`, and say so in the overview.
- Sessions: every task is one sitting of 20 to 90 minutes. Split longer work into tasks ("Part 1 of 3") chained with `dependsOn`. Expand every day or week of a source plan into concrete tasks; never one task for a whole week.
- Realistic minutes for my level: include reading or watching (about 1.5x video length for a beginner, who pauses and rewinds), notes and exercises. Beginner coding problems: easy 30-45, medium 45-75, hard 75-90.
- Fill every task completely. `description` says exactly what to do (which chapter, which video section, which exercises). Lessons get 2-4 `objectives`, `keyConcepts`, 2-4 `verificationQuestions`, `topics` and at least one resource. Add `tradeoffs` wherever the topic involves real choices. Every resource gets `minutes`.
- One problem per practice task, in `practice`, and it `dependsOn` the lesson that teaches it. Use a LeetCode slug only if you are sure it is the official one; otherwise omit `practice` and name the problem in `description`.
- Priority: `core` for what the goal needs, `recommended` for useful but skippable work, `optional` for extra depth. Kiln drops optional work first, then recommended, when time runs short. A task may only depend on tasks of the same or higher priority.
- Links: give every video, problem set, flashcard deck (for example Quizlet) and documentation page a `url`, in any subject. Include a `url` only when you are confident the page exists at that address; never invent a link. When you are not sure, ask me for the link in your first message, before you write the plan, instead of leaving it out. If I cannot give one, omit `url` and give the title, author or channel, and `section` so I can find it.
- Ids: lowercase slugs, unique across modules, tasks and sources, descriptive (`hash-map-basics`, not `t7`). `order` starts at 1 in each module.
- Topics: short kebab-case strings, reused exactly across tasks. For data structures and algorithms use these where they fit: arrays-hashing, two-pointers, sliding-window, stack, binary-search, linked-list, trees, tries, heap, backtracking, graphs, advanced-graphs, dp-1d, dp-2d, greedy, intervals, math-geometry, bit-manipulation.
- Long plans: if the plan has more than 40 tasks, split it into parts of whole modules, at most 40 tasks each. Every part is a complete JSON block with the same `id`, `title`, `schedulingMode` and `"part": {"index": n, "total": N}`; `sources` and `dailyPractice` go in part 1 only; `dependsOn` may point to earlier parts. Write part 1, then stop and tell me to reply "next".
- Before you answer, check: ids unique, every `moduleId`, `dependsOn` and `sourceId` exists, no dependency cycles, all minutes are whole numbers.

## Field reference

{{SCHEMA_REFERENCE}}

## Example (shape only; a real plan has far more tasks)

```json
{
  "schemaVersion": 1,
  "id": "dsa-foundations",
  "title": "DSA foundations",
  "description": "Arrays, hashing and linked lists with daily practice.",
  "goal": "Solve easy array and linked list problems unaided",
  "subject": "Data structures and algorithms",
  "level": "beginner",
  "audience": "Student new to LeetCode",
  "schedulingMode": "auto",
  "sources": [
    { "id": "fiset-course", "title": "Data Structures Easy to Advanced (William Fiset, freeCodeCamp)", "kind": "video" }
  ],
  "dailyPractice": { "source": "neetcode", "perDay": 1, "language": "python", "startDifficulty": "easy", "topicFollowsLessons": true },
  "modules": [
    { "id": "arrays", "title": "Arrays and hashing", "order": 1, "summary": "Memory layout, dynamic arrays, hash maps." },
    { "id": "linked-lists", "title": "Linked lists", "order": 2, "summary": "Pointer-based lists.", "notBeforeDay": 8 }
  ],
  "tasks": [
    {
      "id": "hash-map-basics", "moduleId": "arrays", "order": 1,
      "title": "Hash maps and lookups", "type": "lesson", "estimatedMinutes": 60, "priority": "core",
      "topics": ["arrays-hashing"],
      "description": "Watch the hash table section, then trace three insertions with collisions on paper.",
      "objectives": ["Explain average O(1) lookup", "Describe one collision strategy"],
      "keyConcepts": ["hash function", "load factor", "separate chaining"],
      "tradeoffs": ["Hash map: O(1) lookup, more memory vs sorted array: O(log n) lookup, compact"],
      "verificationQuestions": ["Why does a high load factor slow lookups?", "When is a hash map the wrong choice?"],
      "resources": [
        { "title": "Hash table introduction", "kind": "video", "minutes": 35, "sourceId": "fiset-course", "section": "Hash table chapter" }
      ]
    },
    {
      "id": "two-sum", "moduleId": "arrays", "order": 2,
      "title": "Two Sum", "type": "practice", "estimatedMinutes": 40, "priority": "core",
      "topics": ["arrays-hashing"], "dependsOn": ["hash-map-basics"],
      "description": "Brute force first, then one pass with a hash map. State time and space for both.",
      "practice": { "provider": "leetcode", "slug": "two-sum", "title": "Two Sum", "difficulty": "easy" }
    },
    {
      "id": "contains-duplicate", "moduleId": "arrays", "order": 3,
      "title": "Contains Duplicate", "type": "practice", "estimatedMinutes": 30, "priority": "recommended",
      "topics": ["arrays-hashing"], "dependsOn": ["hash-map-basics"],
      "description": "Solve with a set; compare with sorting.",
      "practice": { "provider": "leetcode", "slug": "contains-duplicate", "title": "Contains Duplicate", "difficulty": "easy" }
    },
    {
      "id": "singly-linked-lists", "moduleId": "linked-lists", "order": 1,
      "title": "Singly linked lists", "type": "lesson", "estimatedMinutes": 75, "priority": "core",
      "topics": ["linked-list"], "dependsOn": ["hash-map-basics"],
      "description": "Watch the linked list section, then implement prepend, append and delete in Python.",
      "objectives": ["Implement a singly linked list", "Compare list and array operation costs"],
      "keyConcepts": ["node", "head pointer", "traversal"],
      "verificationQuestions": ["Why is prepend O(1) but access by index O(n)?"],
      "resources": [
        { "title": "Linked list introduction", "kind": "video", "minutes": 30, "sourceId": "fiset-course", "section": "Linked list chapter" },
        { "title": "VisuAlgo linked list", "url": "https://visualgo.net/en/list", "kind": "visualizer", "minutes": 15, "required": false }
      ]
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
- `part` (optional): Part object. Present only when the plan is split across several files.
- `modules` (required): list of Module objects, 1-100 items.
- `tasks` (required): list of Task objects, 1-2000 items.

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
- `url` (optional): absolute http(s) URL. only if you are certain the page exists; never guess
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
