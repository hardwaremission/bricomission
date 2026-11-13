# Feature Implementation Spec: Keycloak sign-in, sign-up and email code pages in the BricoMission look and 11 languages

## Source Feature

- `id`: keycloak-login-theme
- `area`: identity
- `depends_on`: keycloak-realm-roles (accepted), web-pwa-shell (accepted)
- `status`: not_started (created 2026-11-13 by splitting `homeowner-password-login`, developer decision)
- `source`: `feature_list.json`

## Goal

Make the Keycloak side of Homeowner sign-in ready for the PWA:

- The realm allows self-registration. A new account gets exactly realm role `user` and must enter a 6-digit email code before it is signed in, just like password sign-in.
- Keycloak's sign-in, create-account, email-code and message pages, and the code email, use a custom theme `bricomission`. It follows the approved OpenPencil design and DESIGN.md tokens and uses self-hosted Inter.
- The pages are localized in the 11 MVP locales and follow the `ui_locales` the client sends.
- Everything works on localhost with no internet.

This feature is verified by driving Keycloak directly (Playwright with the existing dev client). The web OIDC client, sessions and the account entry are `homeowner-password-login`.

## Non-Goals

- Any `apps/web` page or component, the OIDC client `bricomission-web`, sessions, the `/api` proxy (`homeowner-password-login`).
- Account console theme, admin console theme, password reset (`resetPasswordAllowed` stays `false`), remember-me, Google button (`google-sso-login`).
- Saving the language on the account (`language-preference-account`).
- Professional sign-up with Tax ID (`professional-registration`).

## Decisions (developer-confirmed 2026-11-13 unless marked)

1. Keycloak-hosted pages, themed (confirmed). The theme extends `base`, not `keycloak.v2`, so layout and CSS come only from the design.
2. Registration fields are Keycloak 26 user-profile defaults: username, email, first name, last name, password, confirm password.
3. Self-registered accounts get `user` through the realm default roles. Seeded accounts must keep exactly one role.
4. SSO idle timeout is 8 h (`ssoSessionIdleTimeout: 28800`); the max stays at Keycloak's default 10 h.
5. Translations for the 10 non-English locales are agent-written without native review. Only the parity test guards them.
6. The offline proof is a localhost-only request guard in E2E, plus a grep for external URLs. The developer may also run E2E with the network unplugged (optional).

## Job Story

When a Homeowner is sent to Keycloak to sign in or create an account,
I want the pages to look like BricoMission and speak the language they chose in the app,
so they trust the step and finish it, including the email code.

## Users And Permissions

- Anyone can open the sign-in and create-account pages. A new account gets exactly `user`.
- Seeded `bm-admin`, `bm-homeowner` and `bm-professional` keep exactly `admin`, `user` and `professional`.
- Password grants on `bricomission-dev-cli` still skip the email code (dev-only, unchanged).

## Acceptance Scenarios

Ports come from the run's env. Browser URLs use `localhost` (the issuer host). Auth URLs are built by the test:

- `http://localhost:$KEYCLOAK_PORT/realms/BricoMission/protocol/openid-connect/auth`
- query: `client_id=bricomission-dev-cli`, `redirect_uri=http://localhost/dev-callback`, `response_type=code`, `scope=openid`, PKCE S256, `ui_locales=<l>`.
- The redirect to `http://localhost/dev-callback` is intercepted with `page.route`.

### Scenario 1: Realm and image after a realm reset

Given a fresh `keycloak-data` volume
When `docker compose up -d --build --wait` runs
Then the realm has:
- `registrationAllowed: true`, `loginTheme` and `emailTheme` `bricomission`;
- internationalization on, with the 11 supported locales and default `en`;
- `ssoSessionIdleTimeout` 28800;
- the registration flow `registration-email-otp`.

`./scripts/keycloak-smoke.sh` still passes: the seeded tokens carry exactly one role, and the existing browser email-code login works.

### Scenario 2: Sign in with password and email code, themed

Given `ui_locales=en` and no Keycloak session
When the test opens the auth URL
Then the BricoMission sign-in page renders: theme stylesheet, wordmark, Inter served from the Keycloak origin.

When it signs in as `bm-homeowner`
Then the themed email-code page appears and Mailpit receives one code email in the design's format.

When it enters the code
Then the browser is redirected to `dev-callback` with `code=`.

### Scenario 3: Create account with email code

Given the sign-in page
When the test follows "Create account" and submits a unique username, an email at `@bricomission.local`, first and last name, and matching passwords
Then the themed email-code page appears. Entering the code from Mailpit redirects to `dev-callback` with `code=`. Exchanging the code (PKCE) gives an access token whose `realm_access.roles`, filtered to `user`/`professional`/`admin`, is exactly `["user"]`.

### Scenario 4: Error states

- Wrong password: inline error and no email.
- Wrong code: error and the page stays. After 5 wrong codes: the designed too-many-attempts state.
- Registration errors show the designed field errors:
  - empty required field;
  - username taken (`bm-homeowner`);
  - email taken (`homeowner@bricomission.local`);
  - passwords do not match.
- An expired login page (`login-page-expired.ftl`) and the generic error page render with the theme, checked by opening a stale or invalid action URL.
- The expired-code state is checked by template and strings only. Its timing is not E2E-tested.

### Scenario 5: 11 locales

For each locale in en, es, fr, de, it, pt, nl, sv, no, da, fi, the sign-in page opened with `ui_locales=<l>`:
- has `<html lang="<l>">`;
- shows the title string from `messages_<l>.properties`;
- shows no Keycloak language picker.

The create-account and code pages are checked in `de` and `fi`. The code email subject is checked in `en`, `de` and `fi`.

Precedence check (updated 2026-11-13 after the developer decision, option a): Keycloak stores no locale on new accounts. An account registered with `ui_locales=fr` that signs in with `ui_locales=de` sees `de` pages and a `de` code email; seeded accounts follow `ui_locales` too. No `kc_locale` is needed.

### Scenario 6: Message parity

- `infra/keycloak/themes/bricomission/login/messages/` holds exactly 11 `messages_<l>.properties` files, and so does `email/messages/`.
- Each set has exactly the key set of its English file, no empty values, and the same `{n}` placeholders per key (unit test).
- Every string on the designed pages comes from these files, so no page depends on Keycloak's bundled locale coverage (notably `pt` and `no`).

### Scenario 7: Offline and layout

- During every spec, all requests go to `localhost:$KEYCLOAK_PORT` only. Any other host is aborted and fails the test.
- `grep -rEi 'https?://' infra/keycloak/themes` shows no external resource URLs.
- At 390x844 and 360x780, in `de` and `fi`, the sign-in, create-account and code pages show:
  - no horizontal overflow;
  - targets at least 44x44;
  - the primary button visible after scrolling to the form end.

### Scenario 8: Gates and reset detection

- `./init.sh` exits 0. Its Keycloak step also fetches the sign-in page (dev client auth URL) and requires the theme stylesheet path `/resources/` ... `/login/bricomission/`. If it is missing (old realm volume), it prints the AGENTS.md realm reset command and exits 1.
- `pnpm -r lint`, `pnpm -r test` and `pnpm test:e2e` (existing 45 + new) pass.

## Repository Research

### Files Inspected

- `infra/keycloak/import/BricoMission-realm.json`:
  - `registrationAllowed: false`;
  - browser flow `browser-email-otp` (cookie, or password + `email-authenticator-no-enrollment` with config `email-otp-6-digits`: 6 digits, 300 s, 5 attempts);
  - SMTP to Mailpit;
  - audience mapper on `bricomission-dev-cli`.
- `infra/keycloak/Dockerfile` (KC 26.8.2 + provider jar v26.7.2, `kc.sh build`), `compose.yaml` (keycloak service, import mount read-only), `init.sh` (Keycloak step), `scripts/keycloak-smoke.sh` usage in AGENTS.md and PROGRESS.md.
- `docs/specs/keycloak-realm-roles.md` (Implementation Notes: file name, audience mapper placement, provider), `docs/specs/web-pwa-shell.md`, `docs/design/web-pwa-shell.md`, `DESIGN.md`, `ARCHITECTURE.md`, `AGENTS.md` (Identity, realm reset), `docs/user-and-access-model.md`.
- `apps/web/e2e/support.ts`, `scripts/web/e2e.sh` (E2E harness: Playwright image, host network, `E2E_BASE_URL` only), `apps/web/package.json` (`@fontsource-variable/inter` 5.3.0).
- Not inspected (no network or container access in planning):
  - the provider jar's template and message names;
  - whether the import adds default roles to seeded users;
  - whether Keycloak accepts an authenticator after the registration form;
  - `${VAR}` placeholder scope;
  - `ui_locales` vs the user `locale` precedence.

  Each is verified at implementation (see the rules below).

### Existing Patterns To Follow

- Realm changes ship in the versioned JSON and need a realm reset: `docker compose rm -sf keycloak && docker volume rm ${COMPOSE_PROJECT_NAME}_keycloak-data`, project name confirmed first.
- The Dockerfile `RUN`/`COPY` steps keep offline rebuilds working.
- E2E runs in the `web-e2e` image on the host network.
- Message parity tests, as for `apps/web/messages`.

## Technical Approach

**Design input (blocking).** Read the approved `docs/design/keycloak-login-theme.md` (exports in `design/openpencil/keycloak-login-theme/`). If it is missing or not approved, set the feature `blocked` and stop. Implement strictly from it. Record non-token values in Implementation Notes and DESIGN.md.

**Realm JSON.**
- `registrationAllowed: true`, `registrationEmailAsUsername: false`, `verifyEmail: false` (the email code proves the address).
- `loginTheme` and `emailTheme`: `bricomission`.
- `internationalizationEnabled: true`, `supportedLocales` = the 11 codes, `defaultLocale: en`.
- `ssoSessionIdleTimeout: 28800`.
- Add `user` to the realm default roles (`defaultRole` composite).
  - Verify with the smoke and Scenario 3. If the import also gives seeded users the default role, stop and report. Never weaken the one-role check.
- `registrationFlow: registration-email-otp`. It is a copy of the built-in registration flow (registration form with its form actions) plus `email-authenticator-no-enrollment` (config `email-otp-6-digits`) REQUIRED after the form.
  - If Keycloak rejects that shape or the code step does not run, stop and report alternatives. Never ship registration without the code.

**Theme (`infra/keycloak/themes/bricomission/`).**
- `login/theme.properties`:
  - `parent=base`;
  - `locales=en,es,fr,de,it,pt,nl,sv,no,da,fi`;
  - `styles=css/bricomission.css`;
  - `kc*Class` properties mapped to theme classes.
- `login/template.ftl`: layout shell with the wordmark, card and optional "Back to BricoMission" (only when `client.baseUrl` is set). No locale dropdown.
- Page templates, overridden only as far as the design requires:
  - `login.ftl`, `register.ftl`;
  - the provider's code form (find its name with `unzip -l` on the jar);
  - `error.ftl`, `info.ftl`, `login-page-expired.ftl`.
  - Keep base variable names. All user data stays escaped (no `?no_esc` on user input).
  - The code input uses `inputmode="numeric"` and `autocomplete="one-time-code"`.
- `login/resources/css/bricomission.css`: DESIGN.md tokens as CSS variables and the focus ring. `login/resources/fonts/`: Inter variable woff2 (latin + latin-ext), copied from `@fontsource-variable/inter` 5.3.0, with its OFL license file.
- `login/messages/messages_<l>.properties` (11 files, UTF-8): every visible string on the designed pages, including Keycloak's built-in error keys shown there (for example `invalidUserMessage`, `usernameExistsMessage`, `emailExistsMessage`, `invalidPasswordConfirmMessage`, `missing*Message`) and the provider's keys.
- `email/theme.properties` (`parent=base`, same `locales`), the provider's code-email templates (`html/` + `text/`) from the design, and `email/messages/messages_<l>.properties` (11 files).
- `infra/keycloak/Dockerfile`: `COPY themes/bricomission /opt/keycloak/themes/bricomission` before `kc.sh build`. Keep the image tag scheme and bump its suffix (for example `bricomission/keycloak:26.8.2-emailotp26.7.2-theme1`).

**Tests.**
- `apps/web/test/keycloak-theme-messages.test.ts` (Vitest, reads `../../infra/keycloak/themes/...`): parity for login and email per Scenario 6.
- `apps/web/e2e/keycloak-theme.spec.ts`: Scenarios 2-5 and 7. It builds PKCE itself, intercepts `dev-callback` and exchanges the code with `request.post` on the token endpoint.
- `apps/web/e2e/support.ts` gains:
  - `mailpitCode(email)`: delete messages for the address first, then poll `/api/v1/search?query=to:<email>` for up to 15 s and parse 6 digits;
  - `guardLocalhost(context, allowedOrigins)`;
  - `keycloakAuthUrl(locale, pkce)`.
- `scripts/web/e2e.sh` also passes `E2E_KEYCLOAK_URL=http://localhost:<port>` and `E2E_MAILPIT_URL=http://localhost:<port>` (ports via `docker compose port ... | awk -F: '{print $NF}'`), plus `E2E_SEED_HOMEOWNER_PASSWORD` (env or compose default).

**init.sh.** Add the Scenario 8 theme check to the Keycloak step, using `awk -F: '{print $NF}'` for the port. It never runs Playwright.

## Expected File Changes

- `infra/keycloak/import/BricoMission-realm.json`, `infra/keycloak/Dockerfile`, `compose.yaml` (keycloak image tag only): modify.
- `infra/keycloak/themes/bricomission/**`: create (templates, CSS, fonts + OFL, 22 message files, email templates).
- `apps/web/test/keycloak-theme-messages.test.ts`, `apps/web/e2e/keycloak-theme.spec.ts`: create. `apps/web/e2e/support.ts`, `scripts/web/e2e.sh`, `init.sh`: modify.
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes. Source: new frames in `design/openpencil/bricomission_B2C_app.fig` (page **Keycloak sign-in**), designed with the developer through the `open-pencil` MCP. A new design artifact is required before implementation.

### Design Brief For The OpenPencil Step

General rules:
- English only. Frames are 390x844 and checked at 360x780.
- Text wraps and tolerates about 30 % longer strings (de, fi).
- DESIGN.md tokens (`input`, `button-primary`, `button-secondary`, `card`, `sheet`).
- Visible focus ring; targets at least 44 px; errors use an icon or text, never color alone; no technical terms.
- Consistent with the approved Home (wordmark, calm and airy).

1. **Sign in**: wordmark; title; helper; field "Username or email"; field "Password" (show/hide toggle optional); primary "Sign in"; text link "New here? Create account"; text link "Back to BricoMission" (shown only when the client has a base URL). States: default, field focus, invalid credentials (form-level error).
2. **Create account**: fields first name, last name, email, username, password, confirm password; primary "Create account"; text link "Already have an account? Sign in". States: default, required field missing, username taken, email taken or invalid, passwords do not match (field-level errors).
3. **Email code**: title "Check your email"; helper naming the address; one 6-digit numeric field; primary "Verify"; a resend control only if the provider supports it (the implementer reports what the jar offers before the design is closed). States: default, wrong code, code expired, too many attempts.
4. **Message page** (generic for error, info and page expired): icon, title, message, "Back to BricoMission" or "Start again". States: error, info, page expired.
5. **Code email** (HTML and plain-text content): subject, greeting, the code shown prominently, "valid for 5 minutes", and an ignore-if-not-you line; token colors only, no remote images.

The read-back artifact `docs/design/keycloak-login-theme.md` lists, per frame and state, every element with its layout, size, token names (or raw values), text style and final English copy, plus the line "approved by developer on <date>".

## Durable Documentation Impact

- `ARCHITECTURE.md`: update the Keycloak paragraph (theme location, `parent=base`, image COPY, registration flow, default role, i18n, idle timeout) and test layering (Keycloak E2E spec, theme parity test).
- `AGENTS.md` "Identity": self-registration gives `user`; after pulling this feature, reset the realm volume; init.sh detects a stale realm.
- `DESIGN.md`: Existing Design Assets (page Keycloak sign-in) and approved non-token values.
- `docs/user-and-access-model.md`: Homeowner self-registration with the email code; 8 h idle timeout.
- `docs/technical-discovery.md`: theme approach and locale precedence finding.
- `docs/risks-and-open-questions.md`:
  - the theme overrides Keycloak and provider templates (recheck on upgrades);
  - default role `user` vs future Professional self-registration.
- `CONSTRAINTS.md`: not needed.

## Implementation Plan

1. Confirm the design artifact (else `blocked`). Inspect the provider jar for template and message names, and report the resend capability to the orchestrator if the design is still open.
2. Realm changes and realm reset. Verify the default roles of the seeded users (smoke), the registration code step and the placeholders.
3. Theme login templates, CSS, fonts, 11 message files; then the email theme. Dockerfile COPY and rebuild.
4. Parity test, E2E spec and helpers, e2e.sh, init.sh.
5. Docs and evidence; status `passing`.

## Implementation Tasks

- [ ] Design artifact present; jar templates and keys listed.
- [ ] Realm JSON (registration, flow, default role, i18n, idle, themes); realm reset; smoke green.
- [ ] Login theme (template, 6 pages, CSS, Inter + OFL, 11 message files).
- [ ] Email theme (code email html/text, 11 message files).
- [ ] Dockerfile COPY; image tag bump.
- [ ] Parity test; `keycloak-theme.spec.ts`; Mailpit, localhost and auth-URL helpers; `e2e.sh` env.
- [ ] init.sh theme check with the reset hint.
- [ ] Docs, PROGRESS, evidence, Implementation Notes (locale precedence result).

## Verification Plan

Use the orchestrator's exported env (`COMPOSE_PROJECT_NAME`, every `*_PORT`). No sudo, no GPU, never read `.env`.

- `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`: exit 0. The parity test is listed.
- Realm reset, then `docker compose up -d --build --wait`: 6 healthy services. Pin awk check passes.
- `./scripts/keycloak-smoke.sh`: exit 0.
- `pnpm test:e2e`: the existing 45 plus the new specs pass, with the localhost guard active.
- `./init.sh`: exit 0. Failure path: in a throwaway compose project with the old realm JSON (git stash or the base commit), the Keycloak step exits 1 with the reset hint.
- `grep -rEi 'https?://' infra/keycloak/themes`: no external resources. `git grep -nE '"value": *"[^$]' infra/keycloak`: no cleartext secrets.
- `bash -n init.sh scripts/web/*.sh`.
- Optional (developer): with the host network unplugged, `pnpm test:e2e` passes.

## Evidence To Capture

- The provider template names, the default-role behavior on import, the registration flow shape, the locale precedence result, the image tag and the font file sha256.
- Test names and counts, the E2E list, the Mailpit message ids for Scenarios 2-3, the smoke and `./init.sh` tails with exit codes, the design artifact path and approval date.

## Validator Checklist

- [ ] Pages and email match the approved English design; nothing invented; no locale picker.
- [ ] Sign-in and registration both require the email code; new accounts have exactly `user`; seeded roles unchanged.
- [ ] 11 locales via `ui_locales`; parity test; precedence finding recorded.
- [ ] No external URLs; Inter self-hosted with the OFL file; 360 px de/fi layouts pass.
- [ ] No web, BFF or API changes. `./init.sh`, the smoke and `pnpm test:e2e` pass. Docs updated; status `passing`, not `accepted`.

## Implementation Notes (implementer, 2026-11-13)

Design input: `docs/design/keycloak-login-theme.md` (approved by developer on 2026-11-13).

### Planning-time unknowns

- **Provider templates and keys** (`unzip -l` on the jar): `theme-resources/templates/email-code-form.ftl`, `html/code-email.ftl`, `text/code-email.ftl`. The theme's templates of the same name win over the provider's. Keys seen at runtime: wrong code = field error `invalidAccessCodeMessage`; empty code = `missingTotpMessage`; expired code = `expiredActionTokenSessionExistsMessage` (not `expiredCodeMessage`, which is Keycloak's login timeout); 5 wrong codes = `email-authenticator-too-many-attempts` + `maxAttemptsReached`; resend cooldown (30 s) = global error `email-authenticator-resend-cooldown` with `resendAvailableInSeconds`.
- **Seeded users vs default role**: the import does not grant `default-roles-bricomission` to imported users. Smoke S3 still gives exactly one role each. No stop needed.
- **Registration + email code**: Keycloak 26.8.2 imports the flow (form-flow subflow, then `email-authenticator-no-enrollment` REQUIRED) and the code step runs after the form, before sign-in. No stop needed.
- **`${VAR}` placeholders**: unchanged; seeded password logins work after the realm reset.
- **`ui_locales` vs stored `locale`**: measured that a stored account `locale` (fr) beats `ui_locales=de` and also `kc_locale=de` on `/auth`; only `kc_locale` on a login-actions URL switches. Reported; **developer decision 2026-11-13, option (a)**: the app language always wins. `register.ftl` no longer sends the hidden `locale` field, so Keycloak stores no locale on new accounts and `ui_locales` decides every page and the code email. The spec's `kc_locale` fallback is unnecessary and was dropped. The per-account preference lives in the app (`language-preference-account`). The E2E precedence test now asserts: a self-registered account (registered in fr) signs in with `ui_locales=de` and gets de pages and a de subject; seeded `bm-homeowner` with `ui_locales=it` gets it. Old dev accounts with a stored locale (`e2e-*`, `probe-*`) were cleared by a realm reset.

### Deviations from the design or spec

- Code email subject: `Your BricoMission code` without the code. The provider formats the subject with only the realm display name (`emailCodeSubject`, `{0}`); the code is not available to the subject.
- Email-code helper shows the masked address (`h***r@bricomission.local`): login pages have no user bean, so the full address is not available. `showMaskedEmailOnOtpForm=true` was added to `email-otp-6-digits`.
- "Confirm your password." is not reachable: Keycloak reports an empty confirmation as a mismatch (`invalidPasswordConfirmMessage`, "Passwords don't match."). No key was added for it.
- Required-field errors arrive as the generic `error-user-attribute-required`; `register.ftl` replaces it with the per-field design message (`missingFirstNameMessage`, ...). Invalid email arrives as `error-invalid-email` (overridden with the design copy).
- Resend cooldown is a provider error; the template shows it as the designed info alert. Expired code is shown as the designed warning alert.
- Info page with an `actionUri` uses one extra string `bmContinue` ("Continue"); the design only covers "Back to BricoMission".
- The 5-minute hint on the code page is a literal argument (the provider does not pass the TTL to the page); keep it in sync with `ttl=300`.
- The error page shows the fixed design message, not Keycloak's technical text. "Start again" links to `url.loginRestartFlowUrl`.
- `scripts/keycloak-smoke.sh` (not in the expected file list) now matches the themed subject and code line.
- Playwright routes do not see redirect hops, so the dev-callback is observed through the request event instead of `page.route`; the browser then fails to load `http://localhost/dev-callback` (nothing listens), which the test ignores.
- `grep -rEi 'https?://' infra/keycloak/themes` matches only `fonts/OFL.txt` (license text, not a resource).

### Non-token values

Recorded in DESIGN.md (Keycloak pages bullet).
