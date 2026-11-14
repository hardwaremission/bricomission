# Feature Implementation Spec: New BricoMission logo everywhere and a one-time welcome animation

## Source Feature

- `id`: brand-logo-animation (GitHub issue #19)
- `area`: brand
- `depends_on`: web-pwa-shell, keycloak-login-theme, homeowner-password-login, kitchen-capture-draft (all `accepted`)
- `status`: not_started at planning time (2026-11-14)
- `source`: `feature_list.json`; developer decisions of 2026-11-14 (listed under Decisions)

## Goal

Replace the placeholder text wordmark and the "BM + orange bar" app icon with the logo the developer supplied in `design/logo/`. This covers the web headers, PWA icons, favicon, Keycloak pages and the code email. The logo's blue `#2968EC` and ink `#182231` become the app-wide primary and text colors, and the orange accent is retired. On the first page load of a browser session, the web app plays the supplied construction animation once and then reveals the page. The lettermark animation plays below 768 px viewport width and the wordmark animation at 768 px and above, in the system light or dark palette.

## Non-Goals

- No app-wide dark mode. Only the splash and the favicon follow `prefers-color-scheme`. Pages and Keycloak stay light.
- No new screens, routes, API or i18n strings. The splash has no text.
- No changes to the B2B or Admin `.fig` files (they do not exist yet).
- No splash on Keycloak pages and none in the email. No replay control, sound or confetti.
- The preview scaffolding of the HTML files is not shipped: Tailwind CDN, Google Fonts, the header status tags and pulse beacon, the Repetir/Pausar/Modo oscuro controls, their JS and status timers, `.is-paused`, `.mono-tag`, `.control-bar`. The JPG renders are reference only and are not shipped.
- No change to `background`, `surface*`, `border`, `textMuted`, `success`, `warning` or `danger`. The contrast test below proves they still pass.

## Decisions

1. **Palette** (DESIGN.md and every consumer):
   - `primary` `#1F4E79` -> `#2968EC`. White on it is 4.9:1. It is 4.7:1 on `background` and 4.9:1 on `surface`.
   - `primaryHover` -> `#1F55C8` (white on it is 6.6:1).
   - `text` `#1C1C1E` -> `#182231`.
   - `focus` `#2F80ED` -> `#2968EC`. The old focus color is visually the same hue as the new primary, so it is unified. The ring stays 2 px with a 2 px offset, so there is always a background gap around primary-filled controls. Contrast is 4.7:1 on `background` (needs 3:1).
   - `secondary` `#E8DCC8` -> `#E6EEFD` (blue tint). It is used for the step circles, the badges and the globe/mail badges.
     - Measured: `primary` icons on it are 4.2:1 (graphics need 3:1).
     - The `danger` `#C0392B` icon in the error badge is 4.7:1.
     - `text` on it is above 14:1.
     - No adjustment is needed. These pairs are included in `contrast.test.ts`.
   - `accent` is **removed** (token, CSS variable and docs). Former usages:
     - The app-icon bar is replaced by the lettermark's two blue pieces.
     - DESIGN.md's planned highlights (best price, new Bid, selected tier) use `primary` plus an icon or label from now on. Never color alone.
   - The overlay `#1C1C1E66` becomes `#18223166`.
   - Known limit: `primary` on `surfaceMuted` is 4.3:1. It is allowed for icons and large text (34 px code digits) only, never for normal-size text.
2. **Logo source of truth.** `design/logo/BM_lettermark.svg` and `design/logo/BricoMission_wordmark.svg` hold the glyph and accent paths. The wordmark SVG's `#192131`/`#2868e8` are normalized to `#182231`/`#2968EC`.
   - The in-app logo never shows dimension lines.
   - Tight in-app viewBoxes, rounded outward: lettermark `771 434 1228 634`, wordmark `166 545 2421 377`. The implementer confirms them with `getBBox()` and records the final values.
3. **Splash = blueprint drafting scene.** The blueprint grid background is **part of the splash**. The animation is a technical drawing being set out: dimension lines, setting-out guides, then pieces snapping onto a drafting grid. Without the grid, the guides and dimension lines float on a blank page. The grid is static.
   - Light palette: bg `#FFFFFF`, grid minor/major `rgba(24,34,49,.035/.075)`, ink `#182231`, accent `#2968EC`, guide `rgba(41,104,236,.28)`.
   - Dark palette: bg `#0F172A` for both variants (the wordmark HTML's `#0B1120` is dropped so the background does not change across 768 px), grid `rgba(248,250,252,.035/.075)`, ink `#F8FAFC`, accent `#3B82F6`, guide `rgba(59,130,246,.35)`.
4. **Once per browser session = `sessionStorage`** key `bm.splash.seen`. It is set as soon as the decision is made, so a reload during the animation does not replay it. `sessionStorage` is per tab, so a new tab or window plays it again; a reload, client navigation or Keycloak round trip in the same tab does not. If storage is unavailable (it throws), there is no splash.
5. **Reduced motion: static final frame (developer decision 2026-11-14).** With `prefers-reduced-motion: reduce`, the splash still shows once per tab, with the same variant and theme rules. It shows the **final frame** with no animation at all:
   - pieces at opacity 1 with no transform;
   - dimension lines fully drawn;
   - construction guides not shown (they end invisible in the HTML).
   It stays for **1.0 s**, then disappears at once with no fade. It can still be dismissed with a tap or key. Cap: a zero-duration CSS step to hidden at 1.0 s, plus a script fallback at 1.5 s.
6. **Timing, from the HTML.**
   - Lettermark: pieces finish at 1.96 s, hold 0.30 s, fade out 0.35 s, gone at about 2.6 s.
   - Wordmark: corners finish at 2.50 s, hold 0.30 s, fade out 0.35 s, gone at about 3.15 s.
   - Hard cap: the exit is a CSS animation, so the overlay is hidden by 3.2 s even if no script timer ever fires. A script fallback also removes it at 3.5 s.
   - A `pointerdown` or `keydown` dismisses it at once (fade 0.15 s).
7. **No-flash SSR.** The splash markup is always server-rendered in the root layout and is hidden by default (`display:none`). A tiny inline script in `<head>` runs before first paint. It sets `<html data-splash="play">` only when the splash should play, and later removes it.
   - `<html suppressHydrationWarning>` covers that one attribute.
   - Variant choice is pure CSS (`@media (min-width: 768px)`), and so is the theme (`prefers-color-scheme`). No React state is involved and there is no hydration mismatch.
   - Without JavaScript there is no splash.
8. **Accessibility.**
   - The overlay is `aria-hidden="true"` with no focusable content.
   - The SVGs have no `<title>`, `role` or label.
   - The page underneath is rendered normally and is never inert, so its content is announced once.
   - `body` scroll is locked only while `data-splash="play"`.
9. **E2E determinism (no production test hook).** A new shared fixture `apps/web/e2e/fixtures.ts` extends `@playwright/test` with an option `skipSplash` (default `true`).
   - When the option is on, it calls `context.addInitScript(() => { try { sessionStorage.setItem('bm.splash.seen', '1') } catch {} })` on the default `context`. The init script runs before the inline head script on every document, so the splash never plays.
   - It also exports `newContext(browser, options)` with the same init script, for specs that create contexts manually.
   - Every existing spec imports `test`/`expect` from `./fixtures`. Every `browser.newContext(` call is routed through the helper; the implementer greps to confirm none is left.
   - `e2e/splash.spec.ts` sets `test.use({ skipSplash: false })` and varies `reducedMotion`/`colorScheme`/`viewport` itself.
   - `playwright.config.ts` does **not** change `reducedMotion`.
10. **Code email logo = data-URI PNG + styled alt text.**
    - Rejected: inline SVG (stripped by Gmail and Outlook), a hosted URL (not offline, developer said no) and CID (Keycloak's email sender cannot attach inline parts without a custom SPI).
    - The `<img src="data:image/png;base64,…" alt="BricoMission" width/height>` shows in Mailpit, Apple Mail and Thunderbird. Clients that block data URIs show the alt text styled 22/28 bold ink, which is the text fallback.
    - The PNG has an opaque white background (it does not vanish in dark-forced clients) and is rendered at 3x the design size.
    - The plain-text part is unchanged.
11. **App icon** (192, 512, 512 maskable, apple-touch 180): white full-bleed background with the lettermark (ink glyphs, blue pieces) centered inside the 80 % maskable safe circle. At 512 that is about 340 px wide; the approved frame decides. `theme_color` and the viewport `themeColor` are `#2968EC`. `background_color` stays `#FAFAF8`.
12. **Favicon.** `public/icons/favicon.svg` is the lettermark in a square viewBox. Its `<style>` uses `@media (prefers-color-scheme: dark)`: ink `#182231` and accent `#2968EC` in light, `#F8FAFC` and `#3B82F6` in dark. `public/favicon.ico` holds PNG entries at 16, 32 and 48. Keycloak gets the same pair in its theme resources.
13. **No new dependencies.**
    - PNG and ICO rendering reuses the existing Playwright-in-Docker script pattern. The ICO is written by hand: a 6-byte header, then 16-byte entries pointing at the PNG payloads.
    - Animation CSS lives in a CSS Module, which also scopes the `@keyframes` names.

## Job Story

When I open BricoMission for the first time in a session, I want to see the brand assemble itself and then land on the page I asked for. I also want the same logo on every screen, sign-in page and email, so the product feels coherent and trustworthy.

## Users And Permissions

Everyone (anonymous, Homeowner, Professional, Admin) sees the same splash and logo. No permission changes.

## Acceptance Scenarios

### Scenario 1: Lettermark splash on a phone, once
Given a new tab at 390x844 with no reduced motion and light scheme
When the visitor opens `/`
Then `html[data-splash="play"]` is present from the first paint. The lettermark stage is visible and the wordmark stage is not. The overlay background is `#FFFFFF` with the blueprint grid. Dimension lines draw, pieces snap in and the blue corners lock.
And by 3.2 s at the latest the attribute is gone, the overlay is not visible and the Home `h1` is visible and clickable.
And a reload, a client navigation to `/kitchen-projects/new` and a visit to `/language` in the same tab show no splash. The attribute is absent immediately after `domcontentloaded`.

### Scenario 2: Wordmark splash on wide screens
Given a new tab at 1280x800 (and at 768x1024)
When the visitor opens any page (`/`, `/language`, `/auth/error`)
Then the wordmark stage, with construction guides, plays once and the lettermark stage is hidden. At 767 px wide the lettermark plays.

### Scenario 3: Dark system theme
Given `colorScheme: 'dark'`
When the splash plays
Then the overlay background is `rgb(15, 23, 42)`, the ink pieces are `#F8FAFC` and the accents are `#3B82F6`. After the splash, the page is the normal light UI.

### Scenario 4: Reduced motion and no JavaScript
Given `reducedMotion: 'reduce'` at 390 px (and at 1280 px)
When the visitor opens `/`
Then the splash shows the final static frame of the lettermark (wordmark at 1280), in the theme's palette.
And the overlay and its pieces have computed `animation-name: none` (except the zero-duration exit step), pieces at opacity 1.
And the overlay is gone after about 1.0 s, at most 1.5 s, and `sessionStorage['bm.splash.seen']` is `'1'`. A reload shows nothing.
And with JavaScript disabled there is no splash and the page renders.

### Scenario 5: Never blocks
Given the splash is playing
When the visitor taps or presses a key
Then the overlay disappears within 0.3 s.
And with Playwright `page.clock` frozen (no JS timers fire), the overlay's computed `visibility` is `hidden` by 3.5 s (the CSS cap). With reduced motion it is hidden by 1.5 s.

### Scenario 6: Offline, no external requests, no hydration errors
Given the splash plays on `/`
Then every request the page makes is same-origin, and there are no console errors or hydration warnings.
And after the service worker controls the page (sw `v3`), an offline reload in a new tab still plays the splash from the cache.

### Scenario 7: New palette and logo in the web app
Given any web page
Then the headers of Home, `/language` and `/auth/error` show the SVG wordmark (accessible name `BricoMission`, no dimension lines) at the approved size. Capture keeps its back button and has no logo.
And primary buttons, links and focus rings use `#2968EC`, and text is `#182231`.
And no `#1F4E79`, `#173B5C`, `#E07A3F`, `#E8DCC8`, `#1C1C1E` or `#2F80ED` remains in `apps/web/src`, `apps/web/public` or `infra/keycloak/themes`.
And 360x780 de/fi/nl headers still fit, with no overflow and 44 px targets.

### Scenario 8: PWA icons and favicon
Given the manifest
Then `theme_color` is `#2968EC`, and the 192, 512 and 512-maskable icons and the 180 apple-touch icon are the new white lettermark icons.
And `<link rel="icon">` serves `/icons/favicon.svg` (`image/svg+xml`) and `/favicon.ico`.
And Chromium installability errors are `[]`.

### Scenario 9: Keycloak pages and code email
Given the Keycloak sign-in, create-account, email-code and message pages
Then the header shows the inline SVG wordmark (`data-testid="wordmark"`, accessible name `BricoMission`), the new colors and the favicon. No external requests are made.
And the code email HTML contains `<img` with `src="data:image/png;base64,` and `alt="BricoMission"`, uses the new colors, and the text part still carries the 6-digit code on its own line.

## Repository Research

### Files Inspected

- `design/logo/*.svg` and `design/logo/*_animation.html`: paths, choreography (`--d`, `--len`, keyframes, easings) and palettes. `design/logo/` is untracked and must be committed with this feature.
- `DESIGN.md`: tokens, `accent` usage text, the open question "Logo", "Dark mode: not in MVP".
- `apps/web/src/app/{layout.tsx,globals.css,manifest.ts,page.tsx,language/page.tsx,auth/error/page.tsx}` and `src/components/Wordmark.tsx` (text wordmark).
- `apps/web/src/components/{LanguageSelector,AccountEntry}.tsx` and `capture/MeasurementKeypad.tsx`: hard-coded overlay `#1C1C1E66`.
- `apps/web/scripts/render-icons.ts` (Playwright PNG pattern), `public/icons/*`, `public/sw.js` (icons cache-first, `VERSION = 'v2'`), `src/proxy.ts` (matcher already excludes `/icons/` and `/favicon.ico`), `next.config.ts` (no CSP).
- `apps/web/test/{tokens,manifest}.test.ts` (tokens test requires >= 14 colors), `e2e/{pwa,keycloak-theme,layout}.spec.ts`, `e2e/support.ts`, `playwright.config.ts` (single project mobile-390).
- `infra/keycloak/themes/bricomission/login/{template.ftl,resources/css/bricomission.css}`, `email/html/code-email.ftl`, `compose.yaml` (keycloak image `…-theme1`), `init.sh` (theme check matches the resources path only, so it is unaffected), `scripts/keycloak-smoke.sh` and `e2e/support.ts` (the code is read from the text part, so the base64 cannot collide).
- `docs/design/{web-pwa-shell,keycloak-login-theme,homeowner-password-login,kitchen-capture-draft}.md`.

### Existing Patterns To Follow

- Tokens live in the DESIGN.md front matter, are mirrored in the `@theme` of `globals.css`, and are kept in sync by `tokens.test.ts`. The Keycloak CSS mirrors them as `--bm-*`.
- Committed generated assets come with a re-run script in the pinned `web-e2e` image.
- Implement from the approved OpenPencil read-back only (UI gate).

### Current Gaps

- No favicon at all. No `prefers-reduced-motion` handling anywhere. No app-level loading screen exists (nothing to replace beyond the splash).

## Technical Approach

- **Logo data**: `apps/web/src/components/brand/logo-paths.ts` exports the `LETTERMARK` and `WORDMARK` glyph, dot and accent shapes plus their viewBoxes, copied verbatim from `design/logo/*.svg`. Components:
  - `Wordmark.tsx` is rewritten as `<svg role="img" aria-label="BricoMission" data-testid="wordmark">` with ink and primary fills from CSS variables and the approved height.
  - `Lettermark.tsx` for reuse.
- **Splash**: `src/components/splash/WelcomeSplash.tsx` (server component) and `WelcomeSplash.module.css`, rendered as the first child of `<body>` in `layout.tsx`.
  - Two stages ported from the HTML `#bm-stage` and `#wm-stage`, with the original viewBoxes including dimension lines and guides. Each piece keeps its class role and `--d`/`--len`.
  - Keyframes are copied verbatim. They run under `:global(html[data-splash='play'])` instead of `.is-playing`.
  - Exit animations get per-variant delays (Decision 6). Light and dark variables come from Decision 3.
  - A `@media (prefers-reduced-motion: reduce)` block sets every piece to its final state with `animation: none` and hides the guides. The only animation left is the zero-duration exit step at 1.0 s (Decision 5).
  - `splash-script.ts` exports the inline script string, rendered in `<head>` of `layout.tsx`. Its logic:
    1. Read the flag and check that storage is available (Decision 4), then set the attribute. Reduced motion no longer skips the splash.
    2. Remove it on the overlay's exit `animationend`, on `pointerdown`/`keydown` (capture phase, which also adds a quick-dismiss class) or after the fallback (3.5 s; 1.5 s under reduced motion).
    3. Remove its listeners afterwards.
  - The script is under 1 KB, with no imports.
- **Assets**: `scripts/render-icons.ts` becomes `scripts/render-brand-assets.ts` (same Docker command). It renders from the approved exports in `design/openpencil/brand-logo-animation/`: `public/icons/icon-{192,512,512-maskable}.png`, `apple-touch-icon.png`, `public/favicon.ico`, the Keycloak `login/resources/img/favicon.{svg,ico}` copies, and the email logo PNG as base64. The base64 is written between `<#-- bm-email-logo:begin/end -->` markers in `code-email.ftl`. `public/icons/favicon.svg` is hand-written from `logo-paths`.
- **Keycloak**: `login/bm-logo.ftl` macro with the inline wordmark SVG, used in `template.ftl` (replaces `<p class="bm-wordmark">`); `<link rel="icon">` tags; `--bm-*` colors; `.bm-wordmark` sized per design. Bump the compose image tag to `…-theme2`. This needs `docker compose up -d --build --wait keycloak`, not a realm reset.
- **SW**: `VERSION = 'v3'`, precache `/icons/favicon.svg` and `/favicon.ico`, and treat `/favicon.ico` as cache-first.

## Expected File Changes

- `design/logo/**`: commit as received (sources; the JPGs are reference only).
- `DESIGN.md`: tokens (Decision 1, `accent` removed), Colors / Product Feel text, assets list (page **Brand**), non-token values (logo sizes, splash), Open Design Questions (logo resolved; dark mode except splash and favicon).
- `apps/web/src/app/globals.css`, `layout.tsx` (themeColor, icons metadata, inline script, `suppressHydrationWarning`, `<WelcomeSplash/>`), `manifest.ts`.
- `apps/web/src/components/Wordmark.tsx` (modify); `brand/{logo-paths.ts,Lettermark.tsx}` and `splash/{WelcomeSplash.tsx,WelcomeSplash.module.css,splash-script.ts}` (create).
- `apps/web/src/components/{LanguageSelector,AccountEntry}.tsx`, `capture/MeasurementKeypad.tsx`: overlay color.
- `apps/web/scripts/render-icons.ts` becomes `render-brand-assets.ts`; `public/icons/*` regenerated; `public/icons/favicon.svg`, `public/favicon.ico` (create); `public/sw.js`.
- `apps/web/e2e/fixtures.ts` (create: `skipSplash` option and the `newContext` helper); every existing `e2e/*.spec.ts` imports from it (mechanical); `e2e/splash.spec.ts` (create); `e2e/pwa.spec.ts`, `e2e/keycloak-theme.spec.ts` (theme color, wordmark accessible name, email logo). `playwright.config.ts` is unchanged.
- `apps/web/test/tokens.test.ts` (threshold 13, assert no `accent`), `manifest.test.ts`. Create:
  - `test/contrast.test.ts`: WCAG ratios for the pairs in Decision 1 plus `text`/`textMuted`/`danger`/`warning`/`success` on `background`, `surface` and `surfaceMuted`.
  - `test/brand-assets.test.ts`:
    - logo-paths equal the design SVG paths;
    - splash pieces equal the HTML `d` + class + `--d` values;
    - Keycloak `bm-logo.ftl` paths are equal too;
    - the PNG sizes from IHDR are right;
    - the ICO directory has 16/32/48 entries;
    - the email data URI decodes to a PNG;
    - favicon.svg has both palettes;
    - no `http(s)://` in the splash files.
  - `test/splash-script.test.ts`: run the script string with fake `sessionStorage` and `matchMedia`. Cases:
    - first visit: plays;
    - seen: no splash;
    - reduced motion: plays with the 1.5 s fallback;
    - storage throws: no splash.
- `infra/keycloak/themes/bricomission/login/{template.ftl,bm-logo.ftl,resources/css/bricomission.css,resources/img/favicon.svg,resources/img/favicon.ico}`, `email/html/code-email.ftl`; `compose.yaml` (theme tag).
- Docs: see below; `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes. Every existing B2C page changes colors, and the logo replaces the wordmark. There are new splash frames. The UI gate applies. Implement strictly from the approved re-exports. The expected new read-back is `docs/design/brand-logo-animation.md`, plus the refreshed read-backs listed below.

### Design Brief For The OpenPencil Step (orchestrator, `design/openpencil/bricomission_B2C_app.fig`)

1. **Variables/styles**:
   - `primary` `#2968EC`, `primaryHover` `#1F55C8`, `secondary` `#E6EEFD`, `text` `#182231`, `focus` `#2968EC`, overlay `#18223166`.
   - Delete `accent`.
   - Leave the other tokens unchanged.
   - Re-color every `secondary` fill: step circles, globe badge, Keycloak/auth-error badges, mail badge.
2. **New page "Brand"**:
   - Components `Logo/Wordmark` and `Logo/Lettermark`, imported from `design/logo/*.svg` with the dimension lines removed and the colors normalized.
   - **Header logo spec**: height and width at 390 and at 360 with the compact selector (de/fi/nl). The logo must fit beside `LanguageSelector` and `AccountEntry`. The current text is about 140 px wide.
   - **App icon 512** (white, lettermark), its maskable safe-zone check frame, and the apple-touch 180 preview.
   - **Favicon** light and dark at 16/32/48.
   - **Code email logo** at its display size, plus an "images blocked" state showing the styled alt text.
   - **Splash** frames showing the final frame with grid, dimension lines and stage sizing:
     - Lettermark @390x844 light and dark.
     - Wordmark @1280x800 light and dark.
     - Wordmark @768x1024 light.
     - Optional mid-animation keyframe.
   - The final frames double as the reduced-motion static frame. Guides are hidden in them.
   - The motion itself is the HTML and is not redesigned.
3. **Page Home**:
   - Re-color every frame and replace the wordmark: Home, full length, 360 check, Language Selection, LanguageSelector open, ServiceStatus.
   - Replace App icon 512 with the new icon or point to Brand.
4. **Page Auth – Keycloak**:
   - The header logo on every frame and the new colors.
   - The Code email frame gets the image logo.
5. **Page Auth – Web**: Home header anonymous and signed in, the 360 check, the Account sheet and `/auth/error` (all 4 reasons). Same changes.
6. **Page Capture**: re-color only. Confirm that it has no logo (back button stays).
7. **Re-export**:
   - Overwrite the JSX/PNG/SVG in `design/openpencil/{web-pwa-shell,keycloak-login-theme,homeowner-password-login,kitchen-capture-draft}/`.
   - Update the token tables and wordmark rows of the four `docs/design/*.md`, adding "re-approved by developer on <date> (brand-logo-animation)".
   - Create `design/openpencil/brand-logo-animation/` (`wordmark.svg`, `lettermark.svg`, `app-icon-512.svg/png`, `favicon-*.png`, `email-logo.png`, `splash-*.png`, `overview.png`, JSX) and `docs/design/brand-logo-animation.md` with "approved by developer on <date>".
   - Accessibility lint must report 0 issues.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Splash (inline script, data attribute, CSS module, session flag, reduced-motion static frame), brand components, favicon, `render-brand-assets.ts`, sw `v3`, theme color, the E2E `fixtures.ts` splash skip.
- `AGENTS.md`: update.
  - One line under the E2E bullet: "E2E specs import `test` from `e2e/fixtures.ts`, which pre-sets `sessionStorage['bm.splash.seen']` so the welcome splash never plays; create extra contexts with its `newContext`; `e2e/splash.spec.ts` opts out with `skipSplash: false`."
  - The brand-asset regeneration command.
- `DESIGN.md`: update (see Expected File Changes).
- `docs/design/*.md`: as in the Design Brief.
- `docs/risks-and-open-questions.md`: add that data-URI email images can be blocked (alt fallback) and may raise spam scores; and that the splash replays in each new tab (sessionStorage scope).
- `CONSTRAINTS.md`: not needed (the file does not exist; the rules live in AGENTS.md and DESIGN.md).

## Implementation Plan

1. Gate: wait for the approved re-exports and `docs/design/brand-logo-animation.md`. Commit `design/logo/`.
2. Tokens: DESIGN.md, `globals.css`, Keycloak CSS, email inline colors, overlay, manifest, viewport. Add the contrast and tokens tests.
3. Logo: `logo-paths.ts`, `Wordmark`, `Lettermark`, headers. Keycloak `bm-logo.ftl` and template.
4. Assets: render script, icons, favicon SVG and ICO, Keycloak favicon, email data URI; sw `v3`; metadata icons.
5. Splash: script, component, CSS port, layout wiring.
6. Tests: unit, then E2E (`splash.spec.ts` and the updated specs, with `reducedMotion` in the config).
7. Rebuild `web` and `keycloak`, then run the gates. Update the docs, `PROGRESS.md` and `feature_list.json`.

## Implementation Tasks

- [ ] Commit `design/logo/`; check the read-back exists and is approved.
- [ ] Token swap everywhere, plus `contrast.test.ts` and `tokens.test.ts`.
- [ ] `logo-paths.ts`, `Wordmark`/`Lettermark`, Home, `/language` and `/auth/error` headers.
- [ ] Keycloak `bm-logo.ftl`, template, CSS, favicon, `-theme2` tag.
- [ ] `render-brand-assets.ts`: PNG icons, ICO, email base64; `favicon.svg`; metadata; `sw.js` v3.
- [ ] `splash-script.ts`, `WelcomeSplash` and CSS module, `layout.tsx`.
- [ ] `brand-assets.test.ts`, `splash-script.test.ts`, `e2e/fixtures.ts` plus the spec imports and the `newContext` routing, `splash.spec.ts`, updated pwa/keycloak specs.
- [ ] Docs, `PROGRESS.md`, `feature_list.json` evidence.

## Verification Plan

- `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r test`. The lockfile must stay unchanged (no new dependencies).
- `docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" web-e2e node scripts/render-brand-assets.ts`. Re-running it gives byte-identical output (`git status` clean).
- `docker compose up -d --build --wait keycloak web`, then `./init.sh` exit 0.
- `pnpm test:e2e`: all pass.
  - New `splash.spec.ts` (Scenarios 1-6): 390, 767, 768 and 1280 px; light and dark; reduced motion static frame for about 1 s; JS disabled; tap dismiss; frozen-clock caps (3.5 s, and 1.5 s with reduced motion); same-origin request log; console clean; offline new tab.
  - Updated pwa and keycloak specs (Scenarios 7-9).
  - Static check: `rg -n "from '@playwright/test'" apps/web/e2e` matches only `fixtures.ts` (plus `import type`), and `rg -n "browser.newContext\(" apps/web/e2e` matches only `fixtures.ts`.
- `bash scripts/web/lighthouse-pwa.sh` (installable) and `./scripts/keycloak-smoke.sh` exit 0.
- Grep: `rg -i '1f4e79|173b5c|e07a3f|e8dcc8|1c1c1e|2f80ed' apps/web/src apps/web/public infra/keycloak/themes DESIGN.md` gives no matches. `rg 'https?://' apps/web/src/components/splash` gives none.
- Manual (developer):
  - Compare the splash side by side with `design/logo/*_animation.html` at 390 and 1280, light and dark.
  - Mailpit HTML view shows the logo.
  - Android/desktop install shows the new icon.
  - The browser tab shows the favicon in light and dark OS themes.

## Evidence To Capture

Test counts per package; render-script idempotence; `./init.sh` output; E2E totals and splash test names; screenshots `apps/web/test-results` of the splash final frames (390 light and dark, 1280 light and dark) and of the Keycloak header; the Mailpit HTML snippet (`<img … alt="BricoMission"`); Lighthouse installable result; the grep results; final viewBoxes and the header logo size used.

## Validator Checklist

- [ ] Implementation matches `docs/design/brand-logo-animation.md` and the refreshed read-backs; the developer approval date is present.
- [ ] Scenarios 1-9 pass. The splash never exceeds 3.2 s. With reduced motion it shows only the static final frame for about 1 s.
- [ ] No preview scaffolding, CDN, Google Fonts or remote URLs shipped. No new dependencies.
- [ ] No hydration warnings. Page content is announced once (the overlay is `aria-hidden`).
- [ ] `accent` is gone; the contrast test passes; no old hex remains.
- [ ] The E2E splash skip (`e2e/fixtures.ts`, no production hook) is documented in AGENTS.md and ARCHITECTURE.md.
- [ ] `feature_list.json`, `PROGRESS.md` and the docs are updated; the repo restarts with `./init.sh`.

## Developer Decisions (2026-11-14, confirmed)

1. `focus` = `primary` `#2968EC`: confirmed.
2. `primaryHover` `#1F55C8`: confirmed.
3. `secondary` changed to `#E6EEFD`. Contrast was checked in Decision 1; no adjustment needed.
4. Reduced motion changed: show the static final frame for about 1 s instead of skipping (Decision 5). No JavaScript: no splash.
5. Replay per tab (sessionStorage): confirmed.
6. A tap or key skips the splash: confirmed.
7. One dark splash background `#0F172A`: confirmed.
8. Email logo as a data-URI PNG with alt fallback: confirmed.

## Implementation Notes (2026-11-14, implementer)

Implemented from the approved read-back `docs/design/brand-logo-animation.md`, which supersedes this spec where they differ. Deviations and choices:

1. **ViewBoxes**: the read-back's exact values are used (lettermark `771.14 433.85 1227.35 634.10`, wordmark `166.98 545.36 2420.08 380.51`), not the rounded ones in Decision 2. `test/brand-assets.test.ts` asserts them equal to the exports; no separate `getBBox()` run.
2. **Sizes from the design**: header logo 140x22; app icon lettermark 320x165 in 512 (Decision 11 said about 340); email PNG rendered at 2x (280x44, shown 140x22), not 3x.
3. **Apple-touch icon**: rendered as a full white square. The approved `apple-touch-icon-180.svg` has `rx="40"`, but transparent corners turn black on iOS, and the read-back says "iOS applies the rounding".
4. **Quick dismiss** sets `data-splash="skip"` (0.15 s fade) instead of adding a class: CSS Module class names are hashed, and an attribute keeps the inline script free of build-specific names. Piece animations run under `html[data-splash]`, so they keep their state during the fade. Under reduced motion a tap ends the splash at once.
5. **Keyframe names**: both HTML files define `drawStroke` and `drawTick` with different values. In the shared CSS Module they are `lmDrawStroke`/`lmDrawTick` and `wmDrawStroke`/`wmDrawTick`. Every other keyframe keeps its name; bodies are verbatim.
6. **Generated data instead of hand copies**: `src/components/splash/splash-stages.ts` (the HTML stage SVGs as data) and `src/components/brand/logo-paths.ts` were extracted mechanically. `brand-assets.test.ts` re-parses the sources and requires deep equality. Extra file: `brand/LogoShapes.tsx` (shared renderer).
7. **Favicon SVG** is written by `render-brand-assets.ts` from the lettermark export (one source), not by hand.
8. **Test hooks in markup**: the splash SVGs carry `data-variant` and `data-group` attributes (inert), used by the E2E spec. No production test hook exists. The splash skip lives only in `e2e/fixtures.ts`.
9. **Extra E2E spec** `e2e/brand.spec.ts` covers Scenarios 7-8 (header logo on `/`, `/language`, `/auth/error`; no logo on Capture; CTA and focus-ring color; 360 px de/fi/nl header fit; favicon pair, apple-touch and theme-color meta). `auth.spec.ts` was updated: its narrow-header check used `header > p` for the old text wordmark, and the sw version is now `v3`.
10. **Contrast**: `text` on `secondary` measures 13.7:1 (Decision 1 said above 14). `warning`/`success` are checked at 3:1 (graphics only, unchanged tokens; `warning` on `background` is 3.5:1).
11. **Keycloak**: the email `<img>` sits inside the old wordmark `<p>`, which keeps the 22/28 bold ink style for the alt-text fallback. The base64 sits between the `bm-email-logo` markers.
