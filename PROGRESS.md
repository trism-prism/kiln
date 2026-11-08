# Kiln progress

Resume: read this file, then continue from "Next exact step".

Plan: docs/plan.md.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Repo + setup | done (bb8ed9e) |
| 2 | Plan format + prompts | done (09cc8d0) |
| 3 | Data layer | done (fe3b485) |
| 4 | Scheduler + LC ramp | done (b2d0f47) |
| 5 | Mastery | done (61e3051) |
| 6 | Design system + shell | done (dd5b2b6); design self-approved overnight per the user's instruction, user to review docs/design |
| 7 | Core screens | done (227da20) |
| 8 | Calendar + streaks | done (6ee70dc) |
| 9 | Import + create | done (fd495ec) |
| 10 | PWA | done (9664462): manifest, icons, service worker (offline, update prompt, push handler), badge, reminders, sync UI, ping, privacy page, install prompt, onboarding |
| 11 | Worker: push + analytics | done locally: server (b651130), client and push handler in stage 10. Not deployed |
| 12 | Sync | done locally: engine + Worker routes (ef075a5), UI in stage 10. Not deployed |
| 13 | Production | paused by the user until they re-review the app after the UX overhaul. D1 `kiln` created; domain kilnstudy.com; worktree `kiln-wt/deploy` (chore/production-config) |

Also merged: e46556f (local writes stamp a strictly increasing updatedAt).

## UX overhaul (plan: Vault\Plans\kiln-ux-overhaul.md)
| Workstream | Status |
|---|---|
| Wording, toasts, copy buttons, settings footer, Terms | done (#16) |
| Onboarding presets, weekday minutes table, typed reminder time | done (#18) |
| GitHub-style heatmap | done (#15) |
| Data model v4 (personal to-dos, events, versions, feeds, share) | done (#17) |
| To-do list preferences, personal to-dos, events | done (#19) |
| LMS calendar import (.ics + keep in sync via Worker /feed/fetch) | done (#21) |
| Quick add builder (any subject) | done (#20) |
| Plan editing, version history, restore | done (#23) |
| LeetCode as opt-in add-on, resource links, prompts | done (#22) |

Decisions taken during the unattended run (user to confirm on review):
- /feed/fetch has no LMS host allowlist (schools use custom domains); it fetches any public https .ics with a VCALENDAR body, bounded by size/time caps and a per-IP (IPv6 /64) rate limit.
- Backups omit calendar feed links; a restored feed asks for the link again.
- Course plan keys for non-plain course codes carry a short hash suffix.
- Quick add: due dates in the past are cleared with a warning; changed lines drop their table edits with a notice. Identical lines keep edits by order, not identity: removing one of them leaves the first copies' edits on the remaining lines and drops the last copy's.
- Plan editor refuses a save if another device changed editable content meanwhile ("Reopen the editor"); progress changes never block. Restore deliberately reverts content, progress kept.
- Streaks keep counting finished practice problems after a plan turns daily practice off.
- Onboarding does not show expected finish per preset (onboarding only appears with zero plans).

## Current branch
main (b41a903). Open: wrap-up PR (design screenshots, DSA import e2e flake).

## Next exact step
User reviews the app (session-folder `.claude/launch.json` "kiln-dev", dashboard "Load sample plans" in dev) and docs/design. Then stage 13 (production), already granted, resumes: `wrangler d1 create`, set database_id in worker/wrangler.toml, `wrangler d1 migrations apply --remote`, `npm --prefix worker run vapid`, secrets `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`, `ALLOWED_ORIGINS` = production origin, rate-limit rules for /push/*, /sync/*, /ping (worker/README.md), deploy the Worker, then Cloudflare Pages with `VITE_API_URL` and `VITE_VAPID_PUBLIC_KEY` (never `VITE_E2E`), Web Analytics snippet in index.html, privacy page check, Lighthouse + axe on the live site, e2e against the deployment, then the iPhone install test.

## Known follow-ups
- Local `npm test` sync e2e tests time out at 5 s when the machine is loaded by parallel runs (pass alone and in CI).
- CI takes about 16 minutes (Playwright grew to ~92 specs); shard e2e or split jobs if it slows merges.
- A To Do keyboard-tabs e2e flaked once overnight (passed on rerun); watch it.
- Cross-part validation does not flag a module notBeforeDay that goes down across parts (DSA part 3 module 9 at day 78 after part 2 module 8 at day 92). Harmless with dependencies.
- Inline theme script in index.html needs a CSP hash if a strict Content-Security-Policy is added.
- Brush-up "Review now" has no double-press guard (the sheet opens first).

## Open questions
- Confirm the decisions listed under "UX overhaul" (taken unattended).

## User-only actions
- Review the running app and docs/design screenshots after the UX overhaul.
- Set the VAPID private key via the script (stage 13).
- Rate-limit rules and Web Analytics in the Cloudflare dashboard (token lacks those scopes).
- iPhone install test: push and badge while the device is asleep (stage 13 checkpoint).

## Authorizations
See Vault\Authorizations\kiln.md: merge on green CI; deploy granted 2026-11-06 ("You may deploy Kiln.") but paused by the user until they re-review the app.
