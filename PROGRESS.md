# Progress Log

## Current Verified State

- Repository root: `/home/juanmi/Proyectos/hardwaremission.bricomission`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (bootstrapped variant since `api-skeleton`) checks host prerequisites, validates `feature_list.json`, runs the workspace gate (`pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`), then the compose gate (`docker compose up -d --build --wait`; postgres, minio, mailpit, api healthy) and requires `GET /health` to report `database: up`. Without Docker it skips the compose gate after the pnpm steps and exits 0; with an unreachable daemon, an unhealthy stack or API health not up it exits 1; without pnpm it exits 1 with no-sudo guidance.
- Last accepted feature: `api-skeleton` (validator ACCEPT, 2026-11-12)
- Current next ready feature: `local-ai-gpu-spike`
- Current blockers: none. pnpm 10.34.9 (pinned in `packageManager`) resolves through a corepack shim in `~/.local/bin` (host Node 26 has no bundled corepack). Agent shells started before the docker group was added must run docker through `newgrp docker` (no `sg` on this host).
- Last verified at: 2026-11-12 (`./init.sh` exit 0 with the stack healthy; feature list valid)

## Session Log

### Session 001

- Date: 2026-11-12
- Goal: Create the minimal startup harness (Phase 2, `/harness-starter`).
- Completed: `AGENTS.md`, `init.sh` (pre-bootstrap variant, bash), `PROGRESS.md`, `feature_list.json` (34 features ordered by the demo path: infrastructure -> capture -> AI -> outcomes -> marketplace -> admin -> breadth).
- Verification run: JSON validation script (required fields, unique ids, existing non-self dependencies, no forward references), `chmod +x init.sh`, `./init.sh`.
- Evidence captured: `features: 34 OK, deps acyclic and ordered`; `./init.sh` reported git, node 26, python3, ffmpeg, GPU devices OK; pnpm, docker, docker compose missing.
- Files or artifacts updated: `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`, `CLAUDE.md` (imports `AGENTS.md`), project doc phase status.
- Known risk or unresolved issue: full PRD scope (34 features) by 2026-11-22; GPU stack on RDNA4 unproven until `local-ai-gpu-spike`.
- Next best step: install Docker, then `/feature-flow infra-compose-core`, followed immediately by `local-ai-gpu-spike`.

### Session 002

- Date: 2026-11-12
- Goal: implement `infra-compose-core` (spec `docs/specs/infra-compose-core.md`) up to the developer hand-off.
- Completed: `compose.yaml` (postgres pgvector, minio, mailpit; pinned tags, named volumes, healthchecks, 127.0.0.1 overridable ports, env defaults), `.env.example`, `infra/postgres/initdb/01-extensions.sql`, `scripts/install-host-prereqs.sh` (mode 755; `--check`, `--help`, install mode), `init.sh` compose gate, `AGENTS.md` startup step, `docs/technical-discovery.md` optional data-root note, `docs/risks-and-open-questions.md` MinIO finding.
- Verification run: `bash -n` on both scripts (exit 0); helper `--help` (exit 0) and `--check` (8 items missing, exit 1, no sudo); `./init.sh` (Scenario 6 message, exit 0); `git check-ignore` (`.env` ignored, `.env.example` not); corrected pin check (all tagged, no `latest`); registry manifest checks for the image tags.
- Failed / not run: spec grep for unpinned images is faulty (matches pinned lines); replaced by an awk check documented in the spec. The planned MinIO tags (primary and fallback) return 401: `minio/minio` no longer exists on Docker Hub. No Docker runtime checks ran (Docker not installed). `.env` was not read or modified. No sudo was run.
- MinIO follow-up: developer chose `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`; `compose.yaml` updated, healthcheck switched to curl on `/minio/health/live` (curl present per image config, to confirm at runtime); MinIO item moved to Resolved.
- Runtime verification (after the developer installed Docker; agent used `newgrp docker`, no sudo): `--check` all 9 ok; `docker compose config -q` and `up -d --wait` exit 0, 3 services healthy; pgvector 0.8.1; ports 9001/8025/9000-live return 200; data survived `down`/`up`; `./init.sh` exit 0 (Scenario 5), exit 1 on unreachable daemon (Scenario 7), recovers a stopped minio (Scenario 8). MinIO curl healthcheck confirmed (`/usr/bin/curl` in image). Digests recorded in `feature_list.json`. Status `passing`. Stack left running.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran scenarios 1-9 itself, confirmed 127.0.0.1-only bindings and digests; minor doc findings (data NVMe wording) fixed by the orchestrator. Status `accepted`.
- Next best step: `/feature-flow local-ai-gpu-spike`.

### Session 003

- Date: 2026-11-12
- Goal: implement `api-skeleton` (spec `docs/specs/api-skeleton.md`) in worktree `feature/api-skeleton` (`COMPOSE_PROJECT_NAME=api-skeleton`, `API_PORT=3200`).
- Completed: pnpm workspace (root `package.json` with `packageManager: pnpm@10.34.9`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.dockerignore`); `packages/shared-types` (type-only `HealthResponse`); `apps/api` (NestJS 12 ESM, Prisma 7 + adapter-pg, lazy-connecting `PrismaService`, `GET /health` with 2 s timeout and 200/503 contract, Swagger at `/docs` and `/docs-json` via `configureApp`, Vitest unit + supertest HTTP tests, multi-stage Dockerfile running as `node`); compose `api` service (`API_PORT`, healthcheck, depends on healthy postgres); `.env.example` `API_PORT`; `.gitignore`; `init.sh` bootstrapped variant; `ARCHITECTURE.md`; `AGENTS.md` startup path.
- Verification run: frozen install (worktree and clean copy, lockfile unchanged); `pnpm -r lint` exit 0; `pnpm -r test` 7 passed; compose up 4 healthy; `/health` 200 up; postgres stopped -> 503 down in ~2 s with no api restart, recovery to 200; `/docs-json` OpenAPI 3.0.0 "BricoMission API" with /health 200+503; `/docs` 200 with local assets; 127.0.0.1-only binding; container user `node`; pin checks; `./init.sh` exit 0 and the Scenario 7 failure paths (no pnpm, failing test, no docker, no daemon, health down). Details in `feature_list.json` evidence.
- Deviations from the spec: Prisma 7 does not accept `url = env("DATABASE_URL")` in `schema.prisma`; the URL lives in `apps/api/prisma.config.ts`. NestJS 12 is ESM-only, so the API is ESM and tests use Vitest + unplugin-swc (an option the spec allowed). No Nest CLI / `nest-cli.json`: `build` is `prisma generate && tsc -p tsconfig.build.json`. `prisma generate` runs at the start of `lint`/`test`/`build` instead of `postinstall` (keeps the prod `pnpm deploy` free of the Prisma CLI step). TypeScript pinned to 6.0.3, not 7.0.2, because typescript-eslint 8.72 and @nestjs/swagger 12 support TS < 6.1 / ^6. GPU devices are now informational in `init.sh`.
- Known risks: the host pnpm shim points into the npx cache (`~/.npm/_npx/...`); if the cache is cleaned, re-run the corepack enable command (init.sh prints it). Prisma's preinstall prints a spurious "unsupported Node" banner on Node 26 (install succeeds). api image is ~890 MB (prod deps include the Prisma CLI as a peer of `@prisma/client`); acceptable for local use. `docker compose up --build` output is verbose in `init.sh`.
- Not run: no persistent E2E harness yet (Playwright arrives with `web-pwa-shell`). No GPU. No commit.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran S1-S6 and the S7 pnpm-missing path, checked 127.0.0.1-only binding, non-root user, pinning, offline docs. Minor follow-ups (not blocking): `init.sh` uses `curl -f`, which hides the 503 body on failure; `curl` is not a checked prerequisite. Status `accepted`.
- Next best step: `/feature-flow local-ai-gpu-spike` (or the next ready feature after `api-skeleton`).
