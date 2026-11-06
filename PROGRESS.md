# Kiln progress

Resume: read this file, then continue from "Next exact step".

Plan: docs/plan.md.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Repo + setup | done (bb8ed9e) |
| 2 | Plan format + prompts | done (09cc8d0) |
| 3 | Data layer | done (PR pending) |
| 4 | Scheduler + LC ramp | pending |
| 5 | Mastery | pending |
| 6 | Design system + shell | pending |
| 7 | Core screens | pending |
| 8 | Calendar + streaks | pending |
| 9 | Import + create | pending |
| 10 | PWA | pending |
| 11 | Worker: push + analytics | pending |
| 12 | Sync | pending |
| 13 | Production | pending |

## Current branch
`feat/data-layer` (stage 3, PR pending). Stage 2 merged from `feat/plan-format` (PR 2, 09cc8d0).

## Next exact step
Stage 4: scheduler + LC ramp (`feat/scheduler`).

## Open questions
- Domain name (user buys, ~$10-12/yr).
- DSA dev fixture uses `dailyPractice.source: "plan"` (59 plan problems only); switch to `neetcode` top-ups?

## User-only actions
- Create the Cloudflare account and run `wrangler login`.
- Buy the domain.
- Regenerate the DSA and System Design plans in Gemini using Kiln's prompt (stage 2 checkpoint).
- iPhone install test: push and badge while the device is asleep (stage 13 checkpoint).

## Authorizations
- 2026-11-05: "Private, you may merge when CI is green" (trism-dev/kiln, merge stage PRs once CI passes; no force-push, no deploys).
