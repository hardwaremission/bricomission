# Architecture

Current, built architecture. Planned components live in `docs/technical-discovery.md` and `docs/adr/`.

## Monorepo (ADR 0003)

pnpm workspace (`pnpm-workspace.yaml`), pnpm pinned through `packageManager` in the root `package.json`.

- `apps/api` (`@bricomission/api`): NestJS 12 REST API, ESM (`"type": "module"`, `module: nodenext`, relative imports end in `.js`). Prisma 7 with the `@prisma/adapter-pg` driver adapter.
- `packages/shared-types` (`@bricomission/shared-types`): type-only contracts (`HealthResponse`, ...). No runtime code and no build step. Consumers use `import type`; the API lists it as a devDependency.
- Planned: `apps/web` (Next.js PWA) and a generated API client (`web-pwa-shell`).

Root configs: `tsconfig.base.json` (strict), `eslint.config.mjs` (flat config, typescript-eslint recommended, `consistent-type-imports`). Every package exposes `lint` (ESLint + `tsc --noEmit`) and `test`.

## apps/api layout

- `src/main.ts`: creates the app, applies `configureApp`, listens on `0.0.0.0:$PORT` (default 3000).
- `src/app.setup.ts`: `configureApp(app)`, shared by `main.ts` and the HTTP tests. Shutdown hooks and OpenAPI: Swagger UI at `/docs`, JSON at `/docs-json`, assets served locally from `swagger-ui-dist` (works offline). No global route prefix.
- `src/app.module.ts`: root module importing feature modules.
- `src/prisma/`: global `PrismaModule` with `PrismaService` (extends the generated `PrismaClient`). It connects lazily on the first query, so the API boots and stays up while PostgreSQL is down; `$disconnect` runs on shutdown.
- `src/<feature>/`: one Nest module per feature (controller, service, Swagger DTO classes that `implement` shared types). First one: `src/health/`.
- `prisma/schema.prisma` + `prisma.config.ts`: Prisma 7 keeps the datasource URL in `prisma.config.ts` (`DATABASE_URL`). No models yet. The client is generated into `src/generated/prisma` (git-ignored); `lint`, `test` and `build` run `prisma generate` first.

## API contract

OpenAPI (`/docs-json`) is the contract for the web PWA and the future native iOS client. Endpoints are documented with `@nestjs/swagger` decorators and DTO classes.

- `GET /health`: `SELECT 1` raced against a 2 s timeout. 200 `{"status":"ok","database":"up"}` or 503 `{"status":"error","database":"down"}`. Error details are logged by class name only and never returned.

## Runtime (compose.yaml)

| Service | Image | Host port (127.0.0.1) | Env override |
| --- | --- | --- | --- |
| postgres | `pgvector/pgvector:0.8.1-pg17` | 5432 | `POSTGRES_PORT` |
| minio | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | 9000 / 9001 | `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` |
| mailpit | `axllent/mailpit:v1.33.1` | 8025 / 1025 | `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` |
| api | built from `apps/api/Dockerfile` (`node:26.13.1-bookworm-slim`) | 3000 | `API_PORT` |

The api image is multi-stage: frozen install, `prisma generate` + `tsc`, then `pnpm deploy --prod --legacy` into a runtime stage that runs as user `node`. Build context is the repo root (`.dockerignore`). The api waits for postgres to be healthy and has its own `/health` healthcheck.

## Test layering

- `pnpm -r test` (Vitest + `unplugin-swc` for decorator metadata): DB-free unit tests and supertest HTTP tests with `PrismaService` overridden. No Docker needed.
- Real-database behavior (DB up/down/recovery) is checked against the compose stack (`./init.sh` checks `/health` reports `database: up`).
- Persistent browser E2E (Playwright) arrives with `web-pwa-shell`.
