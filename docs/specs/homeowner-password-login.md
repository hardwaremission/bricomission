# Feature Implementation Spec: Homeowner signs in with password and email OTP

## Source Feature

- `id`: homeowner-password-login
- `area`: identity
- `depends_on`: web-pwa-shell (accepted), keycloak-realm-roles (accepted), keycloak-login-theme (not_started at planning time)
- `status`: not_started (re-planned 2026-11-13 after the split; the Keycloak side is `keycloak-login-theme`)
- `source`: `feature_list.json`

## Goal

From the PWA, a Homeowner can sign in or create an account through the themed Keycloak pages (`keycloak-login-theme`) and land back on the page they came from, signed in. The web shows the signed-in state in the Home header and lets the user sign out.

The Next.js server is the OIDC client (Backend-for-Frontend). Tokens never reach browser JavaScript. Sessions live in PostgreSQL, so they survive web container restarts. The same-origin `/api/*` proxy attaches the session's access token. Everything runs on localhost with no internet.

## Non-Goals

- Keycloak theme, realm registration flow, default role, Keycloak i18n (`keycloak-login-theme`). The only realm change here is the `bricomission-web` client.
- The Login Gate and draft claiming (`login-gate-claim`). Home never forces sign-in.
- Saving the language on the account (`language-preference-account`).
- Google SSO, Professional registration, role-specific screens, password reset.
- API changes. `GET /me` and the default-deny guard exist already; the OpenAPI snapshot must not change.

## Decisions

Confirmed by the developer on 2026-11-13 unless marked "planner".

1. **BFF, confidential client, Keycloak-hosted pages (confirmed).**
   - Flow: OIDC Authorization Code with PKCE S256, plus `state` and `nonce`.
   - The new confidential client `bricomission-web` gets its secret from env, with a dev default.
   - Rejected: tokens in the browser (Keycloak JS adapter), custom password forms (no email code), iframes.
2. **Sessions in PostgreSQL (confirmed). How (planner):** the Next server owns the schema `web_session` in the existing database and accesses it with `pg` (node-postgres).
   - Ownership:
     - The web owns its schema and applies its own idempotent migration lazily, guarded by an advisory lock.
     - The API's Prisma only manages `public` (`?schema=public`; `migrate deploy` never touches other schemas). Neither app touches the other's tables.
   - Rejected: internal session endpoints in the API, because they would:
     - widen the API surface reachable through the `/api` proxy, which then needs a deny rule and a shared secret;
     - couple sign-in to API uptime;
     - mix browser-session concerns into the REST API that the native iOS client will reuse.
   - Rejected: tables in the API's Prisma schema (two apps writing one model, cross-app migration coupling).
   - Cost: the `web` container gets database credentials. Hardening with a dedicated DB role is a later step.
3. **Login transactions also in PostgreSQL (planner).** A login started before a web restart can still complete, and nothing grows in process memory. Rows expire after 10 min.
4. **Opaque cookie and encryption at rest (planner).**
   - Cookie: `bm_session` holds 32 random bytes (base64url). The database stores only its SHA-256, so a database leak yields no usable cookie.
   - Tokens: access and refresh tokens and the PKCE verifier are encrypted with AES-256-GCM:
     - key `WEB_SESSION_KEY`: base64, 32 bytes, from env, with a dev default in compose and `.env.example`;
     - random 12-byte IV per value; AAD = the row's id hash;
     - format: version byte + IV + tag + ciphertext.
   - The ID token is not stored. Only `sub`, `preferred_username` and the display name are kept.
5. **Account entry in the Home header** next to the language selector (confirmed). It is quiet, the single primary CTA is unchanged, and sign-in is never forced. Registration is reached from the Keycloak sign-in page and from `/auth/login?mode=register`.
6. **Any realm account may sign in on the web (confirmed).** Role-specific routing belongs to later features.
7. Agent translations with the parity test only; localhost-only E2E guard (confirmed).

## Job Story

When I want to keep my kitchen work and use the costly features,
I want to sign in or create an account from the app and come back signed in,
so I can continue without my tokens ever being exposed to the page.

## Users And Permissions

- **Anonymous:** sees "Sign in". `/api/*` calls go upstream with no `Authorization` header.
- **Signed in (any realm account):** sees the account entry and can sign out. `/api/*` calls carry the session's access token, and the API's role checks apply.

## Acceptance Scenarios

Ports come from the run's env. Browser URLs use `localhost`.

### Scenario 1: Sign in from Home and land back signed in
Given anonymous Home and seeded `bm-homeowner`
When the visitor presses "Sign in", enters password and the Mailpit code on the themed Keycloak pages
Then the browser returns to `/`. The account entry shows the user. `fetch('/api/me')` from the page returns 200 `bm-homeowner`. The authorization request carried `client_id=bricomission-web`, `code_challenge_method=S256`, `state`, `nonce` and `ui_locales=<current web locale>`, plus `kc_locale` if `keycloak-login-theme` recorded that it is needed.

### Scenario 2: Create an account from the app
When the visitor opens `/auth/login?mode=register` (or follows "Create account" on the sign-in page), registers and enters the code
Then they land on `/` signed in. `/api/me` returns 200 with that username and roles `["user"]`.

### Scenario 3: Session survives a web restart
Given a signed-in browser
When `docker compose restart web` completes (`--wait` healthy)
Then a reload still shows the account entry, and `/api/me` still returns 200.

### Scenario 4: Session storage is opaque and encrypted
Given a signed-in session
Then `web_session.sessions` holds one row:
- its key is the SHA-256 of the cookie value, never the value itself;
- the token columns are `bytea` ciphertext, so `encode(col,'escape')` contains no `eyJ`;
- `/auth/session` and page HTML contain no token.
If `WEB_SESSION_KEY` changes, the old rows fail to decrypt: the session is treated as absent and deleted.

### Scenario 5: Proxy attaches the session token, never the browser's
- Signed in: upstream receives `Authorization: Bearer <session access token>`.
- No session: any client `Authorization` header is dropped, so `/api/me` returns 401.
- Cookies are never forwarded. `/api/health` behaves as before.
- When a `bm_session` cookie is present, `POST`/`PUT`/`PATCH`/`DELETE` with a missing or foreign `Origin` returns 403 before any upstream call.

### Scenario 6: Refresh
When the access token expires within 30 s
Then the server refreshes it before forwarding:
- Concurrent requests in the process share one refresh. The row is updated with the new encrypted tokens and expiries.
- `invalid_grant`: the row is deleted, the cookie cleared, and the call forwarded anonymously.
- Keycloak unreachable: 503 `{"status":"error"}`, and the session is kept.
- Database unreachable while a `bm_session` cookie is present: 503.

### Scenario 7: Sign out
When the user opens the account sheet and presses "Sign out" (form `POST /auth/logout`, Origin checked)
Then the server ends the Keycloak session over the backchannel (`POST .../logout` with client credentials and the refresh token, 3 s timeout), deletes the row, clears the cookie and redirects 303 to `/` anonymous. `/api/me` returns 401, and the next sign-in asks for the password again. If Keycloak is unreachable, the local session is still removed.

### Scenario 8: Callback safety
- These failures create no session and redirect 303 to the designed `/auth/error?reason=<code>`:
  - unknown, expired or reused transaction;
  - `state` mismatch;
  - `error=access_denied`;
  - code exchange failure;
  - ID token failure (signature via the internal JWKS, `iss` = public issuer, `aud` = `bricomission-web`, `nonce`, `exp`).
- Reason codes: `cancelled`, `expired`, `unavailable`, `failed`.
- The transaction row is deleted on first use.
- `returnTo` accepts only paths starting with a single `/`. `//x`, `/\x` and absolute URLs fall back to `/`.
- `/auth/login` on a host other than `WEB_PUBLIC_URL` (for example `127.0.0.1`) first redirects 307 to the same path on `WEB_PUBLIC_URL`.

### Scenario 9: No signed-in state in caches
- Home HTML is identical for anonymous and signed-in users.
- `AccountEntry` hydrates from `GET /auth/session` (`cache-control: no-store`), which returns `{"signedIn":false}` or `{"signedIn":true,"user":{"username","displayName"}}`.
- With no cookie, `/auth/session` answers without touching the database. On any non-200, the entry shows "Sign in".
- `public/sw.js` never intercepts `/auth/*`. `VERSION` becomes `v2`.

### Scenario 10: Offline, layout, gates
- During auth E2E, every request goes to the web or Keycloak `localhost` origins; anything else is aborted and fails the test.
- Home anonymous, Home signed in, the account sheet and `/auth/error` at 390x844 and 360x780 in `de` and `fi` show:
  - no overflow;
  - 44 px targets;
  - the CTA still visible.
- `pnpm -r lint`, `pnpm -r test`, `./init.sh`, `pnpm test:e2e` and `./scripts/keycloak-smoke.sh` pass. The OpenAPI snapshot is unchanged.

## Repository Research

### Files Inspected

- `apps/web/src/lib/api-proxy.ts`: forwards the client `authorization` header; no session.
- `apps/web/src/app/api/[...path]/route.ts`.
- `apps/web/src/proxy.ts`: its matcher covers `/auth/*`, so the locale header is available.
- `apps/web/src/lib/locale-cookie.ts`: the Origin check pattern.
- `apps/web/src/app/page.tsx`: header with wordmark and selector.
- `apps/web/public/sw.js`, `messages/en.json`, `package.json`, `Dockerfile` (standalone; only traced files ship), `e2e/support.ts`.
- `scripts/web/e2e.sh`, `compose.yaml` (web has no DB env and no `depends_on`), `init.sh` (Web step).
- `infra/keycloak/import/BricoMission-realm.json`: only `bricomission-api` and `bricomission-dev-cli`; the audience mapper sits on the client.
- `apps/api/prisma/` and `prisma.config.ts`: Prisma owns `public`; migrations are applied by the API entrypoint.
- `ARCHITECTURE.md`, `AGENTS.md`, `DESIGN.md`, `docs/design/web-pwa-shell.md`, `docs/technical-discovery.md`, `docs/user-and-access-model.md`, `CONTEXT.md`.
- `docs/specs/keycloak-realm-roles.md`, `docs/specs/web-pwa-shell.md`, `docs/specs/keycloak-login-theme.md`.
- Not checked (no network): `openid-client` and `pg` releases. Verify them at implementation.

### Existing Patterns To Follow

- Pure, unit-tested helpers in `src/lib/` behind thin route handlers. Generic `{status:'error'}` bodies; logs carry class names only.
- `resolveLocale` for the locale. Every string goes into all 11 message files.
- Exact versions. Realm changes need a realm volume reset (AGENTS.md "Identity").

## Technical Approach

**Design input (blocking).** Read the approved `docs/design/homeowner-password-login.md`. If it is missing or not approved, set the feature `blocked`. Build strictly from it.

**Realm.** Add client `bricomission-web`:
- confidential, `secret: "${BM_WEB_CLIENT_SECRET}"`;
- standard flow only, `pkce.code.challenge.method: S256`;
- `redirectUris: ["${BM_WEB_PUBLIC_URL}/auth/callback"]`, `post.logout.redirect.uris: "${BM_WEB_PUBLIC_URL}/"`;
- `rootUrl` and `baseUrl` `${BM_WEB_PUBLIC_URL}` (enables the theme's "Back to BricoMission" link);
- `webOrigins: []`;
- the `bricomission-api` audience mapper.

Compose `keycloak` env: `BM_WEB_PUBLIC_URL: http://localhost:${WEB_PORT:-3100}`, `BM_WEB_CLIENT_SECRET: ${BM_WEB_CLIENT_SECRET:-bm-web-dev-secret}`. A realm reset is needed. If placeholders do not resolve outside `credentials`, report it.

**Dependencies.**
- `openid-client` (newest stable 6.x, exact): a `Configuration` from explicit metadata (no discovery):
  - on `KEYCLOAK_PUBLIC_URL`: `issuer`, `authorization_endpoint`;
  - on `KEYCLOAK_INTERNAL_URL`: `token_endpoint`, `jwks_uri`, `end_session_endpoint`;
  - `allowInsecureRequests` for http.
  - Fallback: a small module on `jose` 6.2.17. Record it.
- `pg` (exact; pure JS, so the standalone build traces it).

**Database layer (`apps/web/src/lib/auth/db/`).**
- `pool.ts`: a lazy `pg.Pool` on `globalThis` (`WEB_DATABASE_URL`, max 5, 2 s connection timeout).
- `migrations.ts`: migration SQL embedded as TypeScript string constants, so standalone output needs no SQL files.
  - `ensureWebSessionSchema()` runs once per process and retries after a failure.
  - It runs in one transaction with `pg_advisory_xact_lock(<constant>)`.
  - It creates `web_session.schema_migrations(version int primary key, applied_at timestamptz)` and applies missing versions.
- v1 tables:
  - `web_session.sessions`:
    - `id_hash bytea primary key`;
    - `sub text`, `username text`, `display_name text`;
    - `access_token_enc bytea`, `access_expires_at timestamptz`;
    - `refresh_token_enc bytea`, `refresh_expires_at timestamptz`;
    - `created_at`, `updated_at`;
    - index on `refresh_expires_at`.
  - `web_session.auth_transactions`:
    - `id_hash bytea primary key`;
    - `state text`, `nonce text`, `code_verifier_enc bytea`;
    - `return_to text`, `locale text`;
    - `expires_at timestamptz` (index).
- `crypto.ts`: AES-256-GCM `seal`/`open` with AAD. The key is validated on first use; a bad key gives 503 on auth routes and a logged class name.
- `session-repository.ts`: a `SessionRepository` interface with a Postgres implementation and an in-memory fake for unit tests.
- Cleanup:
  - Lookups ignore expired rows.
  - Inserts run `DELETE ... WHERE expires_at < now()` (transactions) and `refresh_expires_at < now()` (sessions), at most once per 10 min per process.
  - Inserting a transaction fails with 503 if more than 5000 unexpired transactions exist (abuse cap).

**Auth logic (`src/lib/auth/`).**
- `config.ts`: env with defaults:
  - `WEB_PUBLIC_URL` `http://localhost:3100`;
  - `KEYCLOAK_PUBLIC_URL` `http://localhost:8180`;
  - `KEYCLOAK_INTERNAL_URL` `http://127.0.0.1:8180`;
  - `KEYCLOAK_REALM` `BricoMission`;
  - `KEYCLOAK_WEB_CLIENT_ID` `bricomission-web`;
  - `KEYCLOAK_WEB_CLIENT_SECRET`, `WEB_SESSION_KEY`, `WEB_DATABASE_URL`.
- `session.ts`:
  - cookie helpers: `bm_session` and `bm_auth_tx` are `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when https; tx `Max-Age` 600;
  - `getSession(request)`;
  - `getValidAccessToken(request)` with single-flight refresh and the Scenario 6 outcomes.
- `return-to.ts`: `safeReturnTo`.

**Routes (`src/app/auth/`).**
- `login/route.ts` (GET):
  - canonical-host redirect;
  - store the transaction;
  - redirect 303 to the authorization endpoint with `ui_locales` from `resolveLocale` (fallback `en`);
  - `mode=register` adds `prompt=create`, or uses the realm `registrations` endpoint if `prompt=create` is unsupported. Record which.
- `callback/route.ts`: Scenario 8, then create the session and redirect 303 to `returnTo`.
- `logout/route.ts` (POST): Scenario 7.
- `session/route.ts` (GET): Scenario 9.
- `error/page.tsx`: the designed page; localized reasons; "Try again" to `/auth/login`; "Back to Home".

**Proxy.**
- `createApiProxy` gets an injected `resolveAccessToken(request)`.
- Remove `authorization` from `FORWARDED_REQUEST_HEADERS` and set it from the session.
- Add the Origin check for unsafe methods.
- On `invalid_grant`, append a cookie-clearing `Set-Cookie`.

**UI.**
- `src/components/AccountEntry.tsx` (client), placed in the Home header per the design:
  - anonymous: "Sign in" link to `/auth/login?returnTo=<path>`;
  - signed in: account button that opens the bottom sheet (name, username, "Sign out" form).
- Test ids: `account-signin`, `account-button`, `account-sheet`, `account-signout`.
- `auth` namespace in all 11 `messages/*.json`.
- `public/sw.js`: skip `/auth/*`; `VERSION` `v2`.

**Compose and env.**
- `web` env:
  - `WEB_DATABASE_URL`: `postgresql://<same user/password/db as the api>@postgres:5432/<db>`. Every query is schema-qualified (`web_session.*`), so no `search_path` is needed;
  - `WEB_PUBLIC_URL: http://localhost:${WEB_PORT:-3100}`;
  - `KEYCLOAK_PUBLIC_URL: http://localhost:${KEYCLOAK_PORT:-8180}`;
  - `KEYCLOAK_INTERNAL_URL: http://keycloak:8080`;
  - `KEYCLOAK_WEB_CLIENT_SECRET: ${BM_WEB_CLIENT_SECRET:-bm-web-dev-secret}`;
  - `WEB_SESSION_KEY: ${WEB_SESSION_KEY:-<dev base64 key>}`.
- No `depends_on`: Home works anonymously with Postgres or Keycloak down.
- `.env.example`: `BM_WEB_CLIENT_SECRET`, `WEB_SESSION_KEY`, with a comment on how to generate the key (`openssl rand -base64 32`).

**E2E.**
- `e2e/auth.spec.ts` covers Scenarios 1, 2, 5 (browser part), 7, 8 (returnTo, error page), 9 and 10. It reuses the Mailpit and localhost helpers from `keycloak-login-theme`.
- `e2e/auth-persist.spec.ts` is skipped unless `E2E_PERSIST_PHASE` is set:
  - phase `save`: sign in and write the storage state to `test-results/auth-state.json` (git-ignored);
  - phase `check`: load that state and expect the account entry plus `/api/me` 200.
  - `scripts/web/auth-persist-check.sh` runs `save`, then `docker compose restart web` with a wait for healthy, then `check` (Scenario 3).

**init.sh.**
- Keycloak step: the auth URL for `client_id=bricomission-web` must not return 400. If it does, print the reset hint and exit 1.
- Web step (via `localhost`):
  - `/auth/session` returns 200 `{"signedIn":false}`;
  - `/auth/login` returns 303 to the Keycloak auth endpoint with `client_id=bricomission-web` and `code_challenge_method=S256`. This proves the database is writable.
- Never runs Playwright.

## Expected File Changes

- `infra/keycloak/import/BricoMission-realm.json`: add the client. `compose.yaml` (keycloak and web env), `.env.example`: modify.
- Create:
  - `apps/web/src/lib/auth/{config,session,return-to}.ts`;
  - `src/lib/auth/oidc.ts`;
  - `src/lib/auth/db/{pool,migrations,crypto,session-repository}.ts`;
  - `src/app/auth/{login,callback,logout,session}/route.ts`, `src/app/auth/error/page.tsx`;
  - `src/components/AccountEntry.tsx`.
- Modify: `src/lib/api-proxy.ts`, `src/app/api/[...path]/route.ts`, `src/app/page.tsx`, `public/sw.js`, `messages/*.json` (11), `package.json`, `pnpm-lock.yaml`.
- Tests:
  - create `test/{oidc,session,return-to,crypto,session-repository,auth-routes}.test.ts`;
  - update `test/api-proxy.test.ts`;
  - create `e2e/auth.spec.ts`, `e2e/auth-persist.spec.ts`, `scripts/web/auth-persist-check.sh` (755);
  - modify `scripts/web/e2e.sh` if needed, and `init.sh`.
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes.
- Source: new frames on the B2C page in `design/openpencil/bricomission_B2C_app.fig`, which changes the approved Home header. Designed with the developer through the `open-pencil` MCP.
- A new design artifact is required.

### Design Brief For The OpenPencil Step

General rules:
- English only. Frames are 390x844 and checked at 360x780.
- Text wraps and tolerates ~30 % longer strings (de, fi).
- DESIGN.md tokens; reuse the approved Home and bottom-sheet styles.
- Visible focus ring; targets at least 44 px; never color alone.

Frames:
1. **Home header, anonymous**:
   - wordmark, language selector, and a discreet "Sign in" entry;
   - it must fit at 360 px in de/fi (an icon button with an accessible name is allowed);
   - the single primary CTA is unchanged.
2. **Home header, signed in**: an account button (initial or user icon) in place of "Sign in".
3. **Account sheet, open**: display name, username, secondary "Sign out", Close. States: default, focus.
4. **Sign-in problem page** (`/auth/error`): wordmark, icon, title "We couldn't sign you in", one helper per reason (cancelled, link expired, service unavailable, generic), primary "Try again", text link "Back to Home".

Read-back: `docs/design/homeowner-password-login.md`. For each frame and state it lists every element with layout, sizes, tokens (or raw values), text styles and final English copy, plus the line "approved by developer on <date>". Implementation follows it or the feature is `blocked`.

## Durable Documentation Impact

- `ARCHITECTURE.md`:
  - web auth (BFF, routes, cookies, the `web_session` schema and its ownership, encryption, cleanup);
  - the proxy token and CSRF rules;
  - the `bricomission-web` client;
  - runtime env and E2E layers.
- `AGENTS.md` "Identity": web sign-in path, `BM_WEB_CLIENT_SECRET` and `WEB_SESSION_KEY`, realm reset after pulling, `scripts/web/auth-persist-check.sh`.
- `DESIGN.md`: asset list and non-token values.
- `docs/technical-discovery.md`: the BFF and Postgres-session decisions (with the rejected options).
- `docs/user-and-access-model.md`: sign-out ends the Keycloak session; any account may sign in on the web.
- `docs/risks-and-open-questions.md`:
  - the web holds DB credentials (dedicated role later);
  - the dev default key must change outside local use;
  - cookies ignore ports, so worktrees on `localhost` share the `bm_session` name.
- `CONSTRAINTS.md`: not needed.

## Implementation Plan

1. Confirm the design artifact and that `keycloak-login-theme` is accepted.
2. Realm client plus env; realm reset; curl checks of the auth URL.
3. DB layer (migration, crypto, repository) and OIDC module with unit tests.
4. Routes, proxy change, AccountEntry, error page, SW, messages; workspace gate green.
5. Compose/env/init.sh; E2E specs and the persistence script; docs and evidence; status `passing`.

## Implementation Tasks

- [ ] Design artifact present; dependency accepted.
- [ ] `bricomission-web` client; realm reset; smoke green.
- [ ] `web_session` migration, AES-GCM crypto, repository, and cleanup with tests.
- [ ] OIDC config (explicit metadata), login, callback, logout and session routes, and returnTo, with tests.
- [ ] Proxy token injection, client header drop, CSRF check and refresh outcomes, with tests.
- [ ] AccountEntry and sheet, `/auth/error`, `auth` messages in 11 files, SW skip.
- [ ] Compose/env/init.sh; `auth.spec.ts`, `auth-persist.spec.ts` and `auth-persist-check.sh`.
- [ ] Docs, PROGRESS, evidence.

## Verification Plan

Use the orchestrator's exported env. No sudo, no GPU, never read `.env`.

- **Workspace gate:** `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`: exit 0, also offline (`unshare -rn` + `ip link set lo up`). OpenAPI drift check: `openapi:export` then `git diff --exit-code packages/api-client`.
- **Stack:** realm reset, then `docker compose up -d --build --wait`: 6 healthy services. Pin check. `ss -ltn` shows 127.0.0.1 only. `./scripts/keycloak-smoke.sh`: exit 0.
- **curl checks:**
  - `/auth/session` anonymous;
  - `/auth/login` under `NEXT_LOCALE=de` gives 303 with PKCE and `ui_locales=de`;
  - `returnTo=//evil.example` is stored as `/`;
  - `127.0.0.1` gets the 307 to `localhost`;
  - a foreign-Origin POST with a cookie gets 403;
  - a client `Authorization` header with no session gives 401 from `/api/me`.
- **psql in the postgres container:**
  - `\dt web_session.*` shows the 3 tables;
  - after an E2E sign-in, the session row has `bytea` tokens with no `eyJ` text;
  - `schema_migrations` holds version 1;
  - `public._prisma_migrations` is unchanged.
- **E2E and restart:**
  - `pnpm test:e2e`: all specs pass with the localhost guard;
  - `bash scripts/web/auth-persist-check.sh`: exit 0 (Scenario 3).
- **init.sh:** exit 0. Failure path: an old realm without the client exits 1 with the reset hint.
- **Static checks:**
  - `bash -n init.sh scripts/web/*.sh`;
  - `git grep -nE '"(value|secret)": *"[^$]' infra/keycloak` finds nothing.
- **Optional (developer):** network unplugged, `pnpm test:e2e` passes.

## Evidence To Capture

- Versions: `openid-client` (or the jose fallback) and `pg`. The `prompt=create` vs registrations-endpoint choice and the placeholder behavior.
- Test names and counts, the E2E list, Mailpit ids, curl, psql and persistence-check outputs, smoke and `./init.sh` tails with exit codes, the design artifact path and approval date.
- Deviations go into this spec's Implementation Notes.

## Validator Checklist

- [ ] UI matches the approved design; one primary CTA; no forced sign-in.
- [ ] No token in browser JS, HTML, `/auth/session` or the SW cache. The cookie is opaque and HttpOnly. The DB stores the id hash and AES-GCM ciphertext only.
- [ ] Sessions survive a web restart; expired rows are cleaned; the migration touches only `web_session`.
- [ ] PKCE, state, nonce and ID-token checks; safe `returnTo`; failures create no session.
- [ ] The proxy drops the client `Authorization`, injects the session token and enforces the CSRF check; refresh, `invalid_grant`, Keycloak-down and DB-down paths behave as specified.
- [ ] Sign-out ends the Keycloak session.
- [ ] No API or OpenAPI change, no Login Gate, no account language persistence.
- [ ] `./init.sh`, the smoke, `pnpm test:e2e` and the persistence check pass. Docs updated; status `passing`, not `accepted`.

## Risks

- `openid-client` may not accept split public and internal endpoints; the `jose` fallback is defined above.
- The web gets database credentials. The dev default `WEB_SESSION_KEY` must never be used outside local use.
- Each checkout needs a realm reset after this feature (and after `keycloak-login-theme`).
- Cookies ignore ports, so parallel worktrees on `localhost` overwrite each other's `bm_session`.

## Implementation Notes (implementer, 2026-11-13)

Design input: `docs/design/homeowner-password-login.md` (approved by developer on 2026-11-13), exports in `design/openpencil/homeowner-password-login/`. Dependency `keycloak-login-theme` is accepted.

### Planning-time unknowns

- **Library:** `openid-client` 6.9.0 accepts the split public/internal metadata (explicit `Configuration`, no discovery). The `jose` fallback was not needed. `enableNonRepudiationChecks` is on, so ID token signatures are verified against the internal JWKS (openid-client skips that by default). `pg` 8.23.1 (+ `@types/pg` 8.23.1, dev) traces into the standalone build.
- **`${VAR}` placeholders outside `credentials`:** they resolve. Verified after the realm reset: the authorization URL with `redirect_uri=http://localhost:3100/auth/callback` returns 200 and a foreign `redirect_uri` 400, the sign-in page links "Back to BricoMission" to `http://localhost:3100`, and `client_credentials` with `bm-web-dev-secret` authenticates while the literal `${BM_WEB_CLIENT_SECRET}` fails. No stop needed.
- **`prompt=create`:** supported by Keycloak 26.8.2 (the themed registration page opens, `ui_locales` applies). The `registrations` endpoint is not used.
- **`kc_locale`:** not used (keycloak-login-theme decision (a): `ui_locales` always wins; Keycloak stores no account locale).

### Deviations from the spec

- `/auth/login` failures (database down, abuse cap, bad key or missing secret) redirect 303 to `/auth/error?reason=unavailable` instead of a raw 503 JSON body: the route is a browser navigation and the designed page covers "unavailable". `/auth/session` and the proxy answer 503 `{"status":"error"}` as specified.
- `/auth/error` also accepts `returnTo` (re-validated with `safeReturnTo`), so "Try again" restarts sign-in with the original `returnTo` as the design requires. The callback adds it to failure redirects when the transaction was found. Reason `failed` and unknown values show the design's `generic` helper.
- AAD is a purpose label (`tx:`, `access:`, `refresh:`) plus the row's id hash, so access and refresh ciphertexts cannot be swapped either.
- Extra files: `src/lib/auth/handlers.ts` (route logic, unit-tested), `src/lib/auth/runtime.ts` (lazy process-wide wiring), `src/lib/auth/origin.ts` (CSRF rule), `test/support/fake-keycloak.ts`.
- The Origin rule compares the `Origin` host with the request `Host` (the existing `/locale` pattern) and requires `Origin` to be present; `POST /auth/logout` uses the same rule as the proxy.
- `bm_session` has `Max-Age` 36000 (Keycloak SSO max, 10 h); the row expiry decides validity. A stale cookie (no row) is cleared by `/auth/session` and the proxy.
- The callback deletes a previous session row of the same browser before creating the new one.
- The anonymous account entry is a link (`<a>`, accessible name "Sign in"): it navigates to `/auth/login` with no sheet, as the design describes.
- With a `bm_session` cookie present and the database down, `/api/health` through the proxy also returns 503 (the session lookup comes first), so `ApiStatus` shows offline instead of degraded for signed-in users in that case.
- `scripts/web/auth-persist-check.sh` also checks with psql that the session row is keyed by `sha256(bm_session)` and holds no `eyJ` text (Scenario 4 evidence).
- Language selector: below 375 px `max-[375px]:` variants give the compact pill (px 10, gap 4, globe 16, chevron 14, label 12/16); the label is `whitespace-nowrap` and the pill content is centered at every width.
