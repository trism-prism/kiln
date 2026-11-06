# Kiln progress

Resume: read this file, then continue from "Next exact step".

Plan: docs/plan.md.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Repo + setup | done (bb8ed9e) |
| 2 | Plan format + prompts | done (09cc8d0) |
| 3 | Data layer | done (merged, fe3b485) |
| 4 | Scheduler + LC ramp | done (merged, b2d0f47) |
| 5 | Mastery | done (merged, 61e3051) |
| 6 | Design system + shell | done (PR pending); design self-approved overnight per the user's instruction; user reviews docs/design in the morning |
| 7 | Core screens | pending |
| 8 | Calendar + streaks | pending |
| 9 | Import + create | pending |
| 10 | PWA | pending |
| 11 | Worker: push + analytics | server half done on feat/worker-push (SW push handler and UI pending in the PWA stage) |
| 12 | Sync | pending |
| 13 | Production | pending |

## Current branch
`feat/design-shell` (stage 6, PR pending). Stages 3, 4 and 5 merged (fe3b485, b2d0f47, 61e3051).

## Next exact step
Stage 7: core screens (`feat/core-screens`). Start from docs/design/README.md (tokens, components, how to use the shell). Wire `src/app/useTodoCount.ts` to `src/domain/badge` + `src/data`, then build To Do (Today / 7 / 28, plus past 7 / 28), task page, dashboard cards, plan/modules page, brush-up and the rating sheet on the existing routes.

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
