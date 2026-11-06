# Kiln: study-plan tracker (Canvas-style to-do, spaced mastery, daily LeetCode ramp)

## Context
Tristan is a full-time student and intern who wants to go from novice to interview-ready in DSA and System Design with a few hours a day, and currently does zero LeetCode. Kiln turns any study plan into a scheduled, Canvas-style to-do list with a badge count, reminders, mastery reviews and one LeetCode problem a day. Difficulty ramps with his level. Free to run, private repo for now. It will later be published publicly (resume: "deployed app, N weekly active devices") and wrapped for the app stores.

Source material: a 16-week DSA study-plan doc (day topics + ~60 LC problems) and a system design study plan. The SD plan is being replaced by a new, less compressed one. Both plans will be regenerated in Gemini using Kiln's own prompt. The current DSA doc is converted only as dev test data.

## Decisions (from grilling, 2026-11-05)
| Area | Decision |
|---|---|
| Platform | Installable PWA first (phone + desktop). App stores via Capacitor later, not v1 |
| Storage | Local-first IndexedDB; works fully with no account |
| Sync | Optional. "Sync key" (random 256-bit key as QR / word phrase), end-to-end encrypted, Cloudflare D1. No email, no registration |
| Reminders | Anonymous Web Push from a Cloudflare Worker cron (runs in Cloudflare's cloud, so the device can sleep). The server knows only the push subscription, reminder time and timezone. The service worker computes the task count locally and sets the badge |
| Budget | Free tiers + ~$10-12/yr domain |
| Time budget | Minutes per weekday, set by the user |
| Scheduling | App assigns dates by priority and capacity. Dates stay fixed once assigned; missed tasks go overdue (red). "Reschedule" fits overdue items into the next days with spare capacity. Optional pinned fixed dates per task |
| Plan format | Markdown (human-readable only) + one fenced JSON block (the machine data, validated by schema with path-level errors) |
| LLM prompts | Two copy-to-clipboard prompts: (a) app-assigns-dates, no dates written; (b) fixed-dates, where the LLM must ask the user for their dates before outputting. Non-LLM equivalents: manual builder + per-item date pinning |
| Import | Paste box + "Paste from clipboard" (primary, mobile-friendly), file picker (.md/.json/.csv/.xlsx). CSV/XLSX uses a fixed-column template |
| Mastery | Rate on completion (Again/Hard/Good/Easy). FSRS (ts-fsrs, MIT) generates review tasks for lessons and LC re-solves. "Brush up" list; mastery % per topic |
| LeetCode | Python. 1/day from day 1, topic-matched, difficulty ramps. Manual check-off + link to the problem. Problem bank from NeetCode's MIT `.problemSiteData.json` (titles/slugs only, no problem text) |
| Design | Canvas information architecture (left nav rail with To Do red badge, dashboard plan cards, day-grouped planner list, modules page, assignment-style task page). Own brand, no Canvas name/logo (registered trademark). Tailwind + React Aria Components. /unslop at the design stage |
| v1 screens | To Do (Today / next 7 / next 28 / past 7 / past 28), task page (completed = greyed but fully openable), dashboard cards + progress, plan/modules page, calendar month/week with drag-to-reschedule, streak heatmap, brush-up list, import/create, settings |
| Analytics | Cloudflare Web Analytics (cookieless) + anonymous daily active-device ping. Privacy page |
| Name / repo | Kiln, `github.com/trism-prism/kiln`, PRIVATE |
| Merges | User grant: "Private, you may merge when CI is green" |
| Execution | One Workflow per stage (implement, test, review), PR, merge on green CI, update PROGRESS.md, then stop for the user's review |
| Timeline | No rush: full v1, then use |

Defaults chosen without asking (changeable): reminder 08:00 local + optional 20:00 nudge if tasks remain; theme follows system; per-plan priority weight (1-5); week starts Monday; reviews capped at 25% of a day's budget; local timezone throughout.

Not in v1 (logged as later): Capacitor store build, per-task notes and time log, LeetCode auto-detect, Android share target, import from URL, bring-your-own AI key.

## Architecture
- **Web app**: React 19 + Vite + TypeScript, React Router, Tailwind v4, React Aria Components, `vite-plugin-pwa` (Workbox). Hosted on Cloudflare Pages.
- **Data**: Dexie (IndexedDB) + `dexie-react-hooks` live queries. Every record has a UUIDv7 `id`, `updatedAt`, `deleted` (tombstone) and `deviceId`. This is what lets sync be added later without a restructure. Versioned Dexie migrations. JSON backup export/import.
- **Domain modules** (pure TS, no React, unit-tested): `plan-format` (Zod schema; JSON Schema exported for prompts and docs), `import` (extract the JSON block from any pasted text, validate, map CSV/XLSX), `scheduler`, `practice` (LC ramp), `mastery` (ts-fsrs wrapper), `badge` (count = today's open + overdue).
- **Worker** (`/worker`, Cloudflare Workers + D1, plain fetch handler, no framework): `POST/DELETE /push/subscription`, cron every 15 min sends VAPID Web Push to subscriptions due now, `POST /ping` (active devices), `/sync/push` + `/sync/pull` (ciphertext blobs keyed by hash of the sync key; cursor-based). The server never sees plaintext.
- **Push flow**: cron sends a payload-less or generic push. The SW `push` handler reads IndexedDB, builds "3 tasks today (1 overdue)", shows the notification and calls `setAppBadge`. The app also updates the badge on open and on every completion.
- **Sync**: per-record last-write-wins on `updatedAt` with tombstones. AES-GCM via WebCrypto, keys derived from the sync key with HKDF. One derived token gates both reading and writing a space: every holder of the key is trusted. Ties on `updatedAt` are settled by the server (first stored wins). See `src/sync/README.md`. QR shown via a small QR lib; join by scanning or typing the phrase.

### Plan JSON (core fields)
`schemaVersion, title, description, goal, level, schedulingMode ('auto'|'fixed'), sources[], modules[]{id,title,order,summary}, tasks[]{id, moduleId, order, title, type (lesson|practice|review|project|milestone), estimatedMinutes, priority, topics[], description, objectives[], keyConcepts[], tradeoffs[], verificationQuestions[], resources[]{title,url,kind,minutes}, practice?{provider:'leetcode',slug,difficulty}, dependsOn[], notBeforeDay?, fixedDate?, deadline?}, dailyPractice?{pool:'neetcode'|'plan', perDay, startDifficulty, ramp}`. Topic and source study time are derived from task and resource minutes.

### Scheduler (pure function, deterministic)
Input: plans, tasks, per-weekday capacity, start date, blackout dates, completion and review state. Day by day: (1) pinned/fixed-date tasks; (2) FSRS reviews due, up to the cap; (3) the daily practice slot; (4) ready tasks (deps done, `notBeforeDay` reached) in plan order, interleaved across plans by priority weight; overflow goes to the next day. Deadline violations are reported, not hidden. Runs on import and on explicit Reschedule only (dates are otherwise stable). The LC ramp starts at Easy; it moves to Medium after 5 Easy problems rated Good/Easy (≥2 in the current topic), and adds Hard only after 10 Mediums or in the plan's final 2 weeks. The topic follows the most recent lesson; problems the plan names explicitly come first.

## Stages
Every stage: read `PROGRESS.md` → feature branch `feat/<slug>` → implement → unit and e2e tests → review the diff → fix → PR → merge on green CI → update `PROGRESS.md` → stop for the user's review.

| # | Stage | Delivers |
|---|---|---|
| 1 | Repo + setup | Check kiln domain options (user buys); `gh repo create trism-prism/kiln --private`; Vite/TS/Tailwind/Vitest/Playwright/ESLint scaffold; GitHub Actions CI; `PROGRESS.md`; `docs/plan.md` (this file) |
| 2 | Plan format + prompts | Zod schema, JSON Schema, `docs/plan-format.md`, both LLM prompts, block extractor + validator with path errors, CSV/XLSX template, DSA doc → fixture. **User checkpoint: regenerate DSA + new SD plans in Gemini** |
| 3 | Data layer | Dexie schema, sync-ready record shape, migrations, backup export/import |
| 4 | Scheduler + LC ramp | `scheduler`, `practice`, NeetCode pool snapshot; table-driven tests (capacity, deps, fixed dates, overflow, reschedule, deadlines, ramp) |
| 5 | Mastery | ts-fsrs wrapper, rating → review tasks, mastery % per topic, brush-up query |
| 6 | Design system + shell | /unslop pass, Kiln brand + tokens (light/dark), nav rail with To Do badge, layouts, a11y baseline. **User checkpoint: design approval** |
| 7 | Core screens | To Do views (±1/7/28), task page (greyed done), dashboard cards, plan/modules page, brush-up, rating sheet |
| 8 | Calendar + streaks | Month/week calendar, drag reschedule (React Aria DnD), heatmap + streak |
| 9 | Import + create | Paste/clipboard/file, preview + validation report + schedule preview, manual builder with date pinning, copy-prompt buttons (2) |
| 10 | PWA | Manifest, SW, offline, install prompt, Badging API, onboarding (budget, start date, reminder time, load plan) |
| 11 | Worker: push + analytics | D1 schema, VAPID push (verify a Workers-compatible Web Push lib; else WebCrypto VAPID), 15-min cron, SW push handler, ping, Web Analytics |
| 12 | Sync | Sync key/QR, E2E crypto, push/pull, LWW + tombstones, multi-device conflict tests |
| 13 | Production | Pages + Worker deploy, domain, privacy page, Lighthouse + axe audit, e2e against the real deployment. **User checkpoint: install on iPhone, confirm push + badge while asleep** |

User-only actions: create the Cloudflare account + `wrangler login`; buy the domain; regenerate plans in Gemini; the phone install test.

## Verification
- Unit: Vitest on plan-format, import, scheduler, practice ramp, mastery, sync merge (CI-gated).
- E2E: Playwright on import → schedule → complete → grey-out → rate → review appears → badge count; calendar drag; offline reload.
- Real deployment: Worker cron delivers a push to an installed iPhone PWA with the app closed and the device locked; the badge updates; sync between phone and laptop via QR; export/import round trip.
- Accessibility: axe in Playwright, keyboard-only pass, contrast AA in both themes.
