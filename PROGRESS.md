# Kiln progress

Resume: read this file, then continue from "Next exact step".

Plan: docs/plan.md.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Repo + setup | done (bb8ed9e) |
| 2 | Plan format + prompts | done (09cc8d0) |
| 3 | Data layer | done (merged) |
| 4 | Scheduler + LC ramp | done (merged, b2d0f47) |
| 5 | Mastery | done (PR pending) |
| 6 | Design system + shell | pending |
| 7 | Core screens | pending |
| 8 | Calendar + streaks | pending |
| 9 | Import + create | pending |
| 10 | PWA | pending |
| 11 | Worker: push + analytics | pending |
| 12 | Sync | pending |
| 13 | Production | pending |

## Current branch
`feat/scheduler` (stage 4, PR pending). Stage 3 merged; stage 2 merged from `feat/plan-format` (PR 2, 09cc8d0).

## Next exact step
Stage 5: mastery (`feat/mastery`): ts-fsrs wrapper, rating to review tasks, mastery % per topic, brush-up query. It supplies `reviewsDue` to `scheduleAll` and should persist generated daily problems if the UI needs them stable.

## Open questions
- Domain name (user buys, ~$10-12/yr).
- DSA dev fixture uses `dailyPractice.source: "plan"` (59 plan problems only); switch to `neetcode` top-ups?

## User-only actions
- Create the Cloudflare account and run `wrangler login`.
- Buy the domain.
- Regenerate the DSA and System Design plans in Gemini using Kiln's prompt (stage 2 checkpoint).
- iPhone install test: push and badge while the device is asleep (stage 13 checkpoint).

## Authorizations
- 2026-11-05: "Private, you may merge when CI is green" (trism-prism/kiln, merge stage PRs once CI passes; no force-push, no deploys).
