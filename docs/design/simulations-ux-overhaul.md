# Design Read-Back: simulations-ux-overhaul

Approved by developer on 2026-11-14.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, designed and read back through the `open-pencil` MCP. Frames are named `S1` to `S10` and live on the page of the screen they change:
  - page **Capture**: S1
  - page **Moodboard**: S2
  - page **AI Results**: S3, S4, S5, S6
  - page **Generate** (owned project page): S7, S8
  - page **Budget Tiers**: S9, S10
- Read-back exports (JSX round-trip format) in `design/openpencil/simulations-ux-overhaul/`: `s1-capture-cm.jsx`, `s2-moodboard-filters.jsx`, `s3-results-rendering.jsx`, `s4-results-succeeded.jsx`, `s5-results-states.jsx`, `s6-results-360-check.jsx`, `s7-project-my-simulations.jsx`, `s8-project-states.jsx`, `s9-budget-simulation.jsx`, `s10-budget-states.jsx`, plus `overview-*.png`. Annotation text inside S1, S2, S5, S8 and S10 is normative.
- Images are placeholders (flat warm greys). The real pages show the Render `before`, `full` and `thumb` variants. Money values, names and dates are samples. Designs are English only; all 11 locales come from `apps/web/messages/<locale>.json`.
- Product decisions: spec `docs/specs/simulations-ux-overhaul.md`, OQ-1..OQ-6 answered 2026-11-14 (OQ-5 is the relabel option). Where this document is silent, the controlnet-render, budget-tier-computation, login-gate-claim, Capture and Moodboard read-backs and DESIGN.md govern. Implement strictly from this artifact and the JSX files.
- **No frames exist for the edit pages** (edit photos, edit measurements, edit styles). They reuse the approved Capture and Moodboard screens with the project context: back goes to `/kitchen-projects/<id>`, the primary CTA reads `Save changes`, and while a Simulation is active the entries are disabled (S8).
- Wrapping rows: every `wrap` row uses `rowGap` equal to its column gap (chips 8, photo grid and tiles 12, thumbnails 8).

## S1 · Capture: measurements in cm (page Capture)

- The unit toggle starts on `cm` for every new draft; the toggle `cm | m` stays (two 48x44 options in a `surfaceMuted` pill, selected = `primary` fill + white label) and the choice is remembered per draft. Stored values stay metric internally.
- Fields keep the approved layout (3 columns, gap 12, padding 12, radius 12, 1 px `border`). Values read `420 cm`, `310 cm`, `250 cm`. Empty fields show a cm placeholder (for example `400 cm`).
- The keypad follows the cm rules already approved (whole numbers, no separator in cm).

## S2 · Moodboard: filters as a tag cloud (page Moodboard)

- The Style Gallery filter row no longer scrolls: chips wrap onto as many rows as needed. Row gap 8, column gap 8, chip h 44, padding 16, pill, 14/20 semibold.
- Selected chip: `primary` fill, white label and a 14 px `lucide:check` (never colour alone). Unselected: `surfaceMuted` + `text`. Multi-select stays: any number of styles; `All` clears the selection. Chip order unchanged. At 360 px long labels move to the next row and are never cut.

## S3 · Simulation rendering (`/kitchen-projects/<id>/results`, page AI Results)

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Title / Helper | 28/34 bold / 16/24 `textMuted` | `Designing your kitchen` · `One calculated style from {styles} gallery styles and {refs} of your photos, applied to each of your {count} kitchen photos.` |
| StatusCard | column gap 12, p 16, `surface`, radius 16, `elevation.card`; `aria-busy`; status `role="status"` `aria-live="polite"`; row: `lucide:loader` 24 `primary` + 16/24 semibold status, percent 14/20 semibold `textMuted` right; determinate track h 6 `border` with a `primary` fill = n/N | `Rendering {n} of {count}` · `{percent}%` |
| Photo tiles | wrap, gap 12 (row gap 12), 4:3 tiles radius 12 (110x82 at 390). Done: image + 24 `primary` badge with a white 14 px `check`. Running: 3 px `primary` stroke + 24 `loader`. Queued: `surfaceMuted` + 1 px `border` + 20 `hourglass` `textMuted` | tiles named `Photo {n}` |
| Note | 14/20 `textMuted` | `You can leave this page; the simulation keeps going and appears here when it's ready.` |
| Bottom bar | hint 14/20 `textMuted` centered above the disabled `Generate again` (`surfaceMuted`, `border`, `refresh-cw` 20 + label `textMuted`, `aria-disabled`) | `One simulation at a time.` |

## S4 · Simulation succeeded (page AI Results)

- Title `Simulation {n}` (28/34 bold). Helper `Calculated style from {styles} and {refs} of your photos. Photo {i} of {count}. Drag the handle to compare.`
- BeforeAfterSlider as in controlnet-render (358x245 at 390, radius 20, 2 px white divider, 40 handle in a 44 hit area, Before/After pills) with one change: **the slider position is kept when another Render is shown** (it is state of the page, not of the image; it starts at 50 on first load). `Home` and `End` show only After or only Before.
- Section `Photos in this simulation` (18/24 semibold + 14/20 `textMuted` helper `Every photo is rendered with the same calculated style.`): `radiogroup` of 4:3 thumbs 110x82 radius 12, wrap, gap 12, row gap 12. The shown one has a 3 px `primary` stroke + 24 badge with a white `check`, `aria-checked`; each radio is named `Photo {n}`. Tapping shows that Render in the slider (3 per row at 390, 3 flexible columns 101x76 at 360).
- Section `Your simulations` (title + counter 14/20 semibold `textMuted`): one card per Simulation, newest first. Card p 12, gap 8, `surface`, radius 16, `elevation.card`, title 14/20 semibold, thumbs 64x48 radius 8 wrap gap 8 (row gap 8). The shown Simulation has a 3 px `primary` stroke and `aria-current`. Tapping a card shows that Simulation.
- Bottom bar: primary `Generate again` (`refresh-cw` 20) creates a **new Simulation with a new calculated style**; secondary outlined `Back to my kitchen`.

## S5 · Results states (normative)

- **Describing references:** status card with `lucide:loader` 24 + `Studying your style references`; indeterminate bar (static under reduced motion); then S3.
- **Partial failure:** successful Renders stay visible; a failed tile has a 2 px `danger` stroke, `circle-alert` 16 + `Photo {n} failed` 12/16 semibold, and a 44 high `Retry` pill (`surfaceMuted`, `refresh-cw` 16 `primary`, label 14/20 semibold `text`). Info alert above the grid: `{failed} of {count} photos could not be rendered. Retry it to be able to choose this simulation for your budget.`
- **All failed / interrupted:** danger alert `We couldn't create this simulation. Try again in a moment.` / `This simulation was interrupted. Try again.`; primary CTA `Try again` retries every failed Render.
- **Queue full (429):** warning alert `The designer is busy right now. Try again in a minute.`; no Simulation created.
- **Style degraded:** quiet 14/20 `textMuted` note under the title `We couldn't analyse all your references, so this simulation uses your main style.`
- **Generate again disabled:** reason line 14/20 `textMuted` above the CTA: `One simulation at a time.` while active, `You're offline. Reconnect to generate.` offline.
- **Empty / not found / signed out / offline:** empty = primary CTA `Generate my kitchen`; not found and signed out as the owned project page; offline warning alert `You're offline. Your simulations are safe; reconnect to see new ones.`
- Alerts: p 16, gap 12, 1 px stroke in the state colour (`danger`, `warning`, `primary`), radius 16, 20 px icon, text 14/20 `text`.

## S6 · Results at 360x780

Compact selector (`Nederlands`), slider 328x224, 8 photos as 3 flexible columns (101x76) in 3 rows, a Simulation card with 8 thumbs wrapping 4 per row; no horizontal overflow anywhere.

## S7 · Owned project page with My simulations (`/kitchen-projects/<id>`, page Generate)

- Header: logo link 140x44 + selector + account entry (as the approved owned page). Title `Your kitchen project` (28/34 bold). Helper `Edit your photos, measurements and styles at any time. Pick one simulation to get your budget.`
- Summary card (existing, p 16, radius 20, `elevation.card`) now has three 44 high rows separated by 1 px `border` dividers, each with a text link 14/20 semibold underlined `primary` at the right: `6 photos` · `Edit photos`; `420 x 310 x 250 cm` · `Edit measurements`; `4 styles and references` · `Edit styles`. They go to the edit pages (see above) and are disabled while a Simulation is active (S8).
- Section `My simulations` (18/24 semibold + counter). **Instruction alert** (`primary` stroke, `lucide:info`): `To get your budget, select one simulation below. The budget counts every element visible in its images.` (shown when no Simulation is selected; hidden once one is).
- **SimulationCard:** p 16, gap 12, `surface`, radius 20, `elevation.card`. Top row: name 16/24 semibold + meta 14/20 `textMuted` (`{date} · {count} photos`), and a 44x44 delete button with `lucide:trash-2` 20 `danger` (the selected card shows the delete as an outlined pill instead). Thumbs 64x48 radius 8, first 3 plus a `surfaceMuted` `+n` cell. Actions row gap 8: `Open` (outlined pill h 44, `maximize-2` 16 `primary`, goes to `/results` showing that Simulation) and `Select` (`surfaceMuted` pill h 44, `lucide:circle` 16 + label; `role="radio"`, `aria-checked`).
- **Selected card:** 3 px `primary` stroke and a `Selected` badge (h 28, padding 10, `primary` fill, white 12/16 semibold with a 14 px `check`); the Select button is replaced by `Delete`.
- Bottom bar: primary `Get my budget` (`receipt-text` 20) enabled because a Simulation is selected; secondary outlined `Generate more simulations` (`sparkles` 20).

## S8 · Project states (normative)

- **No simulations:** empty card (`sparkles` 24, `No simulations yet`, helper `Generate your first simulation to see your new kitchen from every photo.`); primary CTA `Generate my kitchen`; the budget button is disabled.
- **Running:** card with name + `loader` 16 + `Rendering {n} of {count}` and a progress bar; `Open` goes to the progress view; Select and Delete are disabled; the three edit links are disabled with the hint `Wait for the simulation to finish to edit your project.`
- **Partial failure:** 1 px `warning` stroke, badge `{n} photo failed` (`triangle-alert` 14 `warning`), `Open and retry` and a disabled `Select` (`aria-disabled`): not selectable until every Render succeeded.
- **Delete confirm:** dialog (focus trapped, Escape closes) p 16, gap 16, radius 20, shadow `0 8 32 #0000001F`. Title `Delete Simulation {n}?`, message `Its images and its budget will be removed for good. Your photos and measurements stay.`, buttons `Delete simulation` (h 52 `danger` fill, white label) and `Cancel` (outlined). While a Simulation runs its own Delete is disabled (the others can be deleted). Deleting the selected Simulation clears the selection and the budget button returns to disabled.
- **Budget button:** disabled state shows the reason line `Select a simulation to enable your budget.` (14/20 `textMuted`, centered) above a disabled pill. Selected without a budget: `Get my budget`. With a current budget: `See my budget` (goes to the budget page). Computing: `See my budget` with a `loader` icon.

## S9 · Budget for the selected Simulation (`/kitchen-projects/<id>/budget`, page Budget Tiers)

- Same page as the approved Budget design, with these changes. Helper `Four options from premium to essential, from the elements visible in your simulation. Tap an option to see every item.`
- **Based on card** (p 12, `surface`, radius 16, `elevation.card`): `Based on Simulation {n}` 14/20 semibold + `Change` link 14/20 semibold `primary` (goes to the project page) and a wrapping row of 48x36 thumbnails radius 8 (all images of the Simulation).
- **Relabel note** (quiet 14/20 `textMuted`, only when `relabeled` is true): `The options are ordered by total price, from the most to the least expensive.`
- Tier list, tier expansion, Line Items, citations and totals block are unchanged from `docs/design/budget-tier-computation.md`. Totals are strictly ordered Luxury, High, Medium, Low (example: 9,860.40 / 7,215.30 / 4,980.00 / 2,760.00 EUR).
- Bottom bar: primary `Back to my kitchen`; secondary outlined `Recalculate budget` (`refresh-cw` 20). The `Your budgets` history strip, the `Calculate again` button and the 5-budget limit are **removed**.

## S10 · Budget states (normative)

- **Computing:** title `Calculating your budget`; status card with a `loader` and the stage line, determinate bar: `Reading image {n} of {count}`, then `Matching products in the catalog`; waiting stage `Waiting for the GPU`.
- **Recalculating:** the previous budget stays visible under a banner `Calculating a new budget` and is replaced only when the new one succeeds; the buttons are disabled with the hint `One budget at a time.`
- **No simulation selected (409 `no_simulation_selected`):** info alert `Select a simulation in your kitchen project to get a budget.` with a `Go to my simulations` link.
- **Simulation not ready (409 `simulation_not_ready`):** warning alert `This simulation still has photos that were not rendered. Retry them first.`
- **Failed / interrupted:** danger alert `We couldn't calculate this budget. Try again in a moment.` / `This budget was interrupted. Try again.`; CTA `Try again`.
- Catalog empty (409), search unavailable (503), GPU queue full (429), offline, not found and signed out: unchanged from the Budget read-back.

## Accessibility and Responsive Notes

- Touch targets at least 44 px (back, selector, account, delete, Open, Select, Retry, chips, edit links, CTAs 52).
- Selected states always combine a stroke or fill with an icon or label and the ARIA state (`aria-checked`, `aria-current`, `aria-expanded`), never colour alone.
- `primary` text on `surfaceMuted` fails 4.5:1 (see DESIGN.md), so `Retry` uses `text` for its label and keeps `primary` for the icon. OpenPencil lint on the S frames: contrast 0 errors.
- Icons: Lucide via `lucide-react` (`check`, `loader`, `hourglass`, `circle-alert`, `triangle-alert`, `info`, `refresh-cw`, `trash-2`, `maximize-2`, `circle`, `sparkles`, `receipt-text`, `chevrons-left-right`, `arrow-left`, `globe`, `chevron-down`).
