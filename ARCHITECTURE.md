# Architecture

Current, built architecture. Planned components live in `docs/technical-discovery.md` and `docs/adr/`.

## Monorepo (ADR 0003)

pnpm workspace (`pnpm-workspace.yaml`), pnpm pinned through `packageManager` in the root `package.json`.

- `apps/api` (`@bricomission/api`): NestJS 12 REST API, ESM (`"type": "module"`, `module: nodenext`, relative imports end in `.js`). Prisma 7 with the `@prisma/adapter-pg` driver adapter.
- `packages/shared-types` (`@bricomission/shared-types`): type-only contracts (`HealthResponse`, `RealmRole`, `MeResponse`, `AdminPingResponse`, ...). No runtime code and no build step. Consumers use `import type`; the API lists it as a devDependency.
- Planned: `apps/web` (Next.js PWA) and a generated API client (`web-pwa-shell`).

Root configs: `tsconfig.base.json` (strict), `eslint.config.mjs` (flat config, typescript-eslint recommended, `consistent-type-imports`). Every package exposes `lint` (ESLint + `tsc --noEmit`) and `test`.

## apps/api layout

- `src/main.ts`: creates the app, applies `configureApp`, listens on `0.0.0.0:$PORT` (default 3000).
- `src/app.setup.ts`: `configureApp(app)`, shared by `main.ts` and the HTTP tests. Shutdown hooks and OpenAPI: Swagger UI at `/docs`, JSON at `/docs-json`, assets served locally from `swagger-ui-dist` (works offline). No global route prefix.
- `src/app.module.ts`: root module importing feature modules.
- `src/prisma/`: global `PrismaModule` with `PrismaService` (extends the generated `PrismaClient`). It connects lazily on the first query, so the API boots and stays up while PostgreSQL is down; `$disconnect` runs on shutdown.
- `src/<feature>/`: one Nest module per feature (controller, service, Swagger DTO classes that `implement` shared types). First one: `src/health/`.
- `src/auth/`: Keycloak JWT authentication (`jose`). `AuthModule` registers two global guards with `APP_GUARD`, in this order:
  - `AuthGuard` is default-deny: every route needs `Authorization: Bearer <jwt>` unless the handler or controller is marked `@Public()`. `TokenVerifier` checks the RS256 signature through the `KEY_RESOLVER` provider (a lazy `createRemoteJWKSet` on `KEYCLOAK_JWKS_URL`, 3 s timeout, so the API boots without Keycloak), plus `iss` (`KEYCLOAK_ISSUER`), `aud` (`KEYCLOAK_AUDIENCE`) and `exp`. Missing or invalid tokens give 401 with `WWW-Authenticate: Bearer realm="BricoMission"`; a JWKS that is unreachable, times out or answers garbage gives 503. Bodies are the generic Nest error bodies and logs carry class names only.
  - `RolesGuard` enforces `@Roles(...roles: RealmRole[])`: 403 unless the caller holds one of the roles. Roles come from `realm_access.roles`, filtered to `user`, `professional`, `admin`.
  - `@CurrentUser()` injects the `AuthenticatedUser` (`sub`, `username`, `email`, `roles`). `GET /me` lives here.
- `src/admin/`: `AdminController` (`@Roles('admin')` on the class) with `GET /admin/ping`; later admin features extend this module.
- `prisma/schema.prisma` + `prisma.config.ts`: Prisma 7 keeps the datasource URL in `prisma.config.ts` (`DATABASE_URL`). No models yet. The client is generated into `src/generated/prisma` (git-ignored); `lint`, `test` and `build` run `prisma generate` first.

## API contract

OpenAPI (`/docs-json`) is the contract for the web PWA and the future native iOS client. Endpoints are documented with `@nestjs/swagger` decorators and DTO classes.

- `GET /health` (`@Public()`): `SELECT 1` raced against a 2 s timeout. 200 `{"status":"ok","database":"up"}` or 503 `{"status":"error","database":"down"}`. Error details are logged by class name only and never returned.
- `GET /me` (any realm role): 200 `{sub, username, email, roles}`; 401 without a valid token.
- `GET /admin/ping` (`admin` only): 200 `{"status":"ok"}`; 401 without a valid token, 403 for other roles.
- The OpenAPI document declares the `bearer` HTTP security scheme (`addBearerAuth()` in `configureApp`). Protected controllers carry `@ApiBearerAuth()` and their 401/403 responses. `/docs` and `/docs-json` are served by Swagger outside the Nest router, so they stay public.

## Runtime (compose.yaml)

| Service | Image | Host port (127.0.0.1) | Env override |
| --- | --- | --- | --- |
| postgres | `pgvector/pgvector:0.8.1-pg17` | 5432 | `POSTGRES_PORT` |
| minio | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | 9000 / 9001 | `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` |
| mailpit | `axllent/mailpit:v1.33.1` | 8025 / 1025 | `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` |
| keycloak | built from `infra/keycloak/Dockerfile` (`quay.io/keycloak/keycloak:26.8.2` + email-OTP provider jar) | 8180 | `KEYCLOAK_PORT` |
| api | built from `apps/api/Dockerfile` (`node:26.13.1-bookworm-slim`) | 3000 | `API_PORT` |

Keycloak runs `start-dev --import-realm` with `KC_DB=dev-file` (H2 in the `keycloak-data` volume). On the first start it imports realm `BricoMission` from `infra/keycloak/import/BricoMission-realm.json` (Keycloak requires the `<realm>-realm.json` file name); later starts skip the import (`IGNORE_EXISTING`). Issuer and backchannel are split. `KC_HOSTNAME=http://localhost:$KEYCLOAK_PORT` fixes the token `iss` for every caller, and `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` lets the api container fetch the JWKS at `http://keycloak:8080`. The api has no `depends_on` on keycloak, because `/health` must not need it. The management port 9000 (health) stays inside the container.

The api image is multi-stage: frozen install, `prisma generate` + `tsc`, then `pnpm deploy --prod --legacy` into a runtime stage that runs as user `node`. Build context is the repo root (`.dockerignore`). The api waits for postgres to be healthy and has its own `/health` healthcheck.

## Test layering

- `pnpm -r test` (Vitest + `unplugin-swc` for decorator metadata): DB-free unit tests and supertest HTTP tests with `PrismaService` overridden. No Docker needed.
- Auth tests (`test/auth.http.spec.ts`, `test/token-verifier.spec.ts`) override `KEY_RESOLVER` with a local JWKS built from a generated RS256 key pair (`test/support/tokens.ts`), so no Keycloak is needed.
- Real-database behavior (DB up/down/recovery) is checked against the compose stack (`./init.sh` checks `/health` reports `database: up` and the realm discovery issuer).
- Real Keycloak behavior is checked by `scripts/keycloak-smoke.sh` against the running stack: seeded role tokens, API 401/403/200 with real tokens, SMTP to Mailpit, and the email-code browser login (Authorization Code + PKCE driven with curl).
- Persistent browser E2E (Playwright) arrives with `web-pwa-shell`.
