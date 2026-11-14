# Design Read-Back: budget-tier-computation

Approved by developer on 2026-11-14.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Budget Tiers**, designed and read back through the `open-pencil` MCP.
- Read-back exports (JSX round-trip format) in `design/openpencil/budget-tier-computation/`:
  - `1-budget-succeeded.jsx`, `2-budget-tier-expanded.jsx`, `3-budget-running.jsx`, `6-budget-360-check.jsx` (screens)
  - `4-budget-states.jsx`, `5-owned-page-bar.jsx` (panels; their annotation text is normative)
  - `overview.png`
- Money values, product names and SKUs in the frames are placeholders. The real page shows the Budget returned by the API (integer cents, `EUR`, formatted per locale with `Intl.NumberFormat`). Designs are English only; all 11 locales come from `apps/web/messages/<locale>.json`.
- Product decisions: spec `docs/specs/budget-tier-computation.md`, OQ-1..OQ-5 answered with the recommended option on 2026-11-14 (VAT-inclusive prices at 21 % with a breakdown, one LLM call for four tiers, history capped at 5 with one active, claim with intent `budget` lands on the budget page and starts automatically, deterministic fake JSON mode). Where silent, the controlnet-render, login-gate-claim and Capture read-backs and DESIGN.md govern. Implement strictly from this artifact and the JSX files.

## Page `/kitchen-projects/<id>/budget` (owner only)

Background `#FAFAF8`; Header, Content (scrolls under the sticky bar), BottomActionBar (sticky). Header as AI Results: back button (44 circle `surfaceMuted`, `lucide:arrow-left` 20, accessible name `Back to my kitchen`, to `/kitchen-projects/<id>`) + HeaderActions (selector + signed-in AccountEntry; compact selector below 375 px). No logo, no step indicator.

### Frame 1 · Budget succeeded, tiers collapsed

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Content | column, gap 24, pt 8, px 16, pb 24 | none |
| Title | 28/34 bold `text` | `Your kitchen budget` |
| Helper | 16/24 `textMuted` | `Four options, from premium to essential. Prices come from the product catalog; tap an option to see every item.` |
| Tier list | column, gap 12, four TierCards in the order Luxury, High, Medium, Low | tiers are **not selectable** (choosing a tier belongs to the later Dossier feature) |
| TierCard | button (`aria-expanded`), column gap 12, p 16, `surface`, radius 20, shadow `elevation.card`. Top row: tier icon 20 `primary` + tier name 18/24 semibold `text`, and a 44x44 hit area with `lucide:chevron-down` 20 `textMuted`. Total 28/34 bold `text`. Meta 14/20 `textMuted` | `{count, plural, one {# item} other {# items}} · VAT included`. Icons: `gem` (Luxury), `award` (High), `layers` (Medium), `piggy-bank` (Low) |
| History | header row: title 18/24 semibold + counter 14/20 semibold `textMuted`; shown only with 2+ Budgets; tapping a past Budget shows it | `Your budgets` · `{count} of {max}` (non-failed count, max 5) |
| BottomActionBar | column gap 12, p 12/16/24, `surface`, shadow `0 -8 32 #0000001F` | none |
| Primary CTA | h 52 pill `primary`, `lucide:refresh-cw` 20 white + 16/24 semibold white | `Calculate again` (new Budget, same project) |
| Secondary CTA | h 52 pill `surface` + `border`, label `primary` | `Back to my kitchen` |

### Frame 2 · Tier expanded

- The expanded TierCard gets a 2 px `primary` stroke, `lucide:chevron-up`, `aria-expanded="true"`; other tiers stay collapsed (their meta line is hidden in the frame only to save space; the real card keeps it). One tier open at a time is allowed but not required; opening another does not close it.
- Inside the card, after a 1 px `border` divider: the Line Item list, a divider, and the Totals block. Card gap 16.
- **Line Item:** column gap 4. Row: name 16/24 semibold `text` (fills, wraps) + computed subtotal 16/24 semibold `text` (right, never wraps). Detail line 14/20 `textMuted`: `{unitPrice} × {quantity} {unit} · SKU {sku}`. Citation row: `lucide:book-open` 14 `textMuted` + 12/16 `textMuted` `{catalogName}, page {page}`. The citation is quieter than the price and never a link in the MVP.
- Long lists: show the first 3 items, then `+ {count} more items` (14/20 `textMuted`) as a 44 px high text button that reveals the rest.
- **Totals block:** column gap 8. Rows: `Subtotal (before VAT)` · value 14/20 semibold; `VAT {percent}%` · value 14/20 semibold; `Total (VAT included)` 16/24 semibold label with the value 16/24 bold. Labels left (`textMuted` except the total label), values right.
- All amounts come from the API fields (cents); the page never sums or multiplies money.

### Frame 3 · Budget queued / running

| Element | Spec | Copy (en) |
| --- | --- | --- |
| Title / Helper | as frame 1 | `Calculating your budget` · `Matching your kitchen with the product catalog. This takes about a minute.` |
| StatusCard | column gap 12, p 16, centered, `surface`, radius 16, shadow `elevation.card`; `aria-busy`; status `role="status"` `aria-live="polite"`. Running: `lucide:loader` 24 `primary`, `Calculating…` 16/24 semibold, indeterminate bar (track h 6 `border`, moving 80 px `primary` pill; static under reduced motion) | see panel 4 for queued |
| Note | 14/20 `textMuted` | `You can leave this page; the budget keeps going and appears here when it's ready.` |
| Bottom bar | hint 14/20 `textMuted` centered above the disabled `Calculate again` (`surfaceMuted`, `border`, icon + label `textMuted`, `aria-disabled`) | `One budget at a time.` |

Polling every 2 s (first poll after 0.5 s) while the Budget is `queued` or `running`.

## Panel 4 · States (normative)

- **Queued:** status card `lucide:hourglass` 24 `primary` + `Waiting for the GPU` 16/24 semibold + 14/20 `textMuted` position line `{count, plural, one {# job ahead of yours} other {# jobs ahead of yours}}` (omitted when unknown or 0).
- **First run** (project complete, no Budget yet): empty card `lucide:receipt-text` 24 `primary`, `No budget yet`, helper `Get four options for your kitchen, from premium to essential.`; the primary CTA reads `Get my budget` and the secondary stays `Back to my kitchen`.
- **Failed:** danger alert above the title `We couldn't calculate this budget. Try again in a moment.`; no tier list; primary CTA label `Try again`.
- **Interrupted** (API restart): danger alert `This budget was interrupted. Try again.`; same CTA.
- **Catalog empty (409 `catalog_empty`):** warning alert `The product catalog isn't ready yet. Try again later.`
- **Search unavailable (503 `embedding_unavailable`):** warning alert `The price search is unavailable right now. Try again in a minute.`
- **GPU queue full (429):** warning alert `The designer is busy right now. Try again in a minute.`; no Budget created.
- **Limit reached (5 non-failed):** `Calculate again` disabled with the hint `You've created 5 budgets, the maximum for this project.`
- **Project incomplete (409 `project_incomplete`):** info alert (`primary` stroke, `lucide:info`) `Add your photos and measurements first, then get your budget.`
- **Offline:** warning alert `You're offline. Your budgets are safe; reconnect to see new ones.`; CTAs disabled; polling pauses and resumes when back online.
- **Not found / not the owner / signed out:** as the owned project page (`We couldn't find this kitchen project` / `Sign in to see this kitchen project`).

Alerts: p 16, gap 12, 1 px stroke in the state color (`danger`, `warning`, `primary`), radius 16, 20 px icon (`circle-alert`, `triangle-alert`, `info`), text 14/20 `text`.

## Panel 5 · Owned project page (`/kitchen-projects/<id>`) changes

- Bottom bar: primary `Generate my kitchen` / `See my designs` (unchanged); secondary `Get my budget` (`lucide:receipt-text`) becomes **enabled** and goes to `/kitchen-projects/<id>/budget`. The hint `Budgets: available soon` is removed.
- With 1+ succeeded Budget the secondary label becomes `See my budget`.
- Helper text becomes `Generate a design of your new kitchen or get your budget.`
- After the Generate claim with intent `budget`, the app lands on `/kitchen-projects/<id>/budget?claimed=1&start=1` and starts the first Budget automatically.

## Frame 6 · 360x780 check

German labels (`Ihr Küchenbudget`, `Luxus`, `inkl. MwSt.`, `Zwischensumme (ohne MwSt.)`, `Gesamtsumme (inkl. MwSt.)`) with the compact selector (`Deutsch`, padding 10, gap 4, globe 16, chevron 14, label 12/16 semibold, full native name): header fits, TierCard and Totals block fit, the long labels wrap (`fill` width) and values stay on one line with a 12 px gap, no page overflow. Prices in other locales use the locale's `Intl.NumberFormat` currency style (`18.450,00 €` in German).

## Accessibility and Responsive Notes

- Touch targets at least 44 px (back, selector, account, TierCard chevron area, the `more items` button, CTAs 52).
- Selected/expanded state is shown by the stroke, the chevron and `aria-expanded`, never by color alone.
- Icons: Lucide via `lucide-react` (`gem`, `award`, `layers`, `piggy-bank`, `chevron-down`, `chevron-up`, `book-open`, `refresh-cw`, `loader`, `hourglass`, `receipt-text`, `circle-alert`, `triangle-alert`, `info`, `sparkles`, `arrow-left`, `globe`).
- OpenPencil lint on page Budget Tiers: 0 errors, 0 warnings (info only: radius 999 for pills, 6/14 px selector spacing and drop-shadow styles, all as in the approved AI Results page).
