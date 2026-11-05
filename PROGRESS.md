# Kiln progress

Resume: read this file, then continue from "Next exact step".

Plan: docs/plan.md.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Repo + setup | done (bb8ed9e) |
| 2 | Plan format + prompts | pending |
| 3 | Data layer | pending |
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
main. Stage 1 merged from `feat/scaffold` (PR 1, bb8ed9e).

## Next exact step
Start stage 2: plan format + prompts.

## Open questions
- Domain name (user buys, ~$10-12/yr).

## User-only actions
- Create the Cloudflare account and run `wrangler login`.
- Buy the domain.
- Regenerate the DSA and System Design plans in Gemini using Kiln's prompt (stage 2 checkpoint).
- iPhone install test: push and badge while the device is asleep (stage 13 checkpoint).

## Authorizations
- 2026-11-05: "Private, you may merge when CI is green" (trism-dev/kiln, merge stage PRs once CI passes; no force-push, no deploys).
