# Feature Implementation Spec: Keycloak realm issues tokens the API authorizes by role

## Source Feature

- `id`: keycloak-realm-roles
- `area`: identity
- `depends_on`: api-skeleton (accepted)
- `status`: not_started (at planning time, 2026-11-13)
- `source`: `feature_list.json`

## Goal

Keycloak runs as a core compose service. Realm `BricoMission` is imported on container start from a versioned JSON file. The realm has the realm roles `user`, `professional` and `admin`, three seeded accounts (one per role) whose passwords come from env vars, SMTP pointed at Mailpit, and browser login that requires password plus an email one-time code. The API checks Keycloak JWTs (signature through JWKS, issuer, audience, expiry) and authorizes by realm role. By default every route requires a token, and routes opt out with `@Public()`. `./init.sh` also checks that Keycloak is healthy and the realm is served.

## Non-Goals

- Any UI. That includes the PWA login, Keycloak login-theme styling (`homeowner-password-login`, UI gate) and the OIDC client for `apps/web`.
- Self-registration, Professional registration with Tax ID, `pending_validation` state, Company (`professional-registration`, `admin-company-validation`).
- Google SSO / identity providers (`google-sso-login`). Re-authentication for Electronic Acceptance.
- Local user profile tables or Prisma models. Keycloak Admin API client in the API (`admin-user-management`).
- Resource-level rules (ownership, Company scoping). This feature only does role checks.
- Production hardening: TLS, a Postgres-backed Keycloak, clustering, brute-force tuning, password policy.

## Job Story

When I build any protected endpoint,
I want a running realm with seeded role accounts and an API guard that rejects missing, invalid or under-privileged tokens,
so I can declare `@Roles('admin')` and trust that 401/403 are enforced consistently.

## Users And Permissions

- Anonymous: only `@Public()` routes (`/health`, `/docs`, `/docs-json`).
- `user` (Homeowner), `professional`, `admin`: any valid token reaches `GET /me`. Only `admin` reaches `GET /admin/ping`.
- The seeded admin has only `admin`, never `user` or `professional` (`docs/user-and-access-model.md`: an Administrator never acts as a Homeowner).

## Acceptance Scenarios

### Scenario 1: Realm imported on start
Given a fresh compose project (no keycloak volume)
When `docker compose up -d --build --wait` runs
Then `keycloak` is healthy. `GET http://127.0.0.1:$KEYCLOAK_PORT/realms/BricoMission/.well-known/openid-configuration` returns 200 with `issuer` = `http://localhost:$KEYCLOAK_PORT/realms/BricoMission`. The log shows the realm import from `/opt/keycloak/data/import`.

### Scenario 2: Restart keeps state, no duplicate import
Given the realm exists in the `keycloak-data` volume
When `docker compose restart keycloak` (or `down` + `up`) runs
Then Keycloak becomes healthy again, the import is skipped (IGNORE_EXISTING), and the seeded accounts still log in.

### Scenario 3: Seeded accounts get role tokens
Given the stack is healthy
When a password grant runs against client `bricomission-dev-cli` for `bm-admin`, `bm-homeowner` and `bm-professional`
Then each request returns an access token. `realm_access.roles` contains `admin`, `user` and `professional` respectively, and never another of the three. `aud` contains `bricomission-api`.

### Scenario 4: API role enforcement (unit/HTTP, DB-free, no Keycloak)
Given the Nest app in tests with a local JWKS (generated RS256 key pair)
Then:
- `GET /admin/ping` without a token gives 401 with a `WWW-Authenticate: Bearer` header.
- A token with role `user` gives 403. Role `professional` gives 403. Role `admin` gives 200 `{"status":"ok"}`.
- `GET /me` with a `user` token gives 200 `{sub, username, email, roles}`. Without a token it gives 401.
- These tokens give 401: expired, wrong `iss`, wrong `aud`, signed by another key, `alg: none`, malformed, or a non-Bearer scheme.
- When the key resolver fails for a non-JOSE reason (JWKS unreachable or timeout), the response is 503. Error bodies never include token contents or error messages.
- `GET /health` still returns 200 without a token. `/docs-json` declares a bearer security scheme on `/me` and `/admin/ping`, with 401/403 responses.

### Scenario 5: API role enforcement against real Keycloak (compose smoke)
Given the stack is healthy
When `scripts/keycloak-smoke.sh` runs
Then API `/admin/ping` returns: no token 401, homeowner 403, professional 403, admin 200. `/me` with the homeowner token returns 200 with `username` `bm-homeowner`.

### Scenario 6: SMTP goes to Mailpit
Given the stack is healthy
When the smoke script uses the master bootstrap admin to call `PUT /admin/realms/BricoMission/users/{bm-homeowner id}/send-verify-email`
Then within 10 s the Mailpit API (`/api/v1/search?query=to:homeowner@bricomission.local`) lists a message from `noreply@bricomission.local`.

### Scenario 7: Browser login requires the email code
Given the stack is healthy and Mailpit messages for the homeowner were deleted
When the smoke script runs an Authorization Code + PKCE login with curl (client `bricomission-dev-cli`, redirect `http://localhost/dev-callback`) and posts the homeowner's password
Then the next page asks for an email code instead of redirecting, and Mailpit receives a message with the code. The script posts the code and gets a 302 to the redirect URI with `code=`. Exchanging that code yields a token with role `user`. A wrong code does not redirect.

### Scenario 8: init.sh gates on Keycloak
When `./init.sh` runs with Docker available
Then the compose gate waits for 5 healthy services, including `keycloak`. A "Keycloak:" step checks the discovery issuer and exits 1 with `docker compose logs --tail 50 keycloak` on mismatch. The script still exits 0 on the happy path and starts no foreground process.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `feature_list.json`: rules, state, and this feature's verification items.
- `docs/user-and-access-model.md`: roles `user`/`professional`/`admin`; the admin is seeded; the admin never acts as a Homeowner.
- `docs/technical-discovery.md`: OIDC Code + PKCE; API validates Keycloak JWTs; Mailpit as the offline OTP inbox; integration tests against a Keycloak test realm.
- `ARCHITECTURE.md`: API layout (`src/<feature>/` modules, `configureApp`), runtime table, test layering.
- `compose.yaml`, `.env.example`, `init.sh`: conventions (`${VAR:-default}`, 127.0.0.1 ports, healthcheck 5s/5s/20, named volumes, no `name:`).
- `apps/api/{package.json,vitest.config.ts,src/main.ts,src/app.module.ts,src/app.setup.ts,test/health.http.spec.ts}`: ESM, NestJS 12.5.0, Vitest + SWC, and the override-provider test pattern.
- `docs/specs/api-skeleton.md`: style reference. Not inspected: Keycloak images, release notes and authenticator ids (no network in planning). Verify them at implementation time.

### Existing Patterns To Follow

- `configureApp` holds app-wide setup shared by `main.ts` and the tests. Swagger `DocumentBuilder` lives there.
- Tests override providers via `Test.createTestingModule(...).overrideProvider(...)`. The tests need neither a DB nor Docker.
- Shared contracts go in `packages/shared-types` as types only (`import type`).

### Current Gaps

- No auth code, no `jose`, no Keycloak service, no realm JSON, no smoke script.
- Email OTP: core Keycloak may or may not ship an email-code login authenticator in the pinned version (see Technical Approach, step "Email OTP").

## Technical Approach

**Keycloak service (`compose.yaml`).**
- Image: `quay.io/keycloak/keycloak:<newest stable exact X.Y.Z>`. Verify that the tag exists and record its digest.
- `command: ["start-dev", "--import-realm"]`.
- Env:
  - `KC_DB: dev-file`, `KC_HEALTH_ENABLED: "true"`.
  - `KC_HOSTNAME: http://localhost:${KEYCLOAK_PORT:-8180}` (fixed issuer for every caller) and `KC_HOSTNAME_BACKCHANNEL_DYNAMIC: "true"`, so the api reaches `http://keycloak:8080`.
  - `KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN_USERNAME:-admin}`, `KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-bricomission-kc-admin}`.
  - Seed passwords `BM_SEED_ADMIN_PASSWORD`, `BM_SEED_HOMEOWNER_PASSWORD`, `BM_SEED_PROFESSIONAL_PASSWORD` with `-dev` defaults.
- Volumes: `./infra/keycloak/import:/opt/keycloak/data/import:ro` and named volume `keycloak-data:/opt/keycloak/data/h2`.
- Port: `127.0.0.1:${KEYCLOAK_PORT:-8180}:8080`. Do not publish management port 9000 (it would clash with MinIO on the host).
- Healthcheck: the image has no curl, so use bash `/dev/tcp`. Example: `exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3 && grep -q '"UP"' <&3`. interval 5s, timeout 5s, retries 30, start_period 120s.
- `depends_on: mailpit: service_healthy`.
- `restart: unless-stopped`.
- dev-file (H2) is a deliberate local-only choice: no shared-DB bootstrap and isolated per worktree. Record it in `docs/technical-discovery.md`.

**Realm JSON (`infra/keycloak/import/bricomission-realm.json`).** Keep it hand-written and minimal. Do not paste a full export. Contents:
- Realm settings:
  - `realm: BricoMission`, `enabled`, `sslRequired: external`.
  - `registrationAllowed: false`, `loginWithEmailAllowed: true`, `duplicateEmailsAllowed: false`.
  - `accessTokenLifespan: 300`.
- `roles.realm`: `user`, `professional`, `admin`, each with a description. Do not add any of them to default roles.
- Client scope `bricomission-api-audience` (openid-connect, `oidc-audience-mapper`, `included.client.audience: bricomission-api`, access token only). Add it to `defaultDefaultClientScopes`.
- Clients:
  - `bricomission-api`: confidential and bearer-only in practice, with every flow disabled. It exists only as the audience.
  - `bricomission-dev-cli`: public, `directAccessGrantsEnabled: true`, `standardFlowEnabled: true`, `redirectUris: ["http://localhost/dev-callback"]`, attribute `pkce.code.challenge.method: S256`. Its description says "local development and smoke tests only".
- `users`: `bm-admin`, `bm-homeowner`, `bm-professional`.
  - Emails: `admin@`, `homeowner@`, `professional@bricomission.local`. Each has `emailVerified: true`, a first and last name, and `realmRoles` with exactly its role.
  - Credentials: `{"type":"password","value":"${BM_SEED_..._PASSWORD}","temporary":false}`. Keycloak replaces `${ENV}` placeholders in import files. Confirm this works. If it does not, stop and report; never commit a cleartext real password. The dev defaults live only in compose and `.env.example`.
- `smtpServer`: `host: mailpit`, `port: "1025"`, `from: noreply@bricomission.local`, `fromDisplayName: BricoMission`, `auth: false`, `ssl: false`, `starttls: false`.
- Email OTP flow (browser): copy the built-in browser flow as `browser-email-otp`. Keep the cookie (ALTERNATIVE), then a sub-flow (ALTERNATIVE) holding `auth-username-password-form` (REQUIRED) and the email-code authenticator (REQUIRED). Bind it with `browserFlow: browser-email-otp`. Leave `directGrantFlow` default: password grants on the dev client skip the email code, and that is acceptable only because the client is local and dev-only. Document this.
- Email OTP availability check: first list the provider ids of the pinned image (`GET /admin/realms/BricoMission/authentication/authenticator-providers` with a master admin token) and use the core email-code authenticator if one exists. If core has none, add `infra/keycloak/Dockerfile` `FROM` the pinned image. It copies one pinned open-source email-OTP provider jar, downloaded at build time with a `sha256sum -c` check, then runs `kc.sh build`. Record the source, license and checksum in `docs/risks-and-open-questions.md`. Set the code length to 6 digits if configurable. Either way, record the provider id in evidence.

**API auth module (`apps/api/src/auth/`).**
- Dependency: `jose` (exact version).
- `auth.config.ts` reads `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL` and `KEYCLOAK_AUDIENCE`. Defaults: `http://localhost:8180/realms/BricoMission`, `http://keycloak:8080/realms/BricoMission/protocol/openid-connect/certs`, `bricomission-api`.
- `KEY_RESOLVER` injection token. The default is `createRemoteJWKSet(new URL(jwksUrl), {timeoutDuration: 3000})`, so the JWKS is fetched lazily and the api boots without Keycloak.
- `TokenVerifier` service: `jwtVerify(token, resolver, {issuer, audience, algorithms: ['RS256']})` maps the payload to `AuthenticatedUser` (`sub`, `preferred_username`, `email`, `roles` = `realm_access.roles` filtered to `RealmRole`).
- `AuthGuard`, registered globally with `APP_GUARD`:
  - Skips handlers or classes marked `@Public()`.
  - Requires `Authorization: Bearer <jwt>`.
  - Sends 401 `UnauthorizedException` with header `WWW-Authenticate: Bearer realm="BricoMission"` when the token is missing or invalid (any `JOSEError` except a JWKS timeout).
  - Sends 503 `ServiceUnavailableException` when the JWKS is unreachable or times out.
  - Attaches the user to the request.
- `RolesGuard` (global, runs after `AuthGuard`) plus `@Roles(...roles: RealmRole[])`: 403 `ForbiddenException` if the user has none of the roles.
- `@CurrentUser()` param decorator.
- Log only error class names.
- Controllers:
  - `src/auth/me.controller.ts`: `GET /me` returns a `MeResponse` DTO.
  - `src/admin/admin.controller.ts`: `GET /admin/ping` with `@Roles('admin')` returns `{status:'ok'}`. It is the minimal admin-only route, a placeholder that later admin features extend.
  - Mark `HealthController` with `@Public()`.
  - Swagger: `addBearerAuth()` in `configureApp`, plus `@ApiBearerAuth()`, `@ApiUnauthorizedResponse()`, `@ApiForbiddenResponse()` where they apply.
- `packages/shared-types`: add `RealmRole = 'user' | 'professional' | 'admin'`, `MeResponse` and `AdminPingResponse`.
- Compose `api` env: `KEYCLOAK_ISSUER: http://localhost:${KEYCLOAK_PORT:-8180}/realms/BricoMission`, `KEYCLOAK_JWKS_URL: http://keycloak:8080/realms/BricoMission/protocol/openid-connect/certs`, `KEYCLOAK_AUDIENCE: bricomission-api`. No `depends_on` keycloak, because `/health` must not need Keycloak.

**Tests (`apps/api/test/auth.http.spec.ts`, `apps/api/test/token-verifier.spec.ts`).**
- In `beforeAll`, run `generateKeyPair('RS256')`, export the public JWK with a `kid`, and override `KEY_RESOLVER` with `createLocalJWKSet`. Also override `PrismaService` as the health test does.
- Add a token factory helper (`test/support/tokens.ts`) that wraps `SignJWT` with claim overrides.
- Cover every case in Scenario 4, including a second foreign key pair, a `KEY_RESOLVER` that throws a JWKS-timeout-style error (503), and the docs-json security checks.
- The existing 7 tests must stay green.

**Smoke script (`scripts/keycloak-smoke.sh`, bash, `set -euo pipefail`, uses curl + python3 for JSON/HTML parsing).**
- Ports come from `docker compose port` (keycloak 8080, api 3000, mailpit 8025). Passwords come from the env, with the same defaults as compose.
- It runs Scenarios 3, 5, 6 and 7 in order and prints `[ok]`/`[fail]` per check. Exit 0 only if every check passes.
- Read-only towards the repo. Its only side effects are Mailpit messages it deletes (`DELETE /api/v1/search?query=to:...`) and a used login session.

**init.sh.**
- Update the header comment (5 services).
- After "API health", add "Keycloak:":
  - `kc_port=$(docker compose port keycloak 8080 | cut -d: -f2)`.
  - curl the discovery URL (max 10 s) and compare `issuer` to `http://localhost:${kc_port}/realms/BricoMission` with python3.
  - On failure, print the logs and exit 1.
- Print the Keycloak admin console URL, the realm account URL and `./scripts/keycloak-smoke.sh` in the final hints.
- Do not run the smoke script from init.sh. Keep the gate fast.

## Expected File Changes

- `compose.yaml`: add the `keycloak` service, the `keycloak-data` volume, api env and the header comment.
- `.env.example`: add `KEYCLOAK_PORT=8180`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD` and the three `BM_SEED_*_PASSWORD`, each with a comment.
- `infra/keycloak/import/bricomission-realm.json`: create.
- `infra/keycloak/Dockerfile`: create only if the email-OTP fallback is needed.
- `apps/api/src/auth/*` (config, verifier, guards, decorators, module, me controller, DTOs): create. `apps/api/src/admin/*`: create.
- `apps/api/src/app.module.ts`, `app.setup.ts` and `src/health/health.controller.ts`: modify.
- `apps/api/package.json` and `pnpm-lock.yaml`: add `jose`.
- `apps/api/test/auth.http.spec.ts`, `test/token-verifier.spec.ts`, `test/support/tokens.ts`: create.
- `packages/shared-types/src/index.ts`: modify.
- `scripts/keycloak-smoke.sh` (mode 755): create. `init.sh`: modify.
- `ARCHITECTURE.md`, `AGENTS.md`, `docs/technical-discovery.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md` (if fallback or findings), `PROGRESS.md`, `feature_list.json`: update.

## Visual Design Impact

- UI involved: no. The default Keycloak login pages appear only in the curl smoke. Theming belongs to `homeowner-password-login` (UI gate there). No design artifact.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Add:
  - `src/auth/` (global default-deny guard, `@Public()`, `@Roles()`, `@CurrentUser()`, JWKS via `KEY_RESOLVER`).
  - The `keycloak` runtime row (`KEYCLOAK_PORT`).
  - The issuer/backchannel split.
  - Test layering (local JWKS in unit/HTTP tests, compose smoke script).
- `CONSTRAINTS.md`: not needed. Rules stay in `AGENTS.md`.
- `AGENTS.md`: update. Add a short "Identity" section:
  - Seeded accounts and their env vars.
  - `scripts/keycloak-smoke.sh`.
  - New routes must be `@Public()` explicitly, or they are protected.
  - Realm JSON changes need a realm reset: `docker compose rm -sf keycloak && docker volume rm ${COMPOSE_PROJECT_NAME}_keycloak-data` (only after confirming the project name).
- `docs/technical-discovery.md`: update. Add Keycloak dev-file persistence, fixed issuer, email OTP provider.
- `docs/user-and-access-model.md`: update. Add the seeded accounts, and that browser password login requires the email code for all realm users.

## Implementation Plan

1. Pick and verify the Keycloak tag. Bring Keycloak up with a minimal realm and confirm import, health, the fixed issuer and env placeholders.
2. Probe the email-code authenticator. Build the realm: roles, audience scope, clients, users, SMTP, browser flow (use the fallback image only if needed).
3. Write the API auth module, controllers and shared types, then the tests. Get `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r test` green.
4. Wire the compose api env and `.env.example`. Write `scripts/keycloak-smoke.sh` and run Scenarios 1-3 and 5-7.
5. Update init.sh (Scenario 8) and the docs, then record evidence. Set status `passing`, never `accepted`.

## Implementation Tasks

- [ ] Pinned Keycloak tag and digest recorded. compose service with healthcheck, volume and 127.0.0.1 port.
- [ ] Realm JSON: roles, audience scope, two clients, three users via env placeholders, SMTP, email-OTP browser flow.
- [ ] `jose`-based verifier, global Auth/Roles guards, decorators, `/me`, `/admin/ping`, `@Public()` health, Swagger bearer.
- [ ] Shared types. Unit + HTTP tests for every Scenario 4 case.
- [ ] `scripts/keycloak-smoke.sh` (Scenarios 3, 5-7).
- [ ] init.sh Keycloak step. `.env.example`. Docs. Evidence.

## Verification Plan

Use the worktree env (`COMPOSE_PROJECT_NAME`, `KEYCLOAK_PORT=8390`, `API_PORT`, and so on, as exported). Use `newgrp docker` if needed. No sudo, no GPU, never read `.env`.

- `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`: exit 0. Test names show each Scenario 4 case, and the 7 pre-existing tests pass.
- `docker compose config -q`, then `docker compose up -d --build --wait`: 5 healthy services. Pin check (awk from `docs/specs/infra-compose-core.md`) passes.
- `curl -s http://127.0.0.1:$KEYCLOAK_PORT/realms/BricoMission/.well-known/openid-configuration` shows the issuer from Scenario 1. `docker compose logs keycloak | grep -i import` shows the import.
- `./scripts/keycloak-smoke.sh`: exit 0, with every `[ok]` line for Scenarios 3, 5, 6 and 7.
- Scenario 2: `docker compose restart keycloak`, wait for healthy, re-run the smoke: exit 0. The log shows the realm import skipped.
- `ss -ltn` shows the Keycloak port on 127.0.0.1 only. Port 9000 is not published by keycloak.
- `git grep -nE '"value": *"[^$]' infra/keycloak` finds no cleartext credential.
- `./init.sh`: exit 0 with the Keycloak step (Scenario 8). Failure path: in a scratch shell, run `docker compose stop keycloak`. init.sh `up --wait` restarts it. Check the discovery comparison code path by review.
- `bash -n init.sh scripts/keycloak-smoke.sh`.
- E2E: there is no persistent E2E harness yet (Playwright arrives with `web-pwa-shell`). The DB-free HTTP tests plus the compose smoke script cover the auth flows.

## Evidence To Capture

- Keycloak tag and digest, the email-code provider id (core or fallback jar with its sha256), and the `jose` version.
- The test list with pass counts, the smoke script output, the discovery issuer, the Mailpit message ids/subjects for Scenarios 6-7, and the `./init.sh` tail and exit code.
- Record them in `feature_list.json` `evidence` and in a `PROGRESS.md` session entry (update Current Verified State: 5 services, Keycloak step).

## Validator Checklist

- [ ] Scope: no UI, theme, registration, Google SSO, Prisma models or Keycloak admin client in the API.
- [ ] Image pinned (exact tag), named volume, healthcheck, 127.0.0.1 port overridable via `KEYCLOAK_PORT`; `.env.example` matches the compose defaults. No real or cleartext secrets in the realm JSON.
- [ ] Realm imported from the versioned JSON on start, and skipped (not duplicated) on restart.
- [ ] Seeded tokens carry exactly their role and `aud` `bricomission-api`. The admin lacks `user`.
- [ ] The guard is default-deny. `/health` and `/docs` stay public. 401 vs 403 vs 503 semantics are as specified, with no error leakage.
- [ ] Tests run with no Docker. The smoke passes against real Keycloak, including the SMTP and email-code login.
- [ ] init.sh gates on Keycloak and starts nothing long-running. The docs are updated. Status is `passing`, not `accepted`.

## Implementation Notes (2026-11-13, implementer)

Findings that changed details of the plan above (behavior and acceptance scenarios unchanged):

- Realm file name: Keycloak 26.8.2 refuses `bricomission-realm.json` ("File name should be BricoMission-realm.json"). The file is `infra/keycloak/import/BricoMission-realm.json`.
- Audience: any `clientScopes` array in the import replaces Keycloak's built-in default scopes (`basic`, `profile`, `email`, `roles`, ...). Tokens then lose `sub`/`realm_access`. So the `oidc-audience-mapper` (`included.client.audience: bricomission-api`, access token only) sits on client `bricomission-dev-cli` as a protocol mapper, not in a custom default client scope. Future clients (for example the `apps/web` OIDC client) must add the same mapper.
- Email OTP: core 26.8.2 has no email-code authenticator. The fallback `infra/keycloak/Dockerfile` is used: mesutpiskin/keycloak-2fa-email-authenticator v26.7.2 (KC26.8.2 build), Apache-2.0, sha256 `0e3dd714...61fc`, provider id `email-authenticator-no-enrollment`. The jar is fetched in a `RUN` step of a `node:26.13.1-bookworm-slim` stage (the base the API already pins; the Keycloak image has no curl) and checked with `sha256sum -c`. The `RUN` layer is cached by instruction text, so offline rebuilds reuse it.
- The h2 directory is created in the image so a fresh `keycloak-data` volume is writable by the keycloak user.
- The 503 mapping also covers the generic `JOSEError` (JWKS answered non-200 or non-JSON) and `JWKSInvalid`, besides `JWKSTimeout` and non-JOSE errors. These are key-source failures, not token failures.
