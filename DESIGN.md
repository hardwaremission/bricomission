---
name: BricoMission
description: Calm, airy, photo-first renovation planner. Apple-like restraint, IKEA-like warmth and clarity.
designAssets:
  sourceOfTruth:
    - design/openpencil/bricomission_B2C_app.fig (page Home approved 2026-11-13; page Auth – Keycloak approved 2026-11-13; page Capture approved 2026-11-14; page Moodboard approved 2026-11-14; page Brand approved 2026-11-14 and all B2C pages recolored; page Generate approved 2026-11-14; other screens added per screen via open-pencil MCP)
    - design/openpencil/bricomission_B2B_dashboard.fig (to be created)
    - design/openpencil/bricomission_admin.fig (to be created)
  generatedConcepts: []
colors:
  primary: "#2968EC"
  primaryHover: "#1F55C8"
  secondary: "#E6EEFD"
  background: "#FAFAF8"
  surface: "#FFFFFF"
  surfaceMuted: "#F2F1ED"
  border: "#E2E0DA"
  text: "#182231"
  textMuted: "#6B6B70"
  success: "#2E7D4F"
  warning: "#B7791F"
  danger: "#C0392B"
  focus: "#2968EC"
typography:
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  display:
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.15
  h1:
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
  h2:
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
  numeric:
    fontFeature: "tabular-nums"
rounded:
  sm: 8px
  md: 12px
  lg: 20px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
elevation:
  card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)"
  sheet: "0 -8px 32px rgba(0,0,0,0.12)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: 52px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.pill}"
    height: 52px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    shadow: "{elevation.card}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.surfaceMuted}"
    rounded: "{rounded.md}"
    height: 48px
  chip:
    backgroundColor: "{colors.surfaceMuted}"
    selectedBackground: "{colors.primary}"
    rounded: "{rounded.pill}"
---

# Design Direction

## Overview

Initial direction for BricoMission, written before any screen exists. Per-screen designs are produced through the `open-pencil` MCP and approved by the developer; once approved, those `.fig` files are the source of truth for their screens, and this file governs everything they do not define.

## Existing Design Assets

`design/openpencil/*.fig` files are created on demand (CLAUDE.md "No UI guessing" rule).

- `design/openpencil/bricomission_B2C_app.fig`, page **Home** (approved 2026-11-13, `web-pwa-shell`): frames Home (390x844, plus 360x780 and full-length checks), Language Selection, LanguageSelector open (bottom sheet), ServiceStatus (4 states). Read-back: `docs/design/web-pwa-shell.md`; JSX/PNG exports in `design/openpencil/web-pwa-shell/`. The app icon moved to page **Brand**.
- `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Keycloak** (approved 2026-11-13, `keycloak-login-theme`): Sign in (+ invalid credentials, 360x780 check), Create account (+ field errors), Email code (+ states), Message page (error, info, page expired) and Code email (HTML 600 wide + plain text). Read-back: `docs/design/keycloak-login-theme.md`; exports in `design/openpencil/keycloak-login-theme/`. Implemented as the Keycloak theme `infra/keycloak/themes/bricomission/` (plain CSS with the same tokens, not Tailwind).
- `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Web** (approved 2026-11-13, `homeowner-password-login`): Home header anonymous and signed in (account entry), 360x780 check with the compact language selector, Account sheet (open) and the sign-in problem page `/auth/error` (4 reasons). Read-back: `docs/design/homeowner-password-login.md`; JSX/PNG exports in `design/openpencil/homeowner-password-login/`.
- `design/openpencil/bricomission_B2C_app.fig`, page **Capture** (approved 2026-11-14, `kitchen-capture-draft`): Capture empty and filled (390x844), measurement keypad bottom sheet, 360x780 check, and state panels (keypad rules, photo tile states, alerts and save status). Read-back: `docs/design/kitchen-capture-draft.md`; JSX/PNG exports in `design/openpencil/kitchen-capture-draft/`.
- `design/openpencil/bricomission_B2C_app.fig`, page **Moodboard** (approved 2026-11-14, `moodboard-selection`): Moodboard empty and with items (390x844), 360x780 check (de/fi), and state panels (reference upload states, limit reached, Continue hints, alerts). Read-back: `docs/design/moodboard-selection.md`; JSX/PNG exports in `design/openpencil/moodboard-selection/` (plus `gallery-contact-sheet.png` of the 24 Style Gallery images). Design images are placeholders; the real images are the committed Style Gallery.
- `design/openpencil/bricomission_B2C_app.fig`, page **Brand** (approved 2026-11-14, `brand-logo-animation`): components `Logo/Wordmark` and `Logo/Lettermark` (from `design/logo/*.svg`, no dimension lines), the header logo spec (390 and 360), App icon 512 with its maskable safe-zone check, the apple-touch 180 preview, the favicon (light/dark, 16/32/48), the code email logo (and its images-blocked state), and the welcome splash final frames (lettermark @390 light/dark, wordmark @1280 light/dark and @768 light). Every other B2C page was recolored to the new palette in the same pass. Read-back: `docs/design/brand-logo-animation.md`; exports in `design/openpencil/brand-logo-animation/`. Logo sources and the animation choreography: `design/logo/` (the JPGs are reference only).
- `design/openpencil/bricomission_B2C_app.fig`, page **Generate** (approved 2026-11-14, `login-gate-claim`): Generate anonymous ready (390x844), Login Gate bottom sheet, owned Kitchen Project, the states panel (not ready / no draft, claiming, wrong role, claim failed, offline, draft expired, signed out, not found) and 360x780 checks (Nederlands) of Generate, the gate and the owned page. Read-back: `docs/design/login-gate-claim.md`; JSX/PNG exports in `design/openpencil/login-gate-claim/`. Capture and Moodboard step indicators became "of 3".
- `design/openpencil/bricomission_B2C_app.fig`, page **AI Results** (approved 2026-11-15, `controlnet-render`): render running (first, auto-started) and succeeded (390x844), the render states panel (queued, failed/interrupted, queue full, limit, uploads-only, offline, not found/signed out), the owned-page bottom bar change and a 360x780 check (Nederlands). Read-back: `docs/design/controlnet-render.md`; JSX/PNG exports in `design/openpencil/controlnet-render/`. Chat arrives later on the same page (`budget-chat-personas`).

Rules:

- Designs are English only. Every other locale comes from `apps/web/messages/<locale>.json`. Layouts must fit German and Finnish (~30 % longer): text wraps, the CTA is never truncated, no fixed-width text boxes.
- Approved non-token values (implemented as designed): header logo = SVG wordmark 140x22 (replaces the former 22/28 bold text wordmark); step and field-label titles 16/24 and 14/20 semibold; sheet title 18/24 semibold; 12 px gaps (hero, steps, bottom bar) and 12 px bottom-bar top padding; selector pill 44 high with 14 px side padding and 6 px gap; option rows 48 high with 12 px padding; globe badge 56; step icon circles 44 with 22 px icons; bottom-sheet overlay `#182231` at 40 % (`#18223166`). Shadows and radii use the tokens (`elevation.card`, `elevation.sheet`, `rounded.*`).
- Approved non-token values for the Keycloak pages (`keycloak-login-theme`): header 64 high; content padding 32/16/24 (32 bottom on Create account); inputs 52 high with 16 px side padding (code input 56 high, value 28/34 semibold, letter spacing 8); 2 px focus/error strokes; password toggle 44x44 with a 20 px icon; field error row gap 6 with a 16 px icon; form-level alert padding 16, gap 12, 1 px stroke in the state color (`danger`, `warning`, `primary`); badge 56 with a 26 px icon; text links 14/20 weight 500, underlined, in 44 px rows. Code email: 600 wide, outer padding 24, card radius 20 and padding 32, logo = PNG data URI 280x44 shown 140x22 with `alt="BricoMission"` (styled 22/28 bold `text` when images are blocked), code box 72 high with 34/40 bold `primary` and letter spacing 10.
- Approved non-token values for web sign-in (`homeowner-password-login`): header actions row gap 8; account entry 44x44 circle (anonymous `surfaceMuted` with a 20 px user icon; signed in `primary` with the initial 16/24 semibold white); below 375 px the language selector is a centered compact pill (side padding 10, gap 4, globe 16, chevron 14, label 12/16 semibold, full native name, never a code); account sheet gap 16, header row 52, avatar 56 with initial 22/28 semibold, display name 18/24 semibold, username 14/20 `textMuted`, sign-out secondary button 52 high with a 1 px `border` stroke and a 20 px icon; `/auth/error` content padding 32/16/24, badge 56 `secondary` with a 26 px `danger` icon, title 28/34 bold, actions gap 8, text link row 44 with a 16 px icon and gap 6.

- Approved non-token values for Capture (`kitchen-capture-draft`): back button 44 circle `surfaceMuted` with a 20 px arrow; content gap 32, intro gap 12; step bar 2 segments h 4 gap 4 (done `primary`, todo `border`); section titles 18/24 semibold; photo grid 2 flexible columns, gap 16 on both axes, 4:3 tiles with radius 20 (never fixed widths); remove control 44 hit area with a 32 `surface` circle, shadow `0 1 2 #0000001F`, 16 px icon, inset 4; add tile 1 px `border`, 24 px icon, label 14/20 semibold `primary`; upload progress track h 6; error tile 2 px `danger` stroke, padding 8, text 12/16 semibold, Retry/Remove 44 circles with 18 px icons; unit toggle two 48x44 options; measurement fields h 52, padding 12, radius 12, 3 columns gap 12. Keypad sheet: tabs container `surfaceMuted` padding 4, gap 4, radius 16, tabs h 52 radius 12 (label 14/20, value 12/16); step buttons 44; display digits 40/48 bold with a 2x40 `primary` caret and unit 20/32 semibold `textMuted`; keys 4x3, gap 8, h 56, radius 12, 1 px `border`, label 24/32 semibold; Clear 120x52 pill. The page never shows a measurement error state: the keypad is the only client-side validator.
- Approved non-token values for Moodboard (`moodboard-selection`): same header, step bar (both segments `primary`), content gaps, section titles, grids and upload tiles as Capture; counter 14/20 semibold `textMuted`; Moodboard Item and gallery tiles 4:3 radius 20 (item padding 4, gallery padding 8); source/style label pill `surface`, padding 8/2, 12/16 semibold `text` (upload label with a 12 px `image-up` icon); gallery badge 28 circle with a 16 px icon (selected `primary` + white `check`, unselected `surface` + `plus` with shadow `0 1 2 #0000001F`, disabled `surfaceMuted` + `textMuted`); selected gallery tile 3 px `primary` stroke (never color alone: badge plus stroke plus `aria-pressed`); style filter chips h 44, padding 16, gap 8, pill (selected `primary` + white 14/20 semibold, others `surfaceMuted` + `text`), the row scrolls horizontally and bleeds to the screen edge; disabled add tile `surfaceMuted` with no stroke; "Go to your kitchen" link 44 high, 16 px arrow, 14/20 semibold underlined `primary`.
- Approved non-token values for Generate and the owned project (`login-gate-claim`): step bar 3 segments (Capture 1 `primary` + 2 `border`, Moodboard 2 + 1, Generate 3 `primary`); content gap 24; summary card padding 16, gap 16, radius 20, `elevation.card`; section titles 16/24 semibold with an Edit link 44 high (min 44 wide), padding 0/8, 14/20 semibold underlined `primary`; thumbnail strip 3 equal cells h 60 radius 12, gap 8 (first 2 images plus a `surfaceMuted` `+n` cell 14/20 semibold `textMuted`); measurements row 16 px `ruler` icon + 14/20 text; divider 1 px `border`; CTAs h 52 with 20 px icons (`sparkles` primary filled, `receipt-text` secondary outlined); disabled CTAs `surfaceMuted` + 1 px `border` + `textMuted`; Login Gate sheet = account sheet pattern with a 44 `secondary` badge and a 22 px `shield-check`, footnote 14/20 centered `textMuted`; claiming state 24 px `loader` + 16/24 semibold centered; page alerts = Capture alert with a 44 px secondary pill action (Sign out, Try again with a 16 px `refresh-cw`); owned page header logo link 140x44; "Start a new kitchen project" row 44 with a 16 px `plus`.
- Approved non-token values for AI Results (`controlnet-render`): header back button 44 circle `surfaceMuted` (no logo, no step bar); content gap 24; before/after slider full content width with the Render's aspect (1216:832, 832:1216 or 1:1), radius 20, 2 px white divider, handle 40 white circle with shadow `0 1 2 #0000001F` and a 20 px `chevrons-left-right` in a 44 hit area, Before/After pills `surface` padding 8/2 with 12/16 semibold `text` inset 12; status card 240 wide, padding 16, gap 12, radius 16, `elevation.card`, 24 px `loader`/`hourglass` `primary`, indeterminate bar track h 6 `border` with an 80 px moving `primary` pill (static under reduced motion), the placeholder shows the dimmed `before`; photo picker thumbs 96x72 radius 12 gap 12, selected 3 px `primary` stroke + 24 `primary` badge with a 14 px white `check` inset 4; history thumbs 110x75 radius 12 gap 12, shown one 3 px `primary` stroke; bottom bar = Capture bar with primary `Generate again` (20 px `refresh-cw`) and secondary outlined `Back to my kitchen`; while a Render is active only the hint 14/20 centered and the disabled CTA. Owned page bar: primary `Generate my kitchen` / `See my designs`, disabled `Get my budget`, hint `Budgets: available soon` below.
- `design/openpencil/bricomission_B2C_app.fig`, frames `S1` to `S10` on the pages Capture, Moodboard, AI Results, Generate and Budget Tiers (approved 2026-11-14, `simulations-ux-overhaul`; read-back `docs/design/simulations-ux-overhaul.md`): measurements default to `cm`, wrapping Style Gallery chips, Results grouped by Simulation, the project page with My simulations, the Budget for the selected Simulation. Edit pages have no frames: they reuse Capture and Moodboard.
- Approved non-token values for Simulations (`simulations-ux-overhaul`): wrapping rows use `rowGap` equal to the column gap (chips 8, photo grid and tiles 12, thumbnails 8); Style Gallery chips h 44, padding 16, pill, 14/20 semibold, selected = `primary` fill + white label + 14 px `check`; Results status card p 16 gap 12 radius 16 with a determinate track h 6 (`border`, `primary` fill = n/N), photo tiles 4:3 radius 12 (110x82 at 390; done = 24 `primary` badge with a white 14 px `check`, running = 3 px `primary` stroke, queued = `surfaceMuted` + `border` + 20 `hourglass`); failed tile 2 px `danger` stroke, `circle-alert` 16 + 12/16 semibold label and a 44 high `Retry` pill whose label uses `text` (not `primary`, 4.3:1 on `surfaceMuted`); photo picker and Simulation history cards (p 12 gap 8 radius 16, thumbs 64x48 radius 8, shown = 3 px `primary` stroke + `aria-current`); project summary card with three 44 high rows (1 px `border` dividers, underlined `primary` 14/20 semibold edit links); SimulationCard p 16 gap 12 radius 20 `elevation.card`, 44x44 delete button with 20 px `trash-2` `danger`, `Selected` badge h 28 padding 10 `primary` fill with a white 12/16 semibold label and 14 px `check`, selected card 3 px `primary` stroke, partial failure 1 px `warning` stroke; delete dialog p 16 gap 16 radius 20 shadow `0 8 32 #0000001F` (`Delete simulation` h 52 `danger` fill); alerts p 16 gap 12, 1 px stroke in the state colour, radius 16, 20 px icon; Budget based-on card p 12 radius 16 with 48x36 thumbnails radius 8; quiet notes (style degraded, relabeled) 14/20 `textMuted`. 360x780: compact selector, slider 328x224, 8 photos as 3 flexible columns (101x76).
- Approved non-token values for the brand (`brand-logo-animation`): header logo 140x22 (Home, `/language`, `/auth/error`, every Keycloak page; Capture has no logo); app icon 512 white full-bleed with the lettermark 320x165 centered (corners 180 px from the center, inside the maskable circle r 205), apple-touch 180 with the lettermark 112x58 centered on white; favicon = lettermark at ~94 % of a square viewBox. Welcome splash palette (splash only, not tokens): light bg `#FFFFFF`, ink `#182231`, accent `#2968EC`, guides `rgba(41,104,236,.28)`, grid ink at 3.5 %/7.5 % every 24/96 px; dark bg `#0F172A`, ink `#F8FAFC`, accent `#3B82F6`, guides `rgba(59,130,246,.35)`, grid `#F8FAFC` at 3.5 %/7.5 %. Splash stage: lettermark below 768 px (full width minus 16 px gutters, max 62 % of the viewport height), wordmark from 768 px (32 px gutters, max 1152 wide, max 55 % high).

## Generated Concept Images

None. Not used in this project; design happens in OpenPencil.

## Product Feel

- Photo-first: the user's kitchen and the Renders are the hero; chrome stays quiet.
- Calm and trustworthy: the logo blue (`primary` `#2968EC`) for actions and the logo ink (`text` `#182231`) for text, warm neutrals for surfaces. Highlights (best price, new Bid, selected tier) use `primary` plus an icon or label, never color alone.
- Complexity hidden: one primary action per screen; technical terms (LLM, ControlNet, RAG) never appear in the Homeowner UI.

## Colors

- `primary` for primary actions, links, the logo corners and highlights (with an icon or label). There is no `accent` color (removed with the logo, 2026-11-14). `focus` equals `primary`; the 2 px ring keeps a 2 px offset, so there is always a background gap around primary-filled controls.
- Known limit: `primary` on `surfaceMuted` is 4.3:1, so it is allowed there only for icons and large text (for example the 34 px code digits), never for normal-size text. `apps/web/test/contrast.test.ts` checks the token pairs.
- Surfaces: `background` page, `surface` cards, `surfaceMuted` inputs and chips.
- Semantic colors only for states (success, warning, danger); never decorative.

## Typography

Inter with system fallbacks. Large, bold headings; 16px body minimum on mobile. Prices and measurements use tabular numerals and always show currency and units (e.g. `12.450,00 €`, `3,20 m`) formatted by locale.

## Layout

- Mobile first, single column, 16px side gutter, generous vertical spacing (24-40px between sections).
- Sticky bottom action bar for the main CTA on Homeowner flows.
- B2B and Admin dashboards: responsive; sidebar navigation at ≥ 1024px, tabs on mobile; data tables with card fallback on narrow screens.

## Shapes

Rounded, soft: 20px cards and images, pill buttons and chips, 12px inputs. No sharp corners on interactive elements.

## Components

Buttons (primary, secondary, text), cards, image carousel with before/after slider, chips (style, tier, persona), stepper for the capture flow, chat bubbles with Persona avatar and Prompt Macro chips, budget table with expandable Line Items and source citation, bid card (anonymous), status badges, toast/live alert for SSE, bottom sheet, data table, toggle (Payment Mode, Quota Flag), form fields with inline validation.

## Core Screens

From the PRD wireframe scope: Language Selection (conditional), Photo Upload + Measurements, Moodboard, AI Results & Chat (Persona dropdown), Budget Tiers, DIY Shopping List, Marketplace Bids (Homeowner), Contract View, B2B Dashboard, Bid Submission & Contract Acceptance, Admin Dashboard. Each screen is designed in OpenPencil before implementation.

## Responsive Baseline

Design at 390×844 first; verify at 360px, 768px, and 1280px. Touch targets ≥ 44×44px. Images never overflow; tables scroll horizontally inside their container.

## Accessibility Baseline

WCAG 2.2 AA: text contrast ≥ 4.5:1, visible `focus` ring, all actions keyboard-reachable, alt text for photos and Renders, live regions for SSE alerts, no information conveyed by color alone, respects `prefers-reduced-motion`. All strings localized; layouts tolerate 30 % longer text (German, Finnish).

## Do's and Don'ts

- Do show where every price comes from (Catalog citation on demand).
- Do keep Company identity hidden on Bids until acceptance.
- Don't add chat between Homeowner and Professional.
- Don't show raw model output, JSON, or technical errors to Homeowners.
- Don't invent screens: design them in OpenPencil first.

## Open Design Questions

- Logo and wordmark: resolved 2026-11-14 (`design/logo/`, page **Brand**).
- Dark mode: not in MVP. Only the welcome splash and the favicon follow `prefers-color-scheme`; pages and Keycloak stay light.
