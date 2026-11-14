# Design Read-Back: homeowner-password-login

Approved by developer on 2026-11-13.

> **Updated by `brand-logo-animation` on 2026-11-14 (approved by developer):** colors recolored to the new brand (primary `#2968EC`, text `#182231`, secondary `#E6EEFD`, focus `#2968EC`, overlay `#18223166`; `accent` removed) and the text wordmark replaced by the SVG wordmark logo 140×22. Logo, icons, favicon, email logo and splash: `docs/design/brand-logo-animation.md`. In the JSX exports the logo appears as an empty `Logo (wordmark SVG …)` frame; its artwork comes from the brand read-back.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Web**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/homeowner-password-login/`:
  - `home-anonymous.jsx`, `home-signed-in.jsx`, `home-anonymous-360-check.jsx`
  - `account-sheet.jsx`
  - `auth-error.jsx`, `auth-error-reasons.jsx`
  - `overview.png`, `check-360-nederlands.png`
- Designs are **English only** (developer decision); all 11 locales come from `apps/web/messages/<locale>.json` (parity test).
- This feature changes only the Home header (adds the account entry and the narrow-width selector rule), adds the account sheet and the `/auth/error` page. Everything else on Home stays as approved in `docs/design/web-pwa-shell.md`.
- Implement strictly from this artifact and the JSX files; where silent, DESIGN.md and `docs/design/web-pwa-shell.md` govern.

## Home Header (all widths)

Header row unchanged (h 64, px 16, space-between): Wordmark left, **HeaderActions** right = row, gap 8, center-aligned: `LanguageSelector` then `AccountEntry`.

| Element | Spec | Accessible name / behavior |
| --- | --- | --- |
| AccountEntry – anonymous | 44x44 circle, `surfaceMuted` `#F2F1ED`, `lucide:user-round` 20 `text` `#182231` | button, name `Sign in`; goes to `/auth/login?returnTo=<current path>` (no sheet) |
| AccountEntry – signed in | 44x44 circle, `primary` `#2968EC`, initial 16/24 semibold white (first letter of the display name, else of the username) | button, name `Account: {displayName}`; opens the Account sheet |
| Focus | 2 px `focus` `#2968EC` ring on both | — |
| Loading (session not yet known) | render the anonymous variant; no layout shift when it switches | — |

The single primary CTA, the steps, the professional link and the bottom action bar are unchanged; sign-in is never forced (lazy login).

## Language Selector – narrow screens (developer decision)

- At viewport widths **≥ 375 px** the selector stays as approved in `web-pwa-shell` (14/20 label, globe 18, chevron 16, px 14, gap 6).
- At widths **< 375 px** it keeps the **full native language name** (never a code) in a compact pill, content **centered**:
  - h 44 (touch target unchanged), px 10, gap 4, `justify-content: center`;
  - `lucide:globe` 16, label **12/16 semibold** `text`, `lucide:chevron-down` 14.
- Verified with the longest name, `Nederlands`, at 360x780: logo 140 px + HeaderActions 178 px (selector 126 + gap 8 + account 44) fit in 328 px with 10 px to spare (`check-360-nederlands.png`).

## Account Sheet (open)

Opened from the signed-in AccountEntry. Same pattern as the approved language bottom sheet: overlay `#18223166`, sheet anchored to the bottom.

| Element | Spec | Copy (en) |
| --- | --- | --- |
| Sheet | column, gap 16, pt 8, px 16, pb 24 + safe area, `surface`, radius 20 (top corners), `elevation.sheet` | — |
| Sheet header | row, h 52, space-between; title 18/24 semibold `text` | `Account` |
| Close button | 44x44 circle, `surfaceMuted`, `lucide:x` 20 `text` | accessible name `Close` |
| User block | row, gap 16, centered | — |
| Avatar | 56x56 circle `primary`, initial 22/28 semibold white | — |
| Display name | 18/24 semibold `text`, wraps | `{displayName}` (sample `María López`) |
| Username | 14/20 `textMuted` | `{username}` (sample `maria.lopez`) |
| SecondaryButton | full width, h 52, pill, `surface`, 1 px `border`, `lucide:log-out` 20 + label 16/24 semibold `primary`, gap 8 | `Sign out` (POST to the sign-out route; then the header shows the anonymous entry) |

Dialog semantics like the language sheet (`<dialog>`, focus trapped, Escape closes, focus returns to the AccountEntry).

## Sign-in Problem Page (`/auth/error`)

Web page (not Keycloak), same layout family as the Keycloak message page.

| Element | Spec | Copy (en) |
| --- | --- | --- |
| Header | wordmark + LanguageSelector (no AccountEntry) | `BricoMission` |
| Content | column, gap 24, pt 32, px 16, pb 24 | — |
| Badge | 56x56 circle `secondary` `#E6EEFD`, `lucide:circle-alert` 26 `danger` `#C0392B` | — |
| Title | 28/34 bold `text` | `We couldn't sign you in` |
| Helper | 16/24 `textMuted`, wraps; one text per reason | see table |
| PrimaryButton | full width, h 52, pill `primary`, `lucide:rotate-ccw` 20 + label 16/24 semibold white, gap 8 | `Try again` (restarts `/auth/login` with the original `returnTo`) |
| Text link | h 44, `lucide:arrow-left` 16 + 14/20 medium `primary` underlined, gap 6 | `Back to Home` |

| Reason (`?reason=`) | Helper (en) |
| --- | --- |
| `cancelled` | `You cancelled signing in. You can try again whenever you're ready.` |
| `expired` | `Your sign-in link expired. Start again to continue.` |
| `unavailable` | `Sign-in is temporarily unavailable. Please try again in a few minutes.` |
| `generic` (default, also for unknown values) | `Something went wrong while signing you in. Please try again.` |

## Accessibility Notes

- Touch targets ≥ 44 px everywhere (account entry 44, close 44, buttons 52, link row 44).
- The account entry never relies on the icon alone: accessible names `Sign in` / `Account: {displayName}`.
- The OpenPencil accessibility lint reported 0 issues on the approved page.
- Icons: Lucide (ISC), via `lucide-react` as in `web-pwa-shell`.
