# Design Read-Back: controlnet-render

Approved by developer on 2026-11-15.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **AI Results**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/controlnet-render/`:
  - `1-results-running.jsx`, `2-results-succeeded.jsx`, `5-results-360-check.jsx` (screens)
  - `3-render-states.jsx`, `4-owned-page-bar.jsx` (panels; their annotation text is normative)
  - `overview.png`
- Images are placeholders (`kitchen-sample.jpg`); the real page shows the Render's `before`/`full`/`thumb` variants and the project's photo thumbnails. Designs are English only; all 11 locales come from `apps/web/messages/<locale>.json`.
- Product decisions: spec `docs/specs/controlnet-render.md`, OQ-1..OQ-10 answered with the recommended option on 2026-11-15. Where silent, the login-gate-claim, Capture and Moodboard read-backs and DESIGN.md govern. Implement strictly from this artifact and the JSX files.

## Page `/kitchen-projects/<id>/results` (owner only)

Background `#FAFAF8`; Header, Content (scrolls under the sticky bar), BottomActionBar (sticky). Header: back button (44 circle `surfaceMuted`, `lucide:arrow-left` 20, accessible name `Back to my kitchen`, → `/kitchen-projects/<id>`) + HeaderActions (selector + signed-in AccountEntry; compact selector < 375 px). No logo, no step indicator.

### Frame 2 · Render succeeded

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Content | column, gap 24, pt 8, px 16, pb 24 | — |
| Title | 28/34 bold `text` | `Your new kitchen` |
| Helper | 16/24 `textMuted` | `{style} style, from photo {n}. Drag the handle to compare.` (style name from `moodboard.styles.<id>`) |
| BeforeAfterSlider | full content width, aspect = the Render bucket (1216:832, 832:1216 or 1:1; 358×245 at 390, 328×224 at 360), radius 20, clips its children. Base layer = `full` (after); before layer = `before`, clipped to the handle position; 2 px white divider; handle 40 white circle with shadow `0 1 2 #0000001F` and `lucide:chevrons-left-right` 20 `text` in a 44 hit area, vertically centered; labels: white pills px 8 py 2, 12/16 semibold `text`, inset 12 top-left / top-right | `Before` / `After`. `role="slider"`, accessible name `Compare before and after`, `aria-valuenow` 0–100 (start 50), pointer drag + ← → (step 5) + Home/End; images have alt `Your kitchen before` / `Your new kitchen design` |
| Photo picker (2+ photos only) | section title 18/24 semibold + helper 14/20 `textMuted`; row gap 12 of 4:3 thumbs 96×72 radius 12; selected: 3 px `primary` stroke + 24 `primary` circle badge with white `lucide:check` 14, top-right inset 4; `radiogroup`, each `radio` named `Photo {n}` | `Photo for the next render` · `The render keeps the walls, windows and plumbing of this photo.` Default selection: photo 1 (or the photo of the shown Render) |
| History | header row: title 18/24 semibold + counter 14/20 semibold `textMuted`; strip row gap 12 of thumbs 110×75 radius 12, newest first, horizontal scroll; the shown Render has a 3 px `primary` stroke and `aria-current`; tap shows it in the slider | `Your renders` · `{count} of {max}` (non-failed count, max 10); thumbs named `Render {n}` |
| BottomActionBar | column gap 12, as Capture | — |
| Primary CTA | h 52 pill `primary`, `lucide:refresh-cw` 20 white + 16/24 semibold white | `Generate again` (new seed, selected photo) |
| Secondary CTA | h 52 pill `surface` + `border`, label `primary` | `Back to my kitchen` |

### Frame 1 · Render queued / running

| Element | Spec | Copy (en) |
| --- | --- | --- |
| Title / Helper | as frame 2 | `Designing your kitchen` · `{style} style, from photo {n}. This takes about 10 to 30 seconds.` |
| Placeholder | same box as the slider; background = the selected photo's thumbnail dimmed; centered status card 240 wide, p 16, gap 12, `surface`, radius 16, `elevation.card`; `aria-busy`; status `role="status"` `aria-live="polite"` | running: `lucide:loader` 24 `primary` + `Generating…` 16/24 semibold + indeterminate bar (track h 6 `border`, moving 80 px `primary` pill); queued: see panel 3 |
| Note | 14/20 `textMuted` | `You can leave this page; the render keeps going and appears here when it's ready.` |
| Bottom bar | hint 14/20 `textMuted` centered above the disabled `Generate again` (`surfaceMuted`, `border`, icon + label `textMuted`, `aria-disabled`) | `One render at a time.` |

Photo picker and history (if any) stay visible below the note but are disabled while a Render is active.

## Panel 3 · States (normative)

- **Queued:** status card `lucide:hourglass` 24 `primary` + `Waiting for the GPU` + 14/20 `textMuted` position line `{count, plural, one {# job ahead of yours} other {# jobs ahead of yours}}` (omitted when unknown or 0).
- **Failed:** danger alert above the title `We couldn't create this render. Try again in a moment.`; the slider area shows the `before` photo without overlay; primary CTA label `Try again` (same photo, new seed).
- **Interrupted** (API restart): danger alert `This render was interrupted. Try again.`; same CTA.
- **GPU queue full (429):** warning alert `The designer is busy right now. Try again in a minute.`; no Render created.
- **Limit reached (10 non-failed):** `Generate again` disabled with the hint `You've created 10 renders, the maximum for this project.`
- **Moodboard with only own photos:** info alert (`primary` stroke, `lucide:info`) `Your own photos can't guide the style yet, so we used a neutral modern style.`
- **Offline:** warning alert `You're offline. Your renders are safe; reconnect to see new ones.`; CTAs and photo picker disabled; polling pauses and resumes when back online.
- **Not found / not the owner / signed out:** as the owned project page (`We couldn't find this kitchen project` / `Sign in to see this kitchen project`).

## Panel 4 · Owned project page (`/kitchen-projects/<id>`) changes

- Bottom bar: primary `Generate my kitchen` (`lucide:sparkles`) enabled → `/kitchen-projects/<id>/results`; `Get my budget` stays disabled; hint below the buttons `Budgets: available soon` (`aria-describedby` of the budget button only).
- With 1+ succeeded Render the primary label becomes `See my designs` (→ results).
- Helper text becomes `Generate a design of your new kitchen. Budgets are coming soon.`
- After the Generate claim with intent `render`, the app lands on `/results` and starts the first Render automatically with photo 1.

## Accessibility and Responsive Notes

- Touch targets ≥ 44 px (back, selector, account, slider handle hit area, photo options 96×72, history thumbs, CTAs 52).
- Checked at 360×780 with the compact selector (`Nederlands`): header fits, slider 328×224, photo row and history fit or scroll, no page overflow.
- OpenPencil lint: 0 errors, 0 warnings on page AI Results.
- Icons: Lucide via `lucide-react` (`chevrons-left-right`, `refresh-cw`, `loader`, `hourglass`, `check`, `circle-alert`, `info`, `sparkles`, `receipt-text`).
