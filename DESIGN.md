---
name: BricoMission
description: Calm, airy, photo-first renovation planner. Apple-like restraint, IKEA-like warmth and clarity.
designAssets:
  sourceOfTruth:
    - design/openpencil/bricomission_B2C_app.fig (page Home approved 2026-11-13; page Auth – Keycloak approved 2026-11-13; page Capture approved 2026-11-14; other screens added per screen via open-pencil MCP)
    - design/openpencil/bricomission_B2B_dashboard.fig (to be created)
    - design/openpencil/bricomission_admin.fig (to be created)
  generatedConcepts: []
colors:
  primary: "#1F4E79"
  primaryHover: "#173B5C"
  secondary: "#E8DCC8"
  accent: "#E07A3F"
  background: "#FAFAF8"
  surface: "#FFFFFF"
  surfaceMuted: "#F2F1ED"
  border: "#E2E0DA"
  text: "#1C1C1E"
  textMuted: "#6B6B70"
  success: "#2E7D4F"
  warning: "#B7791F"
  danger: "#C0392B"
  focus: "#2F80ED"
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

- `design/openpencil/bricomission_B2C_app.fig`, page **Home** (approved 2026-11-13, `web-pwa-shell`): frames Home (390x844, plus 360x780 and full-length checks), Language Selection, LanguageSelector open (bottom sheet), ServiceStatus (4 states) and App icon 512 (maskable). Read-back: `docs/design/web-pwa-shell.md`; JSX/SVG/PNG exports in `design/openpencil/web-pwa-shell/`.
- `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Keycloak** (approved 2026-11-13, `keycloak-login-theme`): Sign in (+ invalid credentials, 360x780 check), Create account (+ field errors), Email code (+ states), Message page (error, info, page expired) and Code email (HTML 600 wide + plain text). Read-back: `docs/design/keycloak-login-theme.md`; exports in `design/openpencil/keycloak-login-theme/`. Implemented as the Keycloak theme `infra/keycloak/themes/bricomission/` (plain CSS with the same tokens, not Tailwind).
- `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Web** (approved 2026-11-13, `homeowner-password-login`): Home header anonymous and signed in (account entry), 360x780 check with the compact language selector, Account sheet (open) and the sign-in problem page `/auth/error` (4 reasons). Read-back: `docs/design/homeowner-password-login.md`; JSX/PNG exports in `design/openpencil/homeowner-password-login/`.
- `design/openpencil/bricomission_B2C_app.fig`, page **Capture** (approved 2026-11-14, `kitchen-capture-draft`): Capture empty and filled (390x844), measurement keypad bottom sheet, 360x780 check, and state panels (keypad rules, photo tile states, alerts and save status). Read-back: `docs/design/kitchen-capture-draft.md`; JSX/PNG exports in `design/openpencil/kitchen-capture-draft/`.

Rules:

- Designs are English only. Every other locale comes from `apps/web/messages/<locale>.json`. Layouts must fit German and Finnish (~30 % longer): text wraps, the CTA is never truncated, no fixed-width text boxes.
- Approved non-token values (implemented as designed): wordmark 22/28 bold (h2 size, weight 700); step and field-label titles 16/24 and 14/20 semibold; sheet title 18/24 semibold; 12 px gaps (hero, steps, bottom bar) and 12 px bottom-bar top padding; selector pill 44 high with 14 px side padding and 6 px gap; option rows 48 high with 12 px padding; globe badge 56; step icon circles 44 with 22 px icons; bottom-sheet overlay `#1C1C1E` at 40 %. Shadows and radii use the tokens (`elevation.card`, `elevation.sheet`, `rounded.*`).
- Approved non-token values for the Keycloak pages (`keycloak-login-theme`): header 64 high; content padding 32/16/24 (32 bottom on Create account); inputs 52 high with 16 px side padding (code input 56 high, value 28/34 semibold, letter spacing 8); 2 px focus/error strokes; password toggle 44x44 with a 20 px icon; field error row gap 6 with a 16 px icon; form-level alert padding 16, gap 12, 1 px stroke in the state color (`danger`, `warning`, `primary`); badge 56 with a 26 px icon; text links 14/20 weight 500, underlined, in 44 px rows. Code email: 600 wide, outer padding 24, card radius 20 and padding 32, code box 72 high with 34/40 bold `primary` and letter spacing 10.
- Approved non-token values for web sign-in (`homeowner-password-login`): header actions row gap 8; account entry 44x44 circle (anonymous `surfaceMuted` with a 20 px user icon; signed in `primary` with the initial 16/24 semibold white); below 375 px the language selector is a centered compact pill (side padding 10, gap 4, globe 16, chevron 14, label 12/16 semibold, full native name, never a code); account sheet gap 16, header row 52, avatar 56 with initial 22/28 semibold, display name 18/24 semibold, username 14/20 `textMuted`, sign-out secondary button 52 high with a 1 px `border` stroke and a 20 px icon; `/auth/error` content padding 32/16/24, badge 56 `secondary` with a 26 px `danger` icon, title 28/34 bold, actions gap 8, text link row 44 with a 16 px icon and gap 6.

- Approved non-token values for Capture (`kitchen-capture-draft`): back button 44 circle `surfaceMuted` with a 20 px arrow; content gap 32, intro gap 12; step bar 2 segments h 4 gap 4 (done `primary`, todo `border`); section titles 18/24 semibold; photo grid 2 flexible columns, gap 16 on both axes, 4:3 tiles with radius 20 (never fixed widths); remove control 44 hit area with a 32 `surface` circle, shadow `0 1 2 #0000001F`, 16 px icon, inset 4; add tile 1 px `border`, 24 px icon, label 14/20 semibold `primary`; upload progress track h 6; error tile 2 px `danger` stroke, padding 8, text 12/16 semibold, Retry/Remove 44 circles with 18 px icons; unit toggle two 48x44 options; measurement fields h 52, padding 12, radius 12, 3 columns gap 12. Keypad sheet: tabs container `surfaceMuted` padding 4, gap 4, radius 16, tabs h 52 radius 12 (label 14/20, value 12/16); step buttons 44; display digits 40/48 bold with a 2x40 `primary` caret and unit 20/32 semibold `textMuted`; keys 4x3, gap 8, h 56, radius 12, 1 px `border`, label 24/32 semibold; Clear 120x52 pill. The page never shows a measurement error state: the keypad is the only client-side validator.

## Generated Concept Images

None. Not used in this project; design happens in OpenPencil.

## Product Feel

- Photo-first: the user's kitchen and the Renders are the hero; chrome stays quiet.
- Calm and trustworthy: deep blue for actions, warm neutrals for surfaces, one orange accent for highlights (best price, new Bid).
- Complexity hidden: one primary action per screen; technical terms (LLM, ControlNet, RAG) never appear in the Homeowner UI.

## Colors

- `primary` for primary actions and links only. `accent` sparingly: badges, live Bid alerts, selected tier.
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

- Logo and wordmark (placeholder text logo until provided).
- Dark mode: not in MVP.
