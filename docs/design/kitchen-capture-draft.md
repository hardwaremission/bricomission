# Design Read-Back: kitchen-capture-draft

Approved by developer on 2026-11-14.

> **Updated by `brand-logo-animation` on 2026-11-14 (approved by developer):** colors recolored to the new brand (primary `#2968EC`, text `#182231`, secondary `#E6EEFD`, focus `#2968EC`, overlay `#18223166`; `accent` removed) and the text wordmark replaced by the SVG wordmark logo 140×22. Logo, icons, favicon, email logo and splash: `docs/design/brand-logo-animation.md`. In the JSX exports the logo appears as an empty `Logo (wordmark SVG …)` frame; its artwork comes from the brand read-back.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Capture**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/kitchen-capture-draft/`:
  - `1-capture-empty.jsx`, `2-capture-filled.jsx`, `3-measurement-keypad.jsx`, `4-capture-360-check.jsx` (screens)
  - `5-keypad-states-rules.jsx`, `6-photo-tile-states.jsx`, `7-alerts-save-status.jsx` (state panels; their annotation text is normative)
  - `overview.png`, `measurement-keypad.png`
- Designs are **English only** (developer decision); all 11 locales come from `apps/web/messages/<locale>.json` (parity test).
- Photo thumbnails in the design use the public-domain `infra/ai/samples/kitchen-sample.jpg` (USDA Forest Service, see its `SOURCE.md`); they are illustrative only.
- Implement strictly from this artifact and the JSX files; where silent, DESIGN.md and the approved Home/auth designs (`docs/design/web-pwa-shell.md`, `docs/design/homeowner-password-login.md`) govern.

## Developer decisions taken during the design step (supersede the spec where they differ)

1. **Measurement keypad (new control).** Tapping Length, Width or Height opens a custom numeric keypad in a bottom sheet. The phone's on-screen keyboard must never open for these fields (render them as buttons / read-only inputs with `inputmode="none"`; never focus a text input that would raise the system keyboard).
2. **The keypad is the only validator.** It accepts only digits and one locale decimal separator, enforces the ranges live and commits only valid values. The page fields therefore never hold an invalid value, and **the page has no measurement error state** (the "measurement errors" frame was removed on purpose). Server-side validation (400) still exists as a safety net and surfaces only as the generic "Not saved" save status.
3. **Photo grid:** 2 flexible columns with gap 16 on both axes, tiles with a 4:3 aspect ratio (171x128 at 390 px, 156x117 at 360 px). Never fixed widths.

## Page structure (frames 1, 2, 4)

Background `#FAFAF8`. Header (fixed), Content (scrolls under the sticky bar), BottomActionBar (sticky).

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Header | row, h 64, px 16, space-between | — |
| Back button | 44x44 circle `surfaceMuted`, `lucide:arrow-left` 20 `text` | accessible name `Back to Home`; goes to `/` |
| HeaderActions | row gap 8: LanguageSelector + AccountEntry, exactly as approved in `homeowner-password-login` (incl. the < 375 px compact selector with the full native name at 12/16, centered) | — |
| Content | column, gap 32, pt 8, px 16, pb 24 | — |
| StepIndicator | column gap 8: label 14/20 semibold `textMuted`; bar of 2 segments (h 4, gap 4, pill), done `primary`, todo `border` `#E2E0DA` | `Step 1 of 2` |
| Title | 28/34 bold `text` | `Your kitchen` |
| Helper | 16/24 `textMuted` | `Add photos and the measurements of the room you want to renovate.` |
| Section title | 18/24 semibold `text` | `Photos` / `Measurements` |
| Photo rules | 14/20 `textMuted` | `JPG, PNG, WebP or HEIC · up to 15 MB · up to 8 photos` |
| PhotoGrid | 2 flexible columns, gap 16 both axes | — |
| PhotoTile | 4:3, radius 20, image `object-fit: cover` (server thumbnail), alt `Kitchen photo {n}` | — |
| Remove button | 44x44 hit area, visual 32 circle `surface` with shadow `0 1 2 #0000001F`, `lucide:x` 16 `text`, top-right inset 4 | accessible name `Remove photo {n}` |
| AddPhotoTile | 4:3, radius 20, `surface` fill, 1 px `border`, column gap 8 centered: `lucide:image-plus` 24 `primary` + label 14/20 semibold `primary` | `Add photos`; opens the file picker (accept JPG/PNG/WebP/HEIC per spec, multiple) |
| Tip | row gap 8: `lucide:lightbulb` 16 `textMuted` + 14/20 `textMuted` | `Shoot from the corners so the whole room is visible.` |
| UnitToggle | segmented pill `surfaceMuted`, two 48x44 options, selected = `primary` fill + white 14/20 semibold, other `text` | `m` / `cm` (radiogroup) |
| Measurement fields | row of 3 equal columns, gap 12; each: label 14/20 semibold `text` + field h 52, px 12, `surfaceMuted`, 1 px `border`, radius 12, value 16/24 `text` left, unit suffix 14/20 `textMuted` right | labels `Length`, `Width`, `Height`; empty placeholder `0.00` (m) / `0` (cm) in `textMuted`; values shown with 2 decimals in m, locale-formatted; tapping opens the keypad on that field |
| Range hint | 14/20 `textMuted` | m: `Length and width between 1.00 and 20.00 m · height between 1.80 and 6.00 m`; cm: `Length and width between 100 and 2000 cm · height between 180 and 600 cm` |
| BottomActionBar | column gap 12, pt 12, px 16, pb 24 + safe area, `surface`, `elevation.sheet` | — |
| SaveStatus | row gap 6 centered: icon 16 + 14/20 `textMuted`; `aria-live="polite"` | see panel 7 |
| PrimaryCTA Continue | h 52 pill, `primary`, label 16/24 semibold white + `lucide:arrow-right` 20 | `Continue` → `/kitchen-projects/new/moodboard` (404 until `moodboard-selection`) |
| Continue – disabled (frame 1) | `surfaceMuted` fill, 1 px `border`, label `textMuted`, no arrow; `aria-disabled` + `aria-describedby` the hint | hint above it (replaces SaveStatus, 14/20 `textMuted`, centered, wraps): `Add at least one photo and all three measurements to continue.` |

## Measurement Keypad (frames 3 and 5)

Bottom sheet over the page (overlay `#18223166`), same sheet pattern as the language/account sheets: column gap 16, pt 8, px 16, pb 24 + safe area, `surface`, radius 20 top corners, `elevation.sheet`. Dialog (`aria-label` "Enter measurements"), focus trapped.

| Element | Spec | Copy (en) |
| --- | --- | --- |
| Sheet header | row h 52, space-between; title 18/24 semibold | `Measurements`; Close 44x44 circle `surfaceMuted` `lucide:x` 20 (name `Close`) |
| Field tabs | tablist in a `surfaceMuted` container (p 4, gap 4, radius 16); 3 equal tabs h 52, radius 12; each tab = label 14/20 + current value 12/16 | `Length` / `Width` / `Height`; value like `4.2 m` or `—` when empty. Selected tab: `surface` fill + shadow `0 1 2 #0000001F`, label semibold `text`, value semibold `primary`; others: label medium `text`, value `textMuted` |
| Display | row space-between: step-down button, value, step-up button | — |
| Step buttons | 44x44 circle `surfaceMuted`, `lucide:minus` / `lucide:plus` 20 | names `Decrease by 1 centimetre` / `Increase by 1 centimetre`; step 1 cm, hold to repeat, clamp to the range |
| Value | row gap 6, bottom-aligned: digits 40/48 bold `text`, caret 2x40 `primary`, unit 20/32 semibold `textMuted`; `<output aria-live="polite">` | e.g. `4.2` `m` |
| Range hint / error | 14/20 centered; valid: `textMuted`; out of range: `danger` with `lucide:circle-alert` 16 | `Between 1.00 and 20.00 m` (height `Between 1.80 and 6.00 m`; cm: `Between 100 and 2000 cm` / `Between 180 and 600 cm`); error copy `Between 1.00 m and 20.00 m.` (per field/unit) |
| Keypad | 4 rows x 3 equal keys, gap 8; key h 56, radius 12, 1 px `border`; digits on `surface`, separator and backspace on `surfaceMuted`; label 24/32 semibold `text` | `1`–`9`, `0`; separator shows the locale decimal symbol (`.` or `,`); backspace `lucide:delete` 24 (name `Delete last digit`, long press clears the field) |
| Actions | row gap 12: SecondaryButton `Clear` (w 120, h 52 pill, `surface` + `border`, label `primary`) + PrimaryButton grows (h 52 pill `primary`, label + `lucide:arrow-right` 20) | `Clear` (empties the current field only); `Next: Width` → `Next: Height` → `Done` |

Rules (normative, from panel 5):

- Opening: tapping a measurement field opens the sheet on that field's tab; the field on the page shows the focus ring. A physical keyboard also works: digits, separator, Backspace, Enter = Next/Done, Escape = Close.
- Editing: digits append; the separator works once; max 2 decimals in m; none in cm (separator key `aria-disabled` in cm mode). Tabs switch fields at any time without losing values.
- Live validation: while the value is outside the range (or empty), the hint turns into the danger error row and Next/Done are disabled.
- Finishing: Next/Done commit the field (only valid values are committed). Close keeps the fields already committed and discards an invalid in-progress edit (the field returns to its last valid value or stays empty). Committed values save as usual ("Saving…" → "Saved") and display with 2 decimals.
- Values are stored in whole centimetres (spec); switching the page unit converts the displayed values.

## Photo Tile States (panel 6)

No local preview (HEIC cannot be previewed in browsers): a neutral `surfaceMuted` placeholder until the server thumbnail arrives.

| State | Visual | Copy (en) |
| --- | --- | --- |
| uploading | placeholder, centered column gap 8, px 16: label 14/20 semibold `text` + progress track h 6 `border` with `primary` value (pill); `role="progressbar"` with value | `Uploading… {percent}%` |
| processing (after 100 %) | `lucide:loader` 20 `primary` + label 14/20 semibold | `Processing…` |
| queued | label 14/20 `textMuted` | `Waiting…` |
| limit reached | AddPhotoTile disabled (`surfaceMuted` fill, icon/label `textMuted`) + message below the grid 14/20 `textMuted` | `You've added 8 photos, the maximum. Remove one to add another.` |
| error | `surface` tile, 2 px `danger` stroke, p 8: row icon 16 + text 12/16 semibold `danger`; actions row gap 4: Retry 44 circle (`lucide:refresh-cw` 18 `primary`) and Remove 44 circle (`lucide:trash-2` 18 `text`) | too large: `This photo is larger than 15 MB.` (Remove only) · unsupported: `Use JPG, PNG, WebP or HEIC.` (Remove only) · too small: `This photo is too small. Use one at least 480 px wide.` (Remove only) · failed / storage unavailable: `We couldn't upload this photo.` (Retry + Remove) |

## Alerts and Save Status (panel 7)

Page alerts sit above the Intro title (same alert component as the Keycloak theme: row gap 12, p 16, `surface`, radius 12, 1 px stroke in the state color, icon 20 + 14/20 `text`).

| State | Alert | Copy (en) / behavior |
| --- | --- | --- |
| offline | warning (`warning` stroke, `lucide:cloud-off`) | `You're offline. What you've saved is safe; reconnect to keep going.` — add tile, remove buttons, unit toggle and measurement fields disabled; thumbnails not yet loaded show the placeholder; Continue disabled |
| draft expired | info (`primary` stroke, `lucide:info`), dismissible (Close 44), on an empty capture screen | `Your previous draft expired after 7 days without changes. Start again.` |

Save status variants (14/20 `textMuted`, centered, icon 16):

| Status | Icon | Copy (en) |
| --- | --- | --- |
| saving | `lucide:loader` `textMuted` | `Saving…` |
| saved | `lucide:check` `success` | `Saved` |
| offline | `lucide:cloud-off` `warning` | `Not saved: you're offline` |
| failed (server rejected or unavailable) | `lucide:circle-alert` `danger` | `Not saved: try again in a moment.` |

## Accessibility and Responsive Notes

- Touch targets ≥ 44 px (back, selector, account, remove, toggle, Retry/Remove, Close); keypad keys 56 px; buttons 52 px.
- Checked at 360 px with the longest language name (`Nederlands`): header fits, photo grid becomes 156x117 tiles, measurement columns 101 px wide.
- The OpenPencil accessibility lint reported 0 issues on the approved page (the disabled Continue uses `surfaceMuted` + `textMuted` for ≥ 4.5:1).
- Icons: Lucide (ISC) via `lucide-react`.
