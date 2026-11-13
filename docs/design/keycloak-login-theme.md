# Design Read-Back: keycloak-login-theme

Approved by developer on 2026-11-13.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Auth – Keycloak**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/keycloak-login-theme/`:
  - `sign-in.jsx`, `sign-in-invalid.jsx`
  - `create-account.jsx`, `create-account-errors.jsx`
  - `email-code.jsx`, `email-code-states.jsx`
  - `message-page-error.jsx`, `message-page-states.jsx`
  - `code-email.jsx`
  - `overview.png` (all frames)
- Designs are **English only** (developer decision). The copy below is the canonical `en` message; the other 10 locales come from the theme message files (`messages_<locale>.properties`), never from designs.
- Check frame (not a separate screen): **Sign in – invalid credentials @360x780 (check)** confirms the densest form fits at 360 px.
- Implement strictly from this artifact and the JSX files. Where they are silent, DESIGN.md governs. Text without an explicit size is 14 px (`typography.small`). Sample values in inputs (`maria.lopez`, `482915`, …) are illustrative.
- No Keycloak language picker on any page; the locale comes from `ui_locales` (spec).
- Email-code provider capabilities verified in `keycloak-2fa-email-authenticator.jar` (`email-code-form.ftl`): `emailCode` input, submit `login`, `resend` (with cooldown message `email-authenticator-resend-cooldown`) and `cancel`. The design uses all three.

## Shared Layout and Components

All pages: background `background` `#FAFAF8`, single column, side padding 16.

| Component | Spec |
| --- | --- |
| Header | row, full width, h 64, px 16; wordmark `BricoMission` 22/28 bold `primary` `#1F4E79` (no selector, no other actions) |
| Content | column, gap 24, pt 32, px 16, pb 24 (pb 32 on Create account) |
| Intro | column, gap 8 (gap 12 when it has a badge); Title 28/34 bold `text` `#1C1C1E`; Helper 16/24 regular `textMuted` `#6B6B70`; both full width, wrapping |
| Badge | 56x56 circle, `secondary` `#E8DCC8`, Lucide icon 26 |
| Form | column, gap 16 |
| Field | column, gap 8: Label 14/20 semibold `text`; Input row full width h 52, px 16, `surfaceMuted` `#F2F1ED` fill, 1 px `border` `#E2E0DA` stroke, radius 12 (`rounded.md`), value 16/24 `text` |
| Password input | same, pl 16 / pr 4, trailing 44x44 show/hide toggle with `lucide:eye` 20 `textMuted` (accessible name "Show password"/"Hide password") |
| Input – focus | stroke 2 px `focus` `#2F80ED` |
| Input – error | stroke 2 px `danger` `#C0392B`, plus Field error row below |
| Field error | row, gap 6, top-aligned: `lucide:circle-alert` 16 `danger` + text 14/20 `danger`, wraps; linked to the input with `aria-describedby` |
| Alert (form level) | row, full width, gap 12, p 16, `surface` `#FFFFFF` fill, radius 12, 1 px stroke in the state color; icon 20 + text 14/20 `text`; role `alert` |
| Alert colors / icons | error: `danger` + `lucide:circle-alert`; warning: `warning` `#B7791F` + `lucide:clock`; info: `primary` + `lucide:info` |
| PrimaryButton | full width, h 52, pill (999), `primary` fill, label 16/24 semibold white |
| SecondaryButton | full width, h 52, pill, `surface` fill, 1 px `border` stroke, label 16/24 semibold `primary` |
| Text link | h 44 touch row, 14/20 medium (500) `primary`, underlined; optional leading `lucide:arrow-left` 16 `primary`, gap 6 |
| Inline link row | h 44, gap 4: 14/20 `textMuted` lead text + text link |

## Frame: Sign in (390x844)

| Element | Copy (en) / notes |
| --- | --- |
| Title | `Sign in` |
| Helper | `Use your BricoMission account to save and continue your kitchen projects.` |
| Field 1 label | `Username or email` |
| Field 2 label | `Password` (show/hide toggle) |
| PrimaryButton | `Sign in` |
| Inline link row (centered) | `New here?` + link `Create account` (Keycloak registration) |
| Text link with arrow (centered) | `Back to BricoMission` — only when the client has a base URL |

### State: invalid credentials (password focused)

- Alert error inserted between Intro and Form: `Invalid username, email or password. Check them and try again.`
- Username keeps its value; password field emptied and focused (focus stroke).

## Frame: Create account (full length; the page scrolls)

| Element | Copy (en) / notes |
| --- | --- |
| Title | `Create account` |
| Helper | `It's free. We'll send a code to your email to confirm it's you.` |
| Fields (in order, all full width, stacked) | `First name`, `Last name`, `Email`, `Username`, `Password` (toggle), `Confirm password` (toggle) |
| PrimaryButton | `Create account` |
| Inline link row | `Already have an account?` + link `Sign in` |

### State: field errors (each shown only when it applies)

| Field | Error text |
| --- | --- |
| Any required field empty (example: First name) | `Enter your first name.` (per field: `Enter your last name.`, `Enter your email address.`, `Enter a username.`, `Enter a password.`, `Confirm your password.`) |
| Email invalid or already registered | `Enter a valid email address. If you already have an account with this email, sign in instead.` |
| Username taken | `This username is already taken. Try another one.` |
| Passwords do not match (on Confirm password) | `Passwords don't match.` |

Non-field Keycloak errors (for example password policy) use the form-level Alert error above the Form.

## Frame: Email code (390x844)

| Element | Copy (en) / notes |
| --- | --- |
| Badge | `lucide:mail` `primary` |
| Title | `Check your email` |
| Helper | `We sent a 6-digit code to {email}. Enter it below to continue.` (the address of the account) |
| Field label | `Verification code` |
| Code input | h 56, centered value 28/34 semibold `text`, letter spacing 8; numeric (`inputmode="numeric"`, `autocomplete="one-time-code"`, maxlength 6) |
| Hint (below input) | `The code is valid for 5 minutes.` 14/20 `textMuted` |
| PrimaryButton | `Verify` (submit `login`) |
| SecondaryButton | `Resend code` (submit `resend`) |
| Text link (centered) | `Cancel and go back` (submit `cancel`) |

### States (alert above the Form)

| State | Alert | Changes |
| --- | --- | --- |
| wrong code | error: `That code isn't right. Check the email and try again.` | code input stroke `danger` 2 px |
| code expired | warning: `This code has expired. Request a new one to continue.` | `Resend code` becomes the PrimaryButton; `Verify` hidden |
| too many attempts (5) | error: `Too many incorrect attempts. Request a new code to continue.` | code input and `Verify` disabled; `Resend code` becomes the PrimaryButton |
| resend cooldown | info: `Please wait {seconds} seconds before requesting a new code.` | none |

## Frame: Message page (generic; error shown)

| Element | Copy (en) / notes |
| --- | --- |
| Badge icon | state icon (see table) |
| Title / Message | per state (see table) |
| Actions | column, gap 8, centered: PrimaryButton + Text link with arrow `Back to BricoMission` |

| State | Badge icon | Title | Message | Primary action |
| --- | --- | --- | --- | --- |
| error | `lucide:circle-alert` `danger` | `Something went wrong` | `We couldn't complete this step. Please start again. If it keeps happening, try again in a few minutes.` | `Start again` (+ `Back to BricoMission` link) |
| info | `lucide:info` `primary` | `Good to know` | the Keycloak info message | `Back to BricoMission` (no extra link) |
| page expired | `lucide:clock` `warning` | `This page has expired` | `For your security, this step timed out. Start again to continue.` | `Start again` (+ `Back to BricoMission` link) |

## Code Email (HTML 600 wide + plain text)

| Element | Spec / copy (en) |
| --- | --- |
| Outer | `background` `#FAFAF8`, padding 24 |
| Card | `surface`, 1 px `border`, radius 20, padding 32, gap 24 |
| Wordmark | `BricoMission` 22/28 bold `primary` (text, no image) |
| Greeting | `Hi {firstName},` 16/24 `text` (fallback `Hi,` when no first name) |
| Intro | `Use this code to confirm it's you and continue in BricoMission:` 16/24 `text` |
| Code box | full width, h 72, `surfaceMuted`, radius 12; code 34/40 bold `primary`, letter spacing 10 |
| Validity | `The code is valid for 5 minutes.` 14/20 `textMuted` |
| Divider | 1 px `border` |
| Ignore line | `If you didn't try to sign in or create an account, you can ignore this email. Your account stays safe.` 14/20 `textMuted` |
| Subject | `Your BricoMission code: {code}` |
| Plain text | same copy, code on its own line |
| Constraints | inline styles with token colors only, Inter with system-font fallback, no remote images or fonts |

## Accessibility and Responsive Notes

- Verified at 390x844 and 360x780; text boxes have no fixed widths, so ~30 % longer strings (de, fi) wrap.
- Touch targets ≥ 44 px (inputs 52/56, buttons 52, toggles and link rows 44).
- Errors always combine icon + text (never color alone); `danger` text `#C0392B` on `#FAFAF8` meets WCAG AA for 14 px text.
- Visible 2 px focus ring `#2F80ED` on every interactive element.
- The OpenPencil accessibility lint (contrast, touch targets, text size) reported 0 issues on the approved page.
- Icons: Lucide (ISC license), inline SVG in the theme; no runtime icon or font fetching.
