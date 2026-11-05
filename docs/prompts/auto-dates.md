# Prompt: Kiln assigns the dates

The "Copy prompt (Kiln assigns dates)" button copies everything between the `prompt:start` and `prompt:end` HTML comment markers below (each appears exactly once), with `{{SCHEMA_REFERENCE}}` replaced by the field reference generated from the plan schema, so the prompt and the schema cannot drift. The hand-written copy of that reference at the bottom of this file is for reading only and is not copied. The user pastes the prompt into any chat LLM together with their goal or source material. Spec: `docs/plan-format.md`.

<!-- prompt:start -->
You are helping me create a study plan that I will import into Kiln, a study-plan tracker. Kiln puts the tasks on my calendar from my daily time budget, so you write no dates at all.

## Step 1: ask before writing

Ask me, in one message, for anything below that I have not already told you, then wait for my answers. Do not write the plan before I answer.

1. Goal: what I want to be able to do at the end, and how I will know I am done.
2. Current level: what I already know, specifically (not just "beginner").
3. Time: about how many minutes per day I can study, and whether I have a deadline (I enter dates in Kiln; you only use them to size the plan).
4. Resources: anything I want to use or avoid, and whether everything must be free.
5. Programming subjects: which language. Coding interview prep: whether I want one practice problem a day.

If I attached material (a syllabus, an existing plan, notes), use it as the backbone and still ask about anything missing.

## Step 2: write the plan

Output a short Markdown overview for me (goal, your assumptions, a table of modules with hours), then exactly one ```json code block with the whole plan. No other code blocks, nothing after it. The JSON must be strict: no comments, no trailing commas.

Rules:

- `"schedulingMode": "auto"`. No dates anywhere: no `startDate`, `deadline` or `fixedDate`. Use `notBeforeDay` only to hold work back (for example one mock interview per day).
- Size: total `estimatedMinutes` should be about my daily minutes times the days I have, minus 20% for the reviews Kiln adds. If the material does not fit, keep it but mark the least essential work `recommended` or `optional`, and say so in the overview.
- Sessions: every task is one sitting of 20 to 90 minutes. Split longer work into tasks ("Part 1 of 3") chained with `dependsOn`. Expand every day or week of a source plan into concrete tasks; never one task for a whole week.
- Realistic minutes for my level: include reading or watching (about 1.5x video length for a beginner, who pauses and rewinds), notes and exercises. Beginner coding problems: easy 30-45, medium 45-75, hard 75-90.
- Fill every task completely. `description` says exactly what to do (which chapter, which video section, which exercises). Lessons get 2-4 `objectives`, `keyConcepts`, 2-4 `verificationQuestions`, `topics` and at least one resource. Add `tradeoffs` wherever the topic involves real choices. Every resource gets `minutes`.
- One problem per practice task, in `practice`, and it `dependsOn` the lesson that teaches it. Use a LeetCode slug only if you are sure it is the official one; otherwise omit `practice` and name the problem in `description`.
- Priority: `core` for what the goal needs, `recommended` for useful but skippable work, `optional` for extra depth. Kiln drops optional work first, then recommended, when time runs short. A task may only depend on tasks of the same or higher priority.
- URLs: include `url` only when you are confident the page exists at that address. Otherwise omit `url` and give the title, author or channel, and `section` so I can find it. Never invent a link.
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
