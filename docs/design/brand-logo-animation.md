# Design Read-Back: brand-logo-animation

Approved by developer on 2026-11-14.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, new page **Brand**, plus the recolored pages **Home**, **Auth – Keycloak**, **Auth – Web** and **Capture**. Designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Logo artwork: `design/logo/BM_lettermark.svg` and `design/logo/BricoMission_wordmark.svg` (source of truth for paths). The animations: `design/logo/bricomission_{lettermark,wordmark}_animation.html` (only the stage SVG, its CSS keyframes and the play logic are shipped; see the spec for the excluded preview scaffolding).
- Exports in `design/openpencil/brand-logo-animation/`:
  - `logo-wordmark.svg`, `logo-lettermark.svg`: UI logos **without dimension lines**, colors normalized to `#2968EC` / `#182231`, tight viewBox (`166.98 545.36 2420.08 380.51` and `771.14 433.85 1227.35 634.10`). Use these paths for the header, Keycloak and the email PNG.
  - `app-icon-512.svg` / `.png`, `app-icon-safe-zone.png`, `apple-touch-icon-180.svg`: approved icon artwork (render source for the PNG icons).
  - `favicon-preview-{light,dark}.svg`: the favicon at 16/32/48 on a light and a dark browser tab (visual check, not shipped).
  - `splash-{lm-light,lm-dark,wm-light-1280,wm-dark-1280,wm-light-768}.svg`, `splash-final-frames.png`: final frames of the splash (visual reference; coordinates rounded to whole units, so the shipped animation keeps the HTML files' exact paths).
  - `touch-icon-favicon-email.png`, `overview.png`.
- The other read-backs (`web-pwa-shell`, `keycloak-login-theme`, `homeowner-password-login`, `kitchen-capture-draft`) were re-exported with the new colors; their logo appears as an empty `Logo (wordmark SVG 140x22 …)` frame whose artwork is defined here.
- Designs are English only.

## Colors (replace the old tokens everywhere)

| Token | Old | New |
| --- | --- | --- |
| `primary` | `#1F4E79` | `#2968EC` |
| `primaryHover` | — | `#1F55C8` |
| `text` | `#1C1C1E` | `#182231` |
| `secondary` | `#E8DCC8` | `#E6EEFD` |
| `focus` | `#2F80ED` | `#2968EC` |
| `accent` | `#E07A3F` | removed |
| overlay | `#1C1C1E66` | `#18223166` |

`background`, `surface`, `surfaceMuted`, `border`, `textMuted` and the state colors are unchanged. The app UI stays light-only; only the splash and the favicon follow `prefers-color-scheme`.

## Header logo

| Item | Spec |
| --- | --- |
| Artwork | `logo-wordmark.svg`, inline SVG, `role="img"`, accessible name `BricoMission`, `data-testid="wordmark"`, no dimension lines |
| Size | 140×22, vertically centered in the 64 px header, left edge at the 16 px gutter |
| Screens | Home, `/language`, `/auth/error` (all states, 390 and 360) and every Keycloak page (sign-in, errors, create account, email code, message pages). Capture keeps its back button and has no logo |
| 360 px | logo 140 + HeaderActions 178 (compact selector `Nederlands` 126 + gap 8 + account 44) fit in 328 px with 10 px to spare; 44 px targets kept |

## Welcome splash (page Brand, final frames)

| Frame | Viewport | Logo box | Background |
| --- | --- | --- | --- |
| Splash – lettermark final frame @390 light | 390×844 | lettermark with dimension lines, 358×202 centered (full width minus 16 px gutters) | `#FFFFFF` |
| … @390 dark | 390×844 | same | `#0F172A` |
| Splash – wordmark final frame @1280 light | 1280×800 | wordmark with dimension lines, 1152×255 centered (`max-width` 1152) | `#FFFFFF` |
| … @1280 dark | 1280×800 | same | `#0F172A` |
| Splash – wordmark final frame @768 light | 768×1024 | wordmark 704×156 centered (32 px gutters) | `#FFFFFF` |

- Variant: lettermark below 768 px, wordmark from 768 px. The logo box never exceeds 62 % (lettermark) / 55 % (wordmark) of the viewport height.
- Blueprint grid centered on the viewport: 1 px lines every 24 px (ink at 3.5 %) and every 96 px (ink at 7.5 %).
- Light: ink `#182231`, accent `#2968EC`. Dark: ink `#F8FAFC`, accent `#3B82F6`, bg `#0F172A` for both variants. Dimension lines use the ink color and stay in the final frame; the wordmark's construction guides do not.
- Behavior (normative, from the spec): once per tab (`sessionStorage` `bm.splash.seen`), tap/click/any key skips, reduced motion shows this final frame for about 1 s, hard cap 3.2 s (1.0 s reduced), no splash without JavaScript, overlay `aria-hidden`.

## App icon and manifest

- 512×512 white full-bleed square; lettermark (ink `#182231`, accent `#2968EC`, no dimension lines) 320×165 centered (x 96, y 173.5). Its corners sit 180 px from the center, inside the 80 % maskable safe circle (r 205), checked in **App icon – safe zone check**.
- Same artwork for `icon-192.png`, `icon-512.png` and `icon-512-maskable.png` (scaled), and `apple-touch-icon.png` 180 (lettermark 112×58 centered on white; iOS applies the rounding).
- Manifest and viewport `theme_color` `#2968EC`; `background_color` `#FAFAF8`.

## Favicon

- `/icons/favicon.svg`: lettermark in a square viewBox (logo centered, ~94 % of the width). Light: ink `#182231`, accent `#2968EC`. Dark (`prefers-color-scheme: dark`): ink `#F8FAFC`, accent `#3B82F6`. Checked at 16/32/48 on `#FFFFFF` and `#202124` tabs.
- `/favicon.ico`: PNG entries 16, 32, 48 with the light colors. Keycloak serves the same pair.

## Code email logo

- PNG data URI rendered from `logo-wordmark.svg` at 280×44 (@2x), displayed `width="140" height="22"`, `alt="BricoMission"`, on the card's left edge where the text wordmark was.
- Images blocked: the alt text shows styled 22/28 bold `#182231`.
- No remote images.

## Accessibility

- OpenPencil lint: 0 errors, 0 warnings on page Brand (info-only notes about imported vector groups).
- `primary` `#2968EC`: 4.9:1 on white and 4.7:1 on `background` `#FAFAF8`; white CTA labels on `primary` 4.9:1; `primaryHover` `#1F55C8` 6.6:1.
