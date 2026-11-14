# Design Read-Back: login-gate-claim

Approved by developer on 2026-11-14.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Generate**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/login-gate-claim/`:
  - `1-generate-anonymous.jsx`, `3-login-gate-sheet.jsx`, `5-owned-project.jsx` (screens)
  - `2-4-6-states.jsx` (state panel; its annotation text is normative)
  - `7a-generate-360-check.jsx`, `7b-login-gate-360-check.jsx`, `7c-owned-project-360-check.jsx`
  - `overview.png`
- Images are placeholders (`kitchen-sample.jpg`); the real page shows the draft's server thumbnails. Designs are English only; all 11 locales come from `apps/web/messages/<locale>.json`.
- The owned page's logo is the approved SVG wordmark (`docs/design/brand-logo-animation.md`); in the JSX it is an empty `Logo` frame. Where silent, the Capture, Moodboard, homeowner-password-login and brand read-backs and DESIGN.md govern. Implement strictly from this artifact and the JSX files.
- Product decisions: spec `docs/specs/login-gate-claim.md`, OQ-1..OQ-10 all answered with the recommended option on 2026-11-14.

## Frame 1 · Generate, anonymous, ready (`/kitchen-projects/new/generate`)

Background `#FAFAF8`; Header, Content (scrolls under the sticky bar), BottomActionBar (sticky).

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Header | as Capture/Moodboard: back button 44 circle `surfaceMuted` `lucide:arrow-left` 20 + HeaderActions (selector + account entry; compact selector < 375 px) | back name `Back to your style` → Moodboard |
| Content | column, gap 24, pt 8, px 16, pb 24 | — |
| StepIndicator | label 14/20 semibold `textMuted`; 3 segments h 4, gap 4, all `primary` | `Step 3 of 3` (Capture and Moodboard become `Step 1 of 3` / `Step 2 of 3`) |
| Title | 28/34 bold `text` | `Ready to design` |
| Helper | 16/24 `textMuted` | `Check your kitchen and choose what to create. We'll ask you to sign in so your project is saved.` |
| SummaryCard | column gap 16, p 16, `surface`, radius 20, `elevation.card` | — |
| Section header | row space-between: title 16/24 semibold `text` + Edit link (44 tall, px 8, 14/20 semibold underlined `primary`) | `Your kitchen` + `Edit` → Capture; `Your style` + `Edit` → Moodboard |
| Thumb strip | row gap 8, 3 equal cells h 60 radius 12: first 2 thumbnails (`object-fit: cover`, decorative `alt=""`) + a `surfaceMuted` "more" cell 14/20 semibold `textMuted` | `+{count}` when there are more than 2; with ≤ 2 items the remaining cells are omitted (cells keep 1/3 width) |
| Measurements row | row gap 8: `lucide:ruler` 16 `textMuted` + 14/20 `text` | `{length} × {width} m · height {height} m` (locale-formatted, 2 decimals; cm unit shows cm) |
| Divider | 1 px `border` | — |
| Moodboard count | 14/20 `textMuted` | `{count, plural, one {# item} other {# items}} in your moodboard` |
| BottomActionBar | column gap 12, pt 12, px 16, pb 24 + safe area, `surface`, `elevation.sheet` | — |
| Primary CTA | h 52 pill `primary`, `lucide:sparkles` 20 white + 16/24 semibold white | `Generate my kitchen` — anonymous: opens the Login Gate (intent `render`); signed in: claims (frame 4) |
| Secondary CTA | h 52 pill `surface` + 1 px `border`, `lucide:receipt-text` 20 `primary` + 16/24 semibold `primary` | `Get my budget` — same, intent `budget` |

## Frame 3 · Login Gate (bottom sheet)

Overlay `#18223166` over the page; sheet = language/account sheet pattern: column gap 16, pt 8, px 16, pb 24 + safe area, `surface`, radius 20 (top), `elevation.sheet`; `role="dialog"`, `aria-labelledby` the title, focus trapped, Escape/overlay/Close dismiss.

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Header | row h 52 space-between: title 18/24 semibold + Close 44 circle `surfaceMuted` `lucide:x` 20 | `Sign in to continue`; Close name `Close` |
| Reassurance | row gap 12: 44 circle `secondary` with `lucide:shield-check` 22 `primary` + 16/24 `text` | `Generating designs and budgets needs a free account. Your photos, measurements and moodboard are saved to it.` |
| Primary button | h 52 pill `primary`, 16/24 semibold white | `Sign in` → `/auth/login?returnTo=/kitchen-projects/new/generate?intent=<render|budget>` |
| Secondary button | h 52 pill `surface` + `border`, label `primary` | `Create account` → same with `mode=register` |
| Footnote | 14/20 `textMuted` centered | `New accounts confirm their email with a 6-digit code.` |

## Frame 5 · Owned Kitchen Project (`/kitchen-projects/<id>`)

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Header | as Home signed in: logo link (wordmark 140×22 centered in a 140×44 hit area, to `/`) + HeaderActions with the signed-in AccountEntry (initial) | — |
| Success alert | Capture alert component, `success` stroke, `lucide:circle-check` 20; `role="status"`; only with `?claimed=1`, dismissible | `Your kitchen is saved to your account.` |
| Title / Helper | 28/34 bold / 16/24 `textMuted` | `Your kitchen project` / `Designs and budgets are coming soon. Your project stays here, ready for them.` |
| SummaryCard | as frame 1 but read-only (section titles without Edit links, no moodboard count line) | `Your kitchen`, `Your style` |
| New project link | row h 44 centered: `lucide:plus` 16 + 14/20 semibold underlined `primary` | `Start a new kitchen project` → `/kitchen-projects/new` |
| BottomActionBar | hint 14/20 `textMuted` centered above both CTAs; both disabled (`surfaceMuted`, 1 px `border`, icon + label `textMuted`, `aria-disabled`, `aria-describedby` the hint) | `Available soon`; labels as frame 1 |

## Panel 2 / 4 / 6 · States (normative)

- **2 · Not ready / no draft:** both CTAs disabled; the bottom bar shows a hint + link (44 tall, `lucide:arrow-left` 16 + underlined `primary`) above them. Capture incomplete: `Your kitchen still needs a photo and all three measurements.` + `Go to your kitchen`. Empty moodboard: `Add at least one kitchen or photo to your moodboard.` + `Go to your style`. No draft: `Start your kitchen project first.` + `Start` (→ `/kitchen-projects/new`). The summary card shows `—` for missing parts. Capture hint wins when several are missing.
- **4 · Claiming:** sheet content without Close, `aria-busy`: `lucide:loader` 24 `primary` + 16/24 semibold centered `Saving your kitchen to your account…`. Shown after returning from sign-in with `intent`, or when a signed-in user presses a CTA. On success → `/kitchen-projects/<id>?claimed=1`.
- **6 · Errors** (Capture alert component above the title):
  - Wrong role (Professional/Admin, claim 403): warning, `lucide:circle-alert`: `This account can't save kitchen projects. Sign out and use a homeowner account.` + secondary `Sign out` (h 44). The draft stays anonymous.
  - Claim failed: danger: `We couldn't save your kitchen to your account. Your draft is safe; try again.` + secondary `Try again` (`lucide:refresh-cw` 16, h 44).
  - Offline: same danger alert with `You're offline. Your draft is safe; reconnect to save it to your account.`; CTAs disabled.
  - Draft expired: Capture's info alert `Your previous draft expired after 7 days without changes. Start again.` + link `Start`.
  - Owned page, signed out: title `Sign in to see this kitchen project` + primary `Sign in` (returnTo this page).
  - Not found / another account's project: title `We couldn't find this kitchen project` + link `Go to Home`.

## Accessibility and Responsive Notes

- Touch targets ≥ 44 px (back, selector, account, Edit links, Close, logo link, text links); buttons 52 px.
- Checked at 360×780 with the compact selector (`Nederlands`) for frames 1, 3 and 5: header fits (owned page: logo 140 + compact selector + avatar), content scrolls under the sticky bar, no horizontal overflow.
- OpenPencil lint: 0 errors, 0 warnings on page Generate.
- Icons: Lucide via `lucide-react` (`sparkles`, `receipt-text`, `ruler`, `shield-check`, `circle-check`, `plus`, `loader`, `circle-alert`, `refresh-cw`).
