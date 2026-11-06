# Kiln design system

## Direction: warm kiln

Kiln is a study-plan tracker for one person working through DSA and system design a few hours a day. It should feel steady, warm and unhurried, like a pottery studio rather than a productivity dashboard. Surfaces are warm off-white in light mode and charcoal in dark mode; the only strong color is a fired-clay accent (terracotta in light, ember in dark), used for the primary action, the current page and plan progress. Overdue work and the To Do badge use a cooler crimson so they never read as the brand color. The mark is the arched mouth of a kiln; it heads the logo and every empty state, and nowhere else.

The layout follows a familiar course-site pattern: left nav rail with a red count on To Do, dashboard of plan cards, day-grouped To Do list, plan modules page and an assignment-style task page.

## Screenshots

| Page | Desktop 1280x800 | Phone 390x844 |
|---|---|---|
| Dashboard | [light](dashboard-desktop-light.png), [dark](dashboard-desktop-dark.png) | [light](dashboard-phone-light.png), [dark](dashboard-phone-dark.png) |
| To Do | [light](todo-desktop-light.png), [dark](todo-desktop-dark.png) | [light](todo-phone-light.png), [dark](todo-phone-dark.png) |
| Design system (full page) | [light](design-desktop-light.png), [dark](design-desktop-dark.png) | [light](design-phone-light.png), [dark](design-phone-dark.png) |

The /design page shows every token and component twice, light and dark side by side, whatever the system theme. Regenerate with `SCREENSHOTS=1 npx playwright test screenshots`.

## Tokens

Source of truth: `src/index.css`. Each color is `light-dark(<light>, <dark>)` on `--kiln-*`, exposed to Tailwind as `bg-surface`, `text-text-muted`, `border-border-strong` and so on (the default Tailwind palette is switched off). `src/styles/contrast.test.ts` reads the file and checks every pair below.

| Token | Light | Dark | Use | Checked |
|---|---|---|---|---|
| surface | #f7f4ee | #161513 | Page background | |
| surface-raised | #fdfbf7 | #1e1c19 | Cards, nav rail, inputs | |
| surface-muted | #efe9df | #2a2723 | Hover, selected nav row, tracks, tags | |
| border | #e2dbcf | #34302b | Hairlines (decorative) | |
| border-strong | #8c8377 | #7d7569 | Control outlines | 3:1 on all surfaces |
| text | #1f1b16 | #efe9de | Primary text | 4.5:1 on all surfaces |
| text-muted | #665d52 | #a69e92 | Secondary text, icons | 4.5:1 on all surfaces |
| accent | #a8481c | #e58a5c | Primary button, current page, progress, links | 4.5:1 on all surfaces |
| accent-contrast | #fffaf5 | #1c0f08 | Text on accent | 4.5:1 on accent |
| danger | #b3202f | #f2737c | Overdue, To Do badge, errors | 4.5:1 on all surfaces |
| danger-contrast | #fffafa | #1f0a0c | Text on danger | 4.5:1 on danger |
| success | #3d6b2c | #8cc276 | Mastery, done | 4.5:1 on all surfaces |
| warning | #85570a | #e2b45a | Due soon | 4.5:1 on all surfaces |
| focus | #a8481c | #e58a5c | Focus ring | 3:1 on all surfaces |

Other tokens:
- Type: Instrument Sans (variable, self-hosted through `@fontsource-variable/instrument-sans`, no CDN). Tailwind's default sizes; page title `text-xl`, body and controls `text-sm`, counts `text-xs`. Weights 400 and 500, 600 only for the wordmark and the count badge. Numbers use `tabular-nums`.
- Spacing: Tailwind's 4px scale. Nav rows 36px, controls 40px, cards padded 20px, page edges 16px on phones and 32px from md.
- Radius: `sm` 6 (tags, checkbox), `md` 8 (buttons, inputs, rows), `lg` 12 (cards, popovers), `xl` 16 (sheets).
- Shadow: `shadow-sm` for cards, `shadow-lg` for popovers, sheets and toasts. Dark mode uses deeper, nearly invisible shadows; depth comes from surface steps.
- Motion: one curve, `--ease-out` cubic-bezier(0.22, 1, 0.36, 1); 150ms hover and press, 200ms popovers, 320ms sheets. Only entrances animate (`animate-rise`, `animate-sheet`, `animate-fade`). `prefers-reduced-motion` turns all of it off.
- Icons: lucide-react only, 18px, stroke 1.75, set once by `LucideProvider` in `App.tsx`.

## Components

All in `src/ui/`, built on react-aria-components:

- `button.tsx`: `Button` (primary, secondary, quiet, danger), `IconButton` (label required), `Link` (inline text link, or button-styled with `variant`)
- `surface.tsx`: `Card`, `Badge` (status tag with tone), `CountBadge` + `badgeLabel` (red count, 99+ cap), `ProgressBar` (plan progress), `Meter` (mastery), `Skeleton`, `EmptyState`, `KilnMark`
- `form.tsx`: `Checkbox` (task completion), `TextField`, `Select`, `ListBox` + `ListBoxItem`, `Switch`
- `tabs.tsx`: `Tabs`, `TabList`, `Tab`, `TabPanel`, drawn as a segmented control (Today / 7 days / 28 days)
- `overlay.tsx`: `Sheet` (bottom sheet on phones, centered dialog from md; for the rating sheet), `Menu` + `MenuItem`, `ToastRegion` + `toasts` queue

## What to look at

- The To Do badge in the rail and the phone tab bar (count is a stub of 3 until stage 7, which is why the empty To Do page and the badge disagree).
- Whether the terracotta accent and the crimson overdue red read as different things.
- Dark mode: charcoal surfaces and the ember accent on the primary button.
- The phone tab bar: Dashboard, To Do, Calendar, Plans, More (Brush up, Import, Settings).
- Empty-state copy on each page.
- Theme switch under Settings (System, Light, Dark).

## Using the shell

Each route is a lazily loaded file in `src/app/pages/` that renders `<Page title actions>`; register it with `lazy()` in `src/app/App.tsx`. `Page` sets the document title, draws the top bar and moves focus to its heading on navigation. The phone More menu and the toast region load lazily too, which keeps the first chunk at about 267 kB (85 kB gzipped).

## Accessibility baseline

Skip link, `nav` and `main` landmarks, focus moves to the page heading after each in-app navigation (not on first load), `lang="en"`, a document title per route (`To Do · Kiln`), visible focus rings in the accent, keyboard navigation through the rail (Tab) and tabs (arrow keys), reduced motion. Playwright runs axe on /, /todo and /design in light and dark and fails on any serious or critical violation.
