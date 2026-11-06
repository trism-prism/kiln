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
| 13 | Production | blocked on user actions below |

Also merged: e46556f (local writes stamp a strictly increasing updatedAt).

## Current branch
main (9664462). No open PRs.

## Next exact step
Stage 13 (production) after the user: (1) reviews the design screenshots in docs/design and the app locally (`npm run dev`, dashboard "Load sample plans" in dev); (2) creates the Cloudflare account and runs `wrangler login`; (3) buys the domain; (4) grants deploys for this project. Then: `wrangler d1 create`, set database_id in worker/wrangler.toml, `wrangler d1 migrations apply --remote`, `npm --prefix worker run vapid`, secrets `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`, `ALLOWED_ORIGINS` = production origin, rate-limit rules for /push/*, /sync/*, /ping (worker/README.md), deploy the Worker, then Cloudflare Pages with `VITE_API_URL` and `VITE_VAPID_PUBLIC_KEY` (never `VITE_E2E`), Web Analytics snippet in index.html, privacy page check, Lighthouse + axe on the live site, e2e against the deployment, then the iPhone install test.

## Known follow-ups
- CI takes about 16 minutes (Playwright grew to ~92 specs); shard e2e or split jobs if it slows merges.
- A To Do keyboard-tabs e2e flaked once overnight (passed on rerun); watch it.
- Cross-part validation does not flag a module notBeforeDay that goes down across parts (DSA part 3 module 9 at day 78 after part 2 module 8 at day 92). Harmless with dependencies.
- Inline theme script in index.html needs a CSP hash if a strict Content-Security-Policy is added.
- Brush-up "Review now" has no double-press guard (the sheet opens first).

## Open questions
- Domain name (user buys, ~$10-12/yr).

## User-only actions
- Review docs/design screenshots and the running app.
- Create the Cloudflare account and run `wrangler login`.
- Buy the domain.
- Grant deploys (merges are already granted).
- iPhone install test: push and badge while the device is asleep (stage 13 checkpoint).

## Authorizations
See Vault\Authorizations\kiln.md. 2026-11-05: "Private, you may merge when CI is green"; overnight: "you have full authorization, merge when CI is green, like we agreed, keep to the plan". No deploys.
