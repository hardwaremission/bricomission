# Feature Implementation Spec: NestJS API answers health and exposes OpenAPI

## Source Feature

- `id`: api-skeleton
- `area`: backend
- `depends_on`: infra-compose-core (accepted)
- `status`: not_started (at planning time, 2026-11-12)
- `source`: `feature_list.json`

## Goal

Bootstrap the application codebase. This means a pnpm TypeScript monorepo (ADR 0003) with `apps/api` (NestJS + Prisma on the existing PostgreSQL) and a minimal shared types package. The API runs as a compose service next to postgres/minio/mailpit. `GET /health` reports database up/down, and `/docs` serves Swagger UI with the OpenAPI JSON at `/docs-json`. `./init.sh` moves to the bootstrapped variant: install with the frozen lockfile, lint, test, then the compose gate including API health.

## Non-Goals

- `apps/web`, the generated API client package, and any UI (`web-pwa-shell`). No OpenPencil gate is needed.
- Auth/Keycloak, guards, roles (`keycloak-realm-roles`).
- Domain models or migrations (Kitchen Project, etc.). Prisma ships with datasource + generator only.
- MinIO/S3 client, Mailpit/SMTP, SSE, job queue (the queue choice belongs to `gpu-job-broker`), AI adapters, GPU.
- i18n, structured logging beyond Nest's default logger, CI pipelines.
- Production hardening (TLS, rate limiting).

## Job Story

When I start the first product feature,
I want a running, tested API skeleton wired to the real database and documented by OpenAPI,
so I can add endpoints without re-deciding tooling, layout or the verification gate.

## Users And Permissions

- No product roles. `/health`, `/docs` and `/docs-json` are public and unauthenticated (local only, bound to 127.0.0.1).
- Agents: no `sudo`, no global npm installs that need root. Install pnpm through corepack or user-level only.

## Acceptance Scenarios

### Scenario 1: Workspace installs reproducibly
Given a clean checkout with `pnpm-lock.yaml` committed
When `pnpm install --frozen-lockfile` runs at the repo root
Then it exits 0 and no lockfile change appears in `git status`.

### Scenario 2: Lint and tests pass
Given the installed workspace
When `pnpm -r lint` and `pnpm -r test` run
Then both exit 0. `lint` covers ESLint and `tsc --noEmit` for every package. `test` runs at least the health unit tests and the HTTP tests below, and needs no running database.

### Scenario 3: API runs in compose and reports DB up
Given `COMPOSE_PROJECT_NAME=api-skeleton POSTGRES_PORT=5534 MINIO_API_PORT=9200 MINIO_CONSOLE_PORT=9201 MAILPIT_UI_PORT=8225 MAILPIT_SMTP_PORT=1225 API_PORT=3200`
When `docker compose up -d --build --wait` runs
Then all four services (postgres, minio, mailpit, api) are healthy, and `curl -s http://127.0.0.1:3200/health` returns HTTP 200 with JSON body `{"status":"ok","database":"up"}` (extra fields allowed, these two required).

### Scenario 4: Database down is reported, not crashed
Given the stack is healthy
When `docker compose stop postgres` runs and `/health` is requested
Then it returns HTTP 503 with `{"status":"error","database":"down"}` within about 5 s, and the api container keeps running. After `docker compose start postgres`, `/health` returns 200 / `up` again without restarting api.

### Scenario 5: OpenAPI is served offline
Given the stack is healthy
When `curl -s http://127.0.0.1:3200/docs-json` and `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3200/docs` run
Then the JSON has `openapi` 3.x, `info.title` "BricoMission API", and a `/health` path documenting the 200 and 503 responses. `/docs` returns 200. Swagger UI assets come from the local `swagger-ui-dist` package (no CDN URLs in the HTML).

### Scenario 6: init.sh bootstrapped gate passes
Given Docker works and pnpm is resolvable (`pnpm` on PATH, or `corepack pnpm`)
When `./init.sh` runs
Then it runs prerequisites, the feature_list check, `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`, and `docker compose config -q` + `up -d --build --wait`. It then verifies `/health` reports `database: up` on the port given by `docker compose port api 3000`, and exits 0. It starts no foreground or long-running process.

### Scenario 7: init.sh failure paths
- pnpm not resolvable: prints how to get it without sudo (see Technical Approach), exits 1.
- install/lint/test failure: exits non-zero with the failing step named.
- Docker CLI absent: keeps the existing "Docker not installed ... Compose gate skipped." message and exits 0, after the pnpm steps passed.
- Daemon unreachable or unhealthy stack: unchanged behavior (exit 1).
- API health not `up`: prints the response and `docker compose logs --tail 50 api`, exits 1.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`: rules (English, bash, Compose v2, pinned images, named volumes, healthchecks, subagents never commit).
- `PROGRESS.md`: infra accepted; pnpm not installed; "`pnpm -r lint && pnpm -r test` joins after `api-skeleton`".
- `feature_list.json`: this feature's verification (frozen install, lint+test with at least one API test, `/health` database up, bootstrapped init.sh). `web-pwa-shell` is a separate feature that consumes `/health` through a generated client.
- `docs/adr/0003-typescript-monorepo-nextjs-nestjs.md`: pnpm workspace, `apps/api` NestJS REST + OpenAPI + Prisma, shared packages.
- `docs/technical-discovery.md`: compose service `api`, per-worktree `COMPOSE_PROJECT_NAME`, offline after first pull, tests against the compose stack later.
- `compose.yaml`: no `name:`, every variable `${VAR:-default}`, ports `127.0.0.1:${X_PORT:-n}:n`, healthchecks 5s/5s/20/10s, `restart: unless-stopped`.
- `init.sh`: infra variant; `check()` helper already tries `pnpm --version || corepack pnpm --version`; compose gate with `up -d --wait --wait-timeout 180`.
- `.env.example`, `.gitignore` (`.env`, `.env.*` ignored; no node_modules entry yet).
- `docs/specs/infra-compose-core.md`: style reference.
- Not inspected: there is no application code, `package.json` or lockfile yet. Whether corepack exists on the host Node 26 is unverified: Node 25+ no longer bundles corepack.

### Existing Patterns To Follow

- Compose conventions above, with overridable host ports bound to 127.0.0.1.
- `init.sh` style: `set -euo pipefail`, `[ok]/[missing]` lines, clear fix messages, exit codes per scenario.

### Current Gaps

- No Node workspace, no pnpm on PATH, no `.dockerignore`, no `ARCHITECTURE.md`.

## Technical Approach

**pnpm on the host (no sudo).** Pick the newest stable exact pnpm 10.x version and pin it as `"packageManager": "pnpm@10.x.y"` in the root `package.json`. Resolve pnpm in this order: (1) `corepack pnpm` if `corepack` exists; (2) `npx --yes corepack@<pinned> enable --install-directory "$HOME/.local/bin"`; (3) `npm install --prefix "$HOME/.local" pnpm@<same version>`. Record which path worked. Never use `sudo` or a root-owned global prefix.

**Workspace layout.**
- Root: `package.json` (private; `packageManager`; `engines.node >=24`; scripts `lint`, `test` delegating with `pnpm -r`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`; `onlyBuiltDependencies` listing exactly the packages whose install scripts are required, e.g. `prisma`, `@prisma/client`, `@prisma/engines`, `@nestjs/core` if needed), `pnpm-lock.yaml`, `tsconfig.base.json` (strict), `eslint.config.mjs` (flat config, typescript-eslint recommended), `.dockerignore`.
- `packages/shared-types` (`@bricomission/shared-types`): types only, no build step. `package.json` sets `"types": "src/index.ts"`, and `src/index.ts` exports `HealthStatus = 'ok' | 'error'`, `DatabaseStatus = 'up' | 'down'` and `HealthResponse`. Scripts: `lint` (eslint + `tsc --noEmit`), `test` (`echo "no tests"`, exit 0, or a trivial type test). The API consumes it through `workspace:*` with `import type` only, so nothing is needed at runtime.
- `apps/api` (`@bricomission/api`): NestJS (current stable major, exact versions in the lockfile). Files: `src/main.ts`, `src/app.module.ts`, `src/app.setup.ts` (`configureApp(app)`: Swagger setup and shutdown hooks, shared by `main.ts` and the tests), `src/prisma/prisma.module.ts` + `prisma.service.ts`, `src/health/health.module.ts`, `health.controller.ts`, `health.service.ts`, `health.dto.ts` (a Swagger DTO class that `implements HealthResponse`), `prisma/schema.prisma`, `test/` or `*.spec.ts`, `Dockerfile`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, and the test runner config (Jest + ts-jest as generated by Nest, or Vitest + unplugin-swc; pick one and keep it).

**Prisma.** Pin the current stable Prisma major. `schema.prisma` has the `postgresql` datasource reading `env("DATABASE_URL")` and a client generator, with no models and no migrations. If the chosen major requires it (Prisma 7), add `prisma.config.ts` and the `@prisma/adapter-pg` driver adapter. `prisma generate` runs from a `postinstall`/`prebuild`-style script so lint/test work after a fresh install. If generate refuses an empty schema, stop and record the finding rather than inventing a domain model. `PrismaService` must not crash the app when the DB is unreachable at boot: do not call `$connect` in `onModuleInit`, or catch and log the error there. Call `$disconnect` on shutdown.

**Health.** `GET /health` makes `HealthService` run `SELECT 1` through Prisma, raced against a 2 s timeout. Success returns 200 `{status:'ok', database:'up'}`. Any error or timeout returns 503 `{status:'error', database:'down'}`: throw `ServiceUnavailableException` with that body, or set the status explicitly. Never leak the error message or the connection string. Document it with `@ApiTags('health')`, `@ApiOkResponse` and `@ApiServiceUnavailableResponse`, using the DTO.

**OpenAPI.** Use `@nestjs/swagger` with `DocumentBuilder` (title "BricoMission API", version from `package.json`). Call `SwaggerModule.setup('docs', app, doc)` so the UI is at `/docs` and JSON at `/docs-json`. No global prefix. `PORT` env, default 3000 inside the container. Listen on `0.0.0.0`.

**Tests (DB-free, run by `pnpm -r test`).**
- Unit: `HealthService` with a mocked Prisma client, covering (a) resolves → up, (b) rejects → down, (c) hangs → down after the timeout (use fake timers or a short injected timeout).
- HTTP: build the Nest app with `PrismaService` overridden and `configureApp` applied, then use supertest to check: `/health` 200 + `up`; `/health` 503 + `down`; `/docs-json` has `paths['/health']`.
- Real-DB behavior is verified with curl against compose (Scenarios 3-4), not in `pnpm -r test`, so the test gate stays independent of Docker.

**Docker image (`apps/api/Dockerfile`, build context = repo root).** Multi-stage. Base image: a pinned exact Node tag (prefer `node:<26.x.y or 24.x.y>-bookworm-slim`; verify that the tag exists and record its digest). Install `openssl` and `ca-certificates` if Prisma needs them. Install pnpm in the image with `npm install -g pnpm@<pinned>` (do not rely on corepack). Build stage: copy the manifests, then `pnpm install --frozen-lockfile`, copy the sources, `prisma generate`, `nest build`. Runtime stage: production deps only (for example `pnpm --filter @bricomission/api deploy --prod`, adding `--legacy` or `inject-workspace-packages` as pnpm 10 requires), plus the generated Prisma client and `dist/`. Run as user `node` with `CMD ["node","dist/main.js"]`. Make sure the generated client survives the deploy step: regenerate after deploy, or set a generator `output` inside `apps/api` that is git-ignored. `.dockerignore` excludes `node_modules`, `dist`, `.git`, `.env*` (keep `!.env.example`), `presentation`, `docs`.

**compose.yaml `api` service.** `build: {context: ., dockerfile: apps/api/Dockerfile}`, `restart: unless-stopped`, `depends_on: {postgres: {condition: service_healthy}}`. Environment: `PORT: 3000` and `DATABASE_URL: postgresql://${POSTGRES_USER:-bricomission}:${POSTGRES_PASSWORD:-bricomission}@postgres:5432/${POSTGRES_DB:-bricomission}?schema=public`. Ports: `"127.0.0.1:${API_PORT:-3000}:3000"`. Healthcheck: `["CMD","node","-e","fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`, using the same timings as the other services (start_period 20s). No GPU, no new volumes. Add `API_PORT=3000` to `.env.example` with a comment. Update the compose header comment.

**init.sh (bootstrapped variant).** Status `bootstrapped`. Keep the prerequisite and GPU checks (GPU stays informational). Resolve a `PNPM` command (`pnpm` if on PATH, otherwise `corepack pnpm` if it works). If neither works, print the no-sudo options above and exit 1. Then run `$PNPM install --frozen-lockfile`, `$PNPM -r lint` and `$PNPM -r test`, each announced, failing fast with the step name. Then the existing compose gate, with `up -d --build --wait --wait-timeout 300`. After it: `port=$(docker compose port api 3000 | cut -d: -f2)`, then `curl -fsS --max-time 10 http://127.0.0.1:$port/health`. The body must contain `"database":"up"`, otherwise run `docker compose logs --tail 50 api` and exit 1. Final lines print the API, docs URLs and useful commands. Never run `pnpm dev` or attach to logs.

**.gitignore.** Add `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, and any generated Prisma output path.

## Expected File Changes

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.dockerignore`: create.
- `packages/shared-types/{package.json,tsconfig.json,src/index.ts}`: create.
- `apps/api/**` (files listed above): create.
- `compose.yaml`: modify (add the `api` service). `.env.example`: add `API_PORT`. `.gitignore`: modify.
- `init.sh`: modify (bootstrapped variant).
- `ARCHITECTURE.md`: create. `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: update.

## Visual Design Impact

- UI involved: no. Swagger UI is a third-party tool page. No design artifact required.

## Durable Documentation Impact

- `ARCHITECTURE.md`: create. Short: monorepo layout, `apps/api` module layout (feature modules, PrismaService, `configureApp`), shared-types as type-only, OpenAPI as the contract for web/iOS, compose runtime surfaces and ports, test layering (DB-free unit/HTTP in `pnpm -r test`; real-DB checks via compose).
- `CONSTRAINTS.md`: not needed. Rules stay in `AGENTS.md`.
- `AGENTS.md`: update. The startup path now includes the pnpm resolution (corepack or user-level, no sudo) and the init.sh workspace gate. Add `pnpm -r lint`/`pnpm -r test` as the baseline commands.
- `docs/technical-discovery.md`: not needed (nothing decided beyond it). The queue choice stays with `gpu-job-broker`.

## Implementation Plan

1. Resolve pnpm without sudo, then create the root workspace files and `packages/shared-types`.
2. Scaffold `apps/api` by hand or with the Nest CLI via `pnpm dlx` (then trim generated extras such as the sample AppController/AppService). Add the Prisma schema and PrismaService.
3. Implement the health module, the Swagger setup and `configureApp`, then write the tests. Get `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r test` green.
4. Write the Dockerfile and `.dockerignore`, add the compose `api` service, update `.env.example` and `.gitignore`. Bring the stack up with this run's env vars.
5. Run Scenarios 3-5 with curl. Upgrade `init.sh` and run Scenarios 6-7.
6. Write `ARCHITECTURE.md` and update `AGENTS.md`, `PROGRESS.md` and `feature_list.json` (status `passing` with evidence, never `accepted`).

## Implementation Tasks

- [ ] pnpm available (record the method and version). `packageManager` pinned.
- [ ] Root workspace configs plus the shared-types package.
- [ ] `apps/api` scaffold, Prisma schema (no models), PrismaService resilient to DB-down at boot.
- [ ] `GET /health` with a 2 s timeout, 200/503 contract, Swagger decorators.
- [ ] `/docs` and `/docs-json` via `configureApp`.
- [ ] Unit + HTTP tests (up, down, timeout, docs-json).
- [ ] Dockerfile (pinned base, non-root, generated client present), `.dockerignore`.
- [ ] compose `api` service + `API_PORT` in `.env.example`; `.gitignore` entries.
- [ ] init.sh bootstrapped variant (Scenarios 6-7).
- [ ] Docs + evidence.

## Verification Plan

Run with `export COMPOSE_PROJECT_NAME=api-skeleton POSTGRES_PORT=5534 MINIO_API_PORT=9200 MINIO_CONSOLE_PORT=9201 MAILPIT_UI_PORT=8225 MAILPIT_SMTP_PORT=1225 API_PORT=3200`. If the shell lacks the docker group, use `newgrp docker`. No sudo, no GPU.

- `pnpm install --frozen-lockfile` → exit 0; `git status --porcelain pnpm-lock.yaml` → empty.
- `pnpm -r lint` → exit 0; `pnpm -r test` → exit 0, with test names showing the up/down/timeout/docs cases.
- `docker compose config -q` → exit 0. `docker compose up -d --build --wait` → exit 0; `docker compose ps` shows 4 healthy services.
- `curl -s -w ' %{http_code}' http://127.0.0.1:3200/health` → `{"status":"ok","database":"up"} 200`.
- `docker compose stop postgres; curl -s -w ' %{http_code}' --max-time 10 http://127.0.0.1:3200/health` → `down` 503; `docker compose ps api` still running; `docker compose start postgres` (wait healthy) → 200 `up` again.
- `curl -s http://127.0.0.1:3200/docs-json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['openapi'].startswith('3'); assert '/health' in d['paths']; print(d['info']['title'])"` → `BricoMission API`. `/docs` → 200, and `curl -s http://127.0.0.1:3200/docs | grep -Ei 'cdn|unpkg|jsdelivr'` → nothing.
- `ss -ltn | grep 3200` shows only `127.0.0.1:3200`.
- Image pin check: the awk check from `docs/specs/infra-compose-core.md` on `compose.yaml` passes, and `grep -E '^FROM' apps/api/Dockerfile` shows exact tags only (no `latest`, no bare major).
- `docker compose exec -T api id -un` → `node`.
- `./init.sh` → exit 0, showing the pnpm steps, the healthy table and `database: up` (Scenario 6). Failure path: make `pnpm` unresolvable in a subshell (restricted PATH) → exit 1 with guidance. Optional: break a test temporarily → non-zero, then revert.
- `bash -n init.sh`.
- E2E: no persistent E2E harness exists yet (Playwright arrives with `web-pwa-shell`). The supertest HTTP tests plus the compose curl checks cover this API flow.

## Evidence To Capture

- pnpm method + version; Node base image tag + digest; NestJS/Prisma versions.
- Command exit codes and the key output lines from the Verification Plan (test names, health bodies with status codes, docs-json title, ps table).
- The `./init.sh` tail and exit code for the success path and the pnpm-missing path.
- Record in `feature_list.json` `evidence` and in a `PROGRESS.md` session entry. Update `PROGRESS.md` Current Verified State: `pnpm -r lint && pnpm -r test` is now part of init.sh.

## Validator Checklist

- [ ] Scope: no apps/web, auth, domain models/migrations, MinIO/SMTP clients, queue or GPU usage.
- [ ] Lockfile committed; frozen install passes; `packageManager` pinned to an exact version; no sudo was used.
- [ ] `pnpm -r lint` / `pnpm -r test` pass independently of Docker; tests cover up, down and docs.
- [ ] `/health` contract is 200 `up` / 503 `down` with no error leakage; the API survives DB loss and recovers.
- [ ] `/docs` and `/docs-json` work offline (local Swagger assets).
- [ ] The compose `api` service has a pinned base image, a non-root user, a healthcheck, `depends_on` postgres healthy, and a 127.0.0.1-bound port overridable via `API_PORT`. `.env.example` matches the compose defaults.
- [ ] shared-types is type-only and consumed with `import type`.
- [ ] init.sh is the bootstrapped variant, Scenarios 6-7 hold, and it starts no long-running process.
- [ ] `ARCHITECTURE.md` exists; `AGENTS.md`, `PROGRESS.md` and `feature_list.json` are updated (status `passing`, not `accepted`).
