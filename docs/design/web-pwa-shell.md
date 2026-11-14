# Design Read-Back: web-pwa-shell

Approved by developer on 2026-11-13.

> **Updated by `brand-logo-animation` on 2026-11-14 (approved by developer):** colors recolored to the new brand (primary `#2968EC`, text `#182231`, secondary `#E6EEFD`, focus `#2968EC`, overlay `#18223166`; `accent` removed) and the text wordmark replaced by the SVG wordmark logo 140×22. Logo, icons, favicon, email logo and splash: `docs/design/brand-logo-animation.md`. In the JSX exports the logo appears as an empty `Logo (wordmark SVG …)` frame; its artwork comes from the brand read-back.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Home**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format, same syntax the MCP renders): `design/openpencil/web-pwa-shell/`
  - `home.jsx` — frame **Home** (390x844)
  - `language-selection.jsx` — frame **Language Selection** (390x844)
  - `language-selector-open.jsx` — frame **LanguageSelector – open (bottom sheet)** (390x844)
  - `service-status-states.jsx` — frame **ServiceStatus – states**
  - `overview.png` — visual reference of all frames
- Designs are **English only** (developer decision). Every string below is the canonical `en` message; the other 10 locales come from `apps/web/messages/<locale>.json`, never from designs.
- Check frames (not separate screens): **Home – full length (scroll view)** shows the end of the scrollable content; **Home @360x780 (check)** shows that content scrolls under the sticky bar at 360 px while the CTA stays visible.
- Implement strictly from this artifact and the JSX files. Where they are silent, DESIGN.md governs. Text nodes without an explicit size are 14 px (`typography.small`).

## Tokens Used

All values are DESIGN.md tokens; no new tokens were introduced.

| Token | Value | Used for |
| --- | --- | --- |
| `colors.primary` | `#2968EC` | logo accent, CTA fill, step icons, professional link, selected-option check, `theme_color` |
| `colors.secondary` | `#E6EEFD` | step icon circles, globe badge |
| `colors.background` | `#FAFAF8` | page background, `background_color` |
| `colors.surface` | `#FFFFFF` | step cards, bottom action bar, bottom sheet |
| `colors.surfaceMuted` | `#F2F1ED` | language selector pill, dropdown field, selected option, close button |
| `colors.border` | `#E2E0DA` | dropdown field stroke |
| `colors.text` | `#182231` | headline, titles, option labels |
| `colors.textMuted` | `#6B6B70` | body copy, step descriptions, status label, checking dot |
| `colors.success` / `warning` / `danger` | `#2E7D4F` / `#B7791F` / `#C0392B` | status dots |
| `colors.focus` | `#2968EC` | 2 px focus ring |
| `elevation.card` | `0 4 16 #0000000F` | step cards |
| `elevation.sheet` | `0 -8 32 #0000001F` | bottom action bar, bottom sheet |
| `rounded.md` / `lg` / `pill` | 12 / 20 / 999 | field + options / cards + sheet / pills, CTA, circles |
| Font | Inter (self-hosted, latin-ext) | all text |

Overlay behind the bottom sheet: `#182231` at 40 % opacity (`#18223166`).

## Frame: Home (390x844)

Vertical layout, background `#FAFAF8`. Three regions: Header (fixed top), Content (scrolls), BottomActionBar (sticky bottom).

| Element | Layout and size | Style | Copy (en) |
| --- | --- | --- | --- |
| Header | row, full width, h 64, px 16, space-between, centered | — | — |
| Logo | inline SVG wordmark 140×22 (`role="img"`, name `BricoMission`) | brand read-back | — |
| LanguageSelector (closed) | row, h 44, px 14, gap 6, pill | `surfaceMuted` fill; globe icon 18 + label + chevron-down 16, all `text` | label = current language native name (`English`); opens the bottom sheet |
| Current language label | text | 14/20 semibold (600), `text` | `English` |
| Content | column, full width, grows, gap 24, pt 16, px 16, pb 24 | scrolls under the sticky bar | — |
| Hero | column, gap 12 | — | — |
| Headline | text, full width, wraps | 34/39 bold (`typography.display`), `text` | `Design your new kitchen and know its price before you start.` |
| Value proposition | text, full width, wraps | 16/24 regular, `textMuted` | `Upload photos and measurements of your kitchen. See photorealistic designs, get a budget priced from real store catalogs, then do it yourself or receive offers from validated professionals.` |
| Steps | column, gap 12 | — | — |
| Step card (x3) | row, full width, gap 16, p 16, center-aligned | `surface`, radius 20, `elevation.card` | — |
| Step icon circle | 44x44, centered icon 22 | `secondary` fill, icon `primary` | icons: `lucide:camera`, `lucide:sparkles`, `lucide:receipt-text` |
| Step title | text, full width | 16/24 semibold, `text` | `1. Capture` · `2. Design` · `3. Budget` |
| Step description | text, full width, wraps | 14/20 regular, `textMuted` | `Photos of your kitchen and its measurements.` · `Photorealistic designs that keep your room's layout.` · `Four price levels from real catalogs. Do it yourself or get offers.` |
| ProfessionalLink | row, full width, h 44 (touch target), centered; last item of Content (visible after scrolling) | 14/20 medium (500), `primary`, underlined | `Are you a professional?` → `/professionals/register` (404 until `professional-registration`) |
| BottomActionBar | column, full width, gap 12, pt 12, px 16, pb 24 + safe-area inset | `surface`, `elevation.sheet`; sticky at the bottom | — |
| ServiceStatus | row, full width, gap 8, centered | dot 8x8 + label 14/20 `textMuted` | see Service Status below (`Service available` shown) |
| PrimaryCTA | row, full width, h 52, gap 8, centered, pill | `primary` fill; label 16/24 semibold white + `lucide:arrow-right` 20 white | `Start your Kitchen Project` → `/kitchen-projects/new` (404 until `kitchen-capture-draft`) |

No Sign in on Home (lazy login).

## Frame: Language Selection (390x844)

Shown at `/language` when no supported language can be detected. Background `#FAFAF8`.

| Element | Layout and size | Style | Copy (en) |
| --- | --- | --- | --- |
| Header | row, h 64, px 16 | wordmark only (no selector) | `BricoMission` |
| Content | column, grows, gap 24, pt 40, px 16, pb 24 | — | — |
| Globe badge | 56x56 circle, icon `lucide:globe` 26 | `secondary` fill, icon `primary` | — |
| Title | text, full width, wraps | 28/34 bold (`typography.h1`), `text` | `Choose your language` |
| Helper | text, full width, wraps | 16/24 regular, `textMuted` | `We couldn't match your device language. You can change it later from any screen.` |
| Field label | text | 14/20 semibold, `text` | `Language` |
| LanguageDropdown (closed) | row, full width, h 52, px 16, space-between | `surfaceMuted` fill, 1 px `border` stroke, radius 12; value 16/24 `text`; `lucide:chevron-down` 20 | value: `English` (preselected); options = the 11 native names |
| BottomActionBar | column, pt 12, px 16, pb 24 + safe area | `surface`, `elevation.sheet` | — |
| PrimaryCTA | h 52, full width, pill | `primary`, label 16/24 semibold white (no icon) | `Continue` |

## Frame: LanguageSelector – open (bottom sheet)

Opened from the Home selector. Full-screen overlay `#18223166`, sheet anchored to the bottom.

| Element | Layout and size | Style | Copy (en) |
| --- | --- | --- | --- |
| Sheet | column, full width, gap 4, pt 8, px 16, pb 24 + safe area | `surface`, radius 20 (top corners in the implementation), `elevation.sheet` | — |
| Sheet header | row, h 52, space-between | title 18/24 semibold `text` | `Language` |
| Close button | 44x44 circle, `lucide:x` 20 | `surfaceMuted` fill, icon `text` | accessible name `Close` |
| Option row (x11) | row, full width, h 48, px 12, radius 12 | label 16/24 regular `text` | `English`, `Español`, `Français`, `Deutsch`, `Italiano`, `Português`, `Nederlands`, `Svenska`, `Norsk`, `Dansk`, `Suomi` (native names, this order, never translated) |
| Selected option | same row | `surfaceMuted` fill, label semibold (600), `lucide:check` 20 `primary` at the right; `aria-selected`/`aria-checked` | current language |
| Keyboard focus (example on `Deutsch`) | same row | 2 px `focus` (`#2968EC`) ring, radius 12 | — |

## Service Status (4 states)

Dot 8x8 + label 14/20 `textMuted`, gap 8. Colour is never the only signal: the label always changes.

| State | Dot | Label (en) |
| --- | --- | --- |
| checking | `textMuted` `#6B6B70` | `Checking service…` |
| online | `success` `#2E7D4F` | `Service available` |
| degraded (API 503) | `warning` `#B7791F` | `Some features are temporarily unavailable` |
| offline (network error, timeout, 502) | `danger` `#C0392B` | `You're offline or the service can't be reached` |

## App Icon and Manifest

Superseded by `docs/design/brand-logo-animation.md` (page **Brand**): white lettermark icon, `theme_color` `#2968EC`, `background_color` `#FAFAF8`, `display` `standalone`, `name`/`short_name` `BricoMission`.

## Responsive and Accessibility Notes

- Designed at 390x844; verified visually at 360x780. Content scrolls under the sticky bottom bar; the CTA is always visible; no horizontal overflow.
- No fixed-width text boxes: strings must wrap to absorb ~30 % longer locales (de, fi).
- Touch targets ≥ 44 px (selector pill 44 high, options 48, close 44, professional link row 44, CTA 52).
- The OpenPencil accessibility lint (contrast, touch targets, text size) reported 0 issues on the approved page.
- Icons: Lucide (ISC license), inline SVG; no runtime icon fetching.
