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
| 6 | Design system + shell | done (PR pending, branch `feat/design-shell`); design self-approved overnight per the user's instruction; user reviews docs/design in the morning |
| 7 | Core screens | done (PR pending) |
| 8 | Calendar + streaks | done (PR pending, branch `feat/calendar`) |
| 9 | Import + create | done (merged, fd495ec) |
| 10 | PWA | done (PR pending, branch `feat/pwa`): manifest, icons, service worker (offline, update prompt, push handler), badge, reminders, sync UI, ping, privacy page, install prompt, onboarding |
| 11 | Worker: push + analytics | server merged (b651130); SW push handler and client done in stage 10 |
| 12 | Sync | non-UI done (merged, ef075a5); Settings > Sync UI and automatic sync done in stage 10 |
| 13 | Production | pending |

## Current branch
`feat/calendar` (stage 8, PR pending), off main 227da20. Earlier: `feat/core-screens` (stage 7, PR pending), built on stage 6 (`feat/design-shell`, PR pending). Stages 3, 4 and 5 merged (fe3b485, b2d0f47, 61e3051).

## Next exact step
Stage 10 (PWA, `feat/pwa`) includes Settings > Sync UI. After it merges: production (stage 13).

Stage 8 notes: `/calendar` (month and week, Monday start from settings, drag to reschedule, day panel with "Move to..."), streaks in `src/domain/streaks`, month and week math in `src/domain/calendar`, streak chip on the dashboard. Moving a daily problem changes its date only; a later Reschedule may regenerate it (it is not pinned).

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
