# Importing a plan

How plans get into Kiln: a Markdown file with one JSON block (spec: `docs/plan-format.md`), raw JSON, or a CSV/XLSX sheet with one row per task.

## Flow

1. **Input.** The import screen has a paste box with a "Paste from clipboard" button (the main path on phones) and a file picker for `.md`, `.txt`, `.json`, `.csv` and `.xlsx`. If clipboard access is denied, the box stays focused and the hint says to paste by hand.
2. **Detect.** `.xlsx` files are read as a sheet. `.csv` files, and pasted text whose first line contains the required column headers (comma, semicolon or tab separated, so cells pasted straight from Excel or Google Sheets work), are read as a sheet. Everything else goes through the JSON block extraction in the spec.
3. **Validate.** All errors and warnings are listed at once in the format below. Errors block the import; warnings do not.
4. **Plan details.** Start date (default tomorrow) and an optional deadline for every import. For a sheet, also the plan title (required; the plan id is derived from it and editable) and the goal, since a sheet has no plan-level row.
5. **Match.** A plan `id` that already exists offers Update (keep progress, match tasks by id) or Import as a copy. A file with `part` offers "Add part 2 of 4 to <plan>".
6. **Preview.** Module and task counts, total hours, hours by priority, projected finish date from the current budget, deadline status, and the first 14 days of the schedule.
7. **Import.** Records are saved and the scheduler runs.

## Error format

```
<location> "<label>": <message>
```

```
tasks[13] "Two Sum": estimatedMinutes is required
row 15 "Two Sum": estimatedMinutes is required
row 15 "Two Sum": resources item 2: kind must be one of: video, article, book, course, docs, tool, visualizer, problem, other
warning: row 9 "Edit Distance": estimatedMinutes is 120; split work over 90 minutes into sessions
```

JSON locations are 0-based paths (`tasks[13]`, `tasks[13].resources[2]`, `plan` for the top level). Sheet locations are spreadsheet row numbers with the header as row 1, so the number matches what Excel shows. The label is the object's title, cut to 40 characters, and is omitted when there is none. Messages use the JSON field names, which are also the column headers. Full rules: "Validation" in the spec.

## CSV/XLSX template

One row per task. Headers are matched case-insensitively and in any order; unknown columns are a warning and ignored. Templates: `kiln-plan-template.csv` and `kiln-plan-template.xlsx` (header row plus the example rows below), downloadable from the import screen.

### Module columns

Repeated on every row of the module. The first row of a module defines it; later rows may leave these blank, but a different non-blank value is an error.

| Column | Required | Notes |
|---|---|---|
| `moduleId` | yes | |
| `moduleTitle` | on the module's first row | |
| `moduleOrder` | no | Default: order of first appearance in the sheet. |
| `moduleSummary` | no | |
| `moduleNotBeforeDay` | no | Integer plan day. |

### Task columns

| Column | Required | Notes |
|---|---|---|
| `id` | yes | Keep it stable so re-imports keep progress. |
| `order` | no | Default: row order within the module. |
| `title` | yes | |
| `type` | yes | lesson, practice, review, project, milestone, assessment |
| `estimatedMinutes` | yes | Integer. |
| `priority` | no | core (default), recommended, optional |
| `topics` | no | List. |
| `description` | no | Line breaks inside a quoted cell are kept. |
| `objectives`, `keyConcepts`, `tradeoffs`, `verificationQuestions` | no | Lists. |
| `resources` | no | List; each item is `title ; url ; kind ; minutes ; section ; required` (see below). |
| `practiceProvider`, `practiceSlug`, `practiceUrl`, `practiceTitle`, `practiceDifficulty` | no | Fill `practiceProvider` to add a problem. `practiceTitle` defaults to the task title. |
| `dependsOn` | no | List of task ids. |
| `notBeforeDay` | no | Integer plan day. |
| `fixedDate`, `deadline` | no | `yyyy-mm-dd`, or an Excel date cell. Any date in any row makes the plan a fixed-mode plan, and the start date becomes required. |

- **Lists**: items separated by ` | ` (space, bar, space). An item cannot contain ` | `.
- **Resources**: fields inside an item separated by ` ; ` in the fixed order `title ; url ; kind ; minutes ; section ; required`. Trailing fields can be left off, and empty fields are allowed (`Course textbook ;  ; book ; 40 ; Section 8.1`). `required` is `yes` or `no` (default `yes`).
- **Not available in a sheet**: `sources`/`sourceId`, `part`, plan `description`, `subject`, `level`, `audience` and `dailyPractice` (daily practice is set in the plan settings after import). Use the JSON format for those.
- **CSV**: RFC 4180, UTF-8 (a byte-order mark is fine), comma, semicolon or tab delimiter detected from the header row. Quote cells that contain the delimiter, quotes or line breaks.
- **XLSX**: the sheet named `tasks`, or the first sheet. Formula cells use their cached value.

### Example

```csv
moduleId,moduleTitle,moduleOrder,id,title,type,estimatedMinutes,priority,topics,objectives,verificationQuestions,resources,practiceProvider,practiceSlug,practiceDifficulty,dependsOn
arrays,Arrays and hashing,1,hash-map-basics,Hash maps and lookups,lesson,60,core,arrays-hashing,Explain average O(1) lookup | Describe one collision strategy,Why does a high load factor slow lookups?,Hash table introduction ;  ; video ; 35 ; Hash table chapter,,,,
arrays,,,two-sum,Two Sum,practice,40,core,arrays-hashing,,,,leetcode,two-sum,easy,hash-map-basics
arrays,,,contains-duplicate,Contains Duplicate,practice,30,recommended,arrays-hashing,,,,leetcode,contains-duplicate,easy,hash-map-basics
```
