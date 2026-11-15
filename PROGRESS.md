# Progress Log

## Current Verified State

- Repository root: `/home/juanmi/Proyectos/hardwaremission.bricomission`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (bootstrapped variant since `api-skeleton`) checks host prerequisites, validates `feature_list.json`, runs the workspace gate (`pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`), then the compose gate (`docker compose up -d --build --wait`; postgres, minio, mailpit, keycloak, api, web healthy). It requires `GET /health` to report `database: up`, since `keycloak-realm-roles` the realm `BricoMission` discovery issuer to equal `http://localhost:$KEYCLOAK_PORT/realms/BricoMission` ("Keycloak:" step), and since `web-pwa-shell` the "Web:" step (localized Home for `es`, 307 to `/language` for `ja`, manifest 200, `/api/health` through the web proxy `database: up`). Browser E2E: `pnpm test:e2e`; installability: `bash scripts/web/lighthouse-pwa.sh` (neither is run by `./init.sh`). Real Keycloak behavior: `./scripts/keycloak-smoke.sh`. Without Docker it skips the compose gate after the pnpm steps and exits 0; with an unreachable daemon, an unhealthy stack or API health not up it exits 1; without pnpm it exits 1 with no-sudo guidance.
- Last accepted features: `gpu-job-broker` (PR #8) and `keycloak-realm-roles` (PR #9), both merged; `catalog-rag-ingestion` (validator ACCEPT, 2026-11-13). Earlier `api-skeleton` and `local-ai-gpu-spike` (2026-11-12). The global default-deny `AuthGuard` protects `/ai/jobs/*` and `/catalog/search`.
- Current next ready features: see `feature_list.json` (dependency-ready after these two)
- Catalog RAG: Opt-in compose profiles `rag` (`embedder`, CPU-only) and `rag-fetch` (weights into `bricomission_embedding-models`); the api applies Prisma migrations best-effort on start.
- Local AI stack: opt-in compose profiles `ai` (`llama-server`, `comfyui`) and `ai-fetch` (weights). Both run on the RX 9070 XT with ROCm in Docker. GPU jobs must be serialized (see `docs/spikes/local-ai-gpu-spike.md`). Weight volumes have fixed names (`bricomission_*`) shared by all checkouts.
- Current blockers: none. pnpm 10.34.9 (pinned in `packageManager`) resolves through a corepack shim in `~/.local/bin` (host Node 26 has no bundled corepack). Docker works directly in agent shells since the 2026-11-13 reboot (docker group active; `newgrp docker` only needed in shells started before joining the group).
- Web PWA: `web-pwa-shell` is `accepted`. Web on `http://localhost:3100/` (`WEB_PORT`).
- Keycloak theme: `keycloak-login-theme` is `accepted`. Locale precedence decided (option a): Keycloak stores no account locale; `ui_locales` decides. `./init.sh` now also fails on a stale realm volume (no theme on the sign-in page) and prints the reset command.
- Web sign-in: `homeowner-password-login` is `accepted`. BFF client `bricomission-web`, sessions in schema `web_session`; realm volumes older than this feature need a reset (`./init.sh` detects it).
- Kitchen capture: `kitchen-capture-draft` is `accepted`. Capture screen at `/kitchen-projects/new`; anonymous drafts bound to the HttpOnly cookie `bm_draft`; photos (JPEG/PNG/WebP/HEIC) normalized to metadata-free JPEGs in the private MinIO bucket `bricomission-media`; HEIC decoded with `heic-decode`/`libheif-js` (sharp cannot decode HEVC); 7-day sliding expiry with an in-API sweeper. `./init.sh` Web step also checks the Capture page and the guarded draft route.
- Brand: `brand-logo-animation` is `accepted`. New palette (primary `#2968EC`, text `#182231`, no `accent`), SVG logo in the web and Keycloak headers, white lettermark app icons, favicon pair, data-URI email logo, one-time welcome splash (`sessionStorage` per tab). Keycloak image tag `…-theme2` (rebuild with `docker compose up -d --build --wait keycloak`, no realm reset). E2E specs import `test` from `e2e/fixtures.ts` (splash skipped).
- Moodboard: `moodboard-selection` is `accepted`. Moodboard screen at `/kitchen-projects/new/moodboard` (Capture's Continue); table `moodboard_item`; 24 committed Style Gallery images served by public API routes (`apps/api/assets/style-gallery/`). Contact sheet `design/openpencil/moodboard-selection/gallery-contact-sheet.png` awaits developer approval before commit; the RealVisXL/SDXL licence was not confirmable offline.
- Login Gate: `login-gate-claim` is `accepted` (validator accept 2026-11-15). Generate step at `/kitchen-projects/new/generate` (step 3 of 3; Capture/Moodboard now "of 3"), Login Gate sheet, claim through the BFF route `POST /api/kitchen-projects/drafts/current/claim` (draft -> `claimed`, owner = Keycloak `sub`, no expiry, `bm_draft` cleared), owned page `/kitchen-projects/<id>`, costly placeholders `POST /kitchen-projects/:id/renders|budget` (409/501). Two migrations (enum value, then columns + CHECK).
- Renders: `controlnet-render` is `accepted` (validator accept + delta accept 2026-11-15; clutter removal deferred to `render-declutter`). Since `simulations-ux-overhaul` Renders exist only inside a Simulation: `POST /kitchen-projects/:id/simulations` (202, one Render per photo), `GET .../simulations[/:simulationId]`, `DELETE`, `PUT .../selected-simulation`, `POST .../renders/:renderId/retry`, `GET .../renders/:id[/content?variant=before|full|thumb]`; `POST|GET .../renders` were removed. Table `kitchen_render`, ComfyUI adapter for `AI_ADAPTERS=local`, results page `/kitchen-projects/<id>/results` with the before/after slider; real-GPU smoke `bash scripts/ai/simulation-smoke.sh` (`render-smoke.sh` was removed).
- Budgets: `budget-tier-computation` is `accepted`. `POST /kitchen-projects/:id/budget` (202), `GET .../budgets[/:id]`, page `/kitchen-projects/<id>/budget`; tables `budget`, `budget_tier`, `budget_line_item` (integer cents; no FK to `catalog_chunk`). Since `simulations-ux-overhaul` a Budget belongs to the selected Simulation: a vision inventory job per Render image, then pricing with up to 3 attempts, every price verified against the cited chunk line, tier totals strictly ordered Luxury > High > Medium > Low in code (retry with feedback, then relabel by total rank, `relabeled`), math in `budget-math.ts`; VAT-inclusive prices at 21 % (`BUDGET_VAT_PERCENT`). The fake adapter has a JSON mode, so E2E and the fake stack need the CPU embedder up and `infra/catalog/samples` ingested.
- Simulations: `simulations-ux-overhaul` is `passing` (implemented and self-verified 2026-11-14, awaiting independent validation; nothing committed). Generate creates a Simulation (one Render per photo, one calculated style; blend modes `ip_adapter|vlm_text|both`, default `both`, admin `GET|PUT /admin/settings/style-blend`), My simulations on the project page, one Budget per selected Simulation (vision inventory, tier order enforced in code, relabel fallback), editable claimed projects, multimodal Qwen3-VL in llama-server router mode with the LLM unloaded before every render (ADR 0005, ADR 0001 amendment). Real-GPU run per mode: `docs/spikes/simulations-gpu-spike.md`; `bash scripts/ai/simulation-smoke.sh`. `scripts/ai/render-smoke.sh` was removed. Models: rerun `docker compose --profile ai-fetch run --rm ai-fetch` and `docker compose --profile ai build comfyui` on any other checkout.
- Diagnostics: `diagnostics-dashboard` is `accepted` (validator revise then accept after repair 1, 2026-11-15; closes the MVP). Opt-in and off by default: `DIAGNOSTICS_ENABLED=true docker compose --profile diagnostics up -d --build --wait` (dashboard on `http://localhost:3200`, 127.0.0.1 only, no login; read-only metrics agent with no published port); `./launch-demo.sh` starts it by default (`--no-diagnostics` skips it). Own event bus over SSE with correlation ids, redaction and a shared token (ADR 0006). E2E: `pnpm test:e2e:diagnostics`; a plain `pnpm test:e2e` skips the dashboard spec. `./init.sh` validates the profile and checks `/diagnostics/topology` is 404. `CLAUDE.md` still says "planned, not built yet" (two lines for the orchestrator or developer to update).
- Last verified at: 2026-11-15 after `diagnostics-dashboard` phase F (`pnpm -r lint` and `pnpm -r test` exit 0: api 564 + 2 skipped, web 517, diagnostics 84, diagnostics-agent 46, api-client 3; `./init.sh` exit 0; `pnpm test:e2e` 176 passed, 16 skipped; `pnpm test:e2e:diagnostics` 15 passed; `./scripts/keycloak-smoke.sh` and `bash scripts/web/auth-persist-check.sh` exit 0; real GPU `gpu-check.sh` PASS). Before that: 2026-11-14 after `controlnet-render` (`./init.sh` exit 0, 6 healthy, new renders 401 line; workspace gate api 298 / web 469 / api-client 3; `pnpm test:e2e` 152 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0; real GPU cold 20.8 s / warm 9.1-10.3 s). Before that: 2026-11-14 after `login-gate-claim` (`./init.sh` exit 0, 6 healthy, new Generate/claim/renders lines; workspace gate api 261 / web 457 / api-client 3; `pnpm test:e2e` 149 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0). Before that: 2026-11-14 after `moodboard-selection` (`./init.sh` exit 0, 6 healthy, new Moodboard and Style Gallery Web lines; workspace gate api 237 / web 436 / api-client 3, also offline; `pnpm test:e2e` 143 passed, 1 skipped). Before that: 2026-11-14 after `brand-logo-animation` (`./init.sh` exit 0, 6 healthy; workspace gate api 203 / web 416 / api-client 3; `pnpm test:e2e` 131 passed, 1 skipped; Lighthouse installable; `./scripts/keycloak-smoke.sh` exit 0). Before that: 2026-11-14 after `kitchen-capture-draft` (`./init.sh` exit 0, 6 healthy; workspace gate api 203 / web 364 / api-client 3, also offline; `pnpm test:e2e` 103 passed, 1 skipped). Before that: 2026-11-13 after `homeowner-password-login` and a realm reset (`./init.sh` exit 0 with 6 healthy services and the new Keycloak/Web auth checks; `pnpm test:e2e` 89 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0; `bash scripts/web/auth-persist-check.sh` exit 0)

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
- Goal: implement `local-ai-gpu-spike` (spec `docs/specs/local-ai-gpu-spike.md`), headless, in worktree `../hardwaremission.bricomission-worktrees/local-ai-gpu-spike`.
- Completed:
  - `compose.yaml`: `llama-server` and `comfyui` in profile `ai`, `ai-fetch` in profile `ai-fetch`, 4 new volumes, ports on 127.0.0.1 with env overrides.
  - `infra/comfyui/Dockerfile`: ROCm 10.1 / torch 2.14 base, ComfyUI v0.45.3, controlnet_aux pinned.
  - `infra/comfyui/workflows/sdxl-controlnet-{depth,canny}.json`.
  - `infra/ai/fetch-models.sh`: pinned HF commits, resumable, idempotent.
  - Public-domain sample photo with `SOURCE.md`.
  - `scripts/ai-spike/{vram-sample,llm-bench,comfy-run}.sh`.
  - Report `docs/spikes/local-ai-gpu-spike.md` with renders.
  - Doc updates: ADR 0001 (validated plus a Validation section), risks, technical-discovery, AGENTS.md (AI Services), `.env.example`, `init.sh` hints.
- Verification run:
  - `bash -n` on all scripts; `docker compose config -q`, with and without the profiles; awk pin check; Dockerfile `FROM` pinned.
  - Scenarios 1-8 as written, plus `--profile ai down` then `up -d --wait` (16 s, no re-download).
  - `./init.sh` exit 0, 3 services.
- Results:
  - LLM: ROCm `server-rocm-b12316` with Qwen3-30B-A3B-Instruct-2507 Q4_K_M. Prompt 771 tok/s, generation 25.5 tok/s, TTFT 2.6 s on a 2k-token prompt. JSON valid in 12/12 runs. VRAM 3.2 GB peak. Vulkan reaches 358 / 24.1 tok/s.
  - ComfyUI: SDXL RealVisXL V5 + ControlNet at 1216x832 with 25 steps. Depth: 16.9 s cold, 8.5 s warm. Canny: 16.8 s cold, 9.0 s warm.
  - Co-residency: serialization required. ComfyUI peaks at about 15 GB over the desktop baseline. Running both at once did not OOM but slowed each by about 25 %.
  - `POST /free` releases VRAM within 3 s. Stopping llama takes 0.6 s and starting it about 5.5 s.
  - No fallbacks were needed (no SD 1.5, no Vulkan, no `HSA_OVERRIDE_GFX_VERSION`).
- Failed / not run: a cold-page-cache llama load time was not measured (needs root to drop caches). No sudo was run and `.env` was not read.
- State left: GPU stack stopped (volumes kept: about 30.6 GB of weights). Core stack healthy.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran scenarios 1-6 on the GPU with matching numbers (25.8 tok/s gen, depth render warm 8.48 s, VRAM +3.2 GB LLM / +15 GB ComfyUI: serialization required). Low findings fixed by the orchestrator: stop hints now name `llama-server comfyui` (a bare `--profile ai stop/down` also stops the core stack); bench comment says ~2k tokens. Deferred: pip lock for the ComfyUI image, `pull_policy: build` for fresh hosts, host-specific `RENDER_GID` default. Status `accepted`.
- Known risk: ComfyUI takes all free VRAM during renders. The `gpu-job-broker` must free or stop the LLM, or pause chat, around image jobs. `RENDER_GID` default 987 is host-specific.

### Session 004

- Date: 2026-11-12
- Goal: implement `api-skeleton` (spec `docs/specs/api-skeleton.md`) in worktree `feature/api-skeleton` (`COMPOSE_PROJECT_NAME=api-skeleton`, `API_PORT=3200`).
- Completed: pnpm workspace (root `package.json` with `packageManager: pnpm@10.34.9`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.dockerignore`); `packages/shared-types` (type-only `HealthResponse`); `apps/api` (NestJS 12 ESM, Prisma 7 + adapter-pg, lazy-connecting `PrismaService`, `GET /health` with 2 s timeout and 200/503 contract, Swagger at `/docs` and `/docs-json` via `configureApp`, Vitest unit + supertest HTTP tests, multi-stage Dockerfile running as `node`); compose `api` service (`API_PORT`, healthcheck, depends on healthy postgres); `.env.example` `API_PORT`; `.gitignore`; `init.sh` bootstrapped variant; `ARCHITECTURE.md`; `AGENTS.md` startup path.
- Verification run: frozen install (worktree and clean copy, lockfile unchanged); `pnpm -r lint` exit 0; `pnpm -r test` 7 passed; compose up 4 healthy; `/health` 200 up; postgres stopped -> 503 down in ~2 s with no api restart, recovery to 200; `/docs-json` OpenAPI 3.0.0 "BricoMission API" with /health 200+503; `/docs` 200 with local assets; 127.0.0.1-only binding; container user `node`; pin checks; `./init.sh` exit 0 and the Scenario 7 failure paths (no pnpm, failing test, no docker, no daemon, health down). Details in `feature_list.json` evidence.
- Deviations from the spec: Prisma 7 does not accept `url = env("DATABASE_URL")` in `schema.prisma`; the URL lives in `apps/api/prisma.config.ts`. NestJS 12 is ESM-only, so the API is ESM and tests use Vitest + unplugin-swc (an option the spec allowed). No Nest CLI / `nest-cli.json`: `build` is `prisma generate && tsc -p tsconfig.build.json`. `prisma generate` runs at the start of `lint`/`test`/`build` instead of `postinstall` (keeps the prod `pnpm deploy` free of the Prisma CLI step). TypeScript pinned to 6.0.3, not 7.0.2, because typescript-eslint 8.72 and @nestjs/swagger 12 support TS < 6.1 / ^6. GPU devices are now informational in `init.sh`.
- Known risks: the host pnpm shim points into the npx cache (`~/.npm/_npx/...`); if the cache is cleaned, re-run the corepack enable command (init.sh prints it). Prisma's preinstall prints a spurious "unsupported Node" banner on Node 26 (install succeeds). api image is ~890 MB (prod deps include the Prisma CLI as a peer of `@prisma/client`); acceptable for local use. `docker compose up --build` output is verbose in `init.sh`.
- Not run: no persistent E2E harness yet (Playwright arrives with `web-pwa-shell`). No GPU. No commit.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran S1-S6 and the S7 pnpm-missing path, checked 127.0.0.1-only binding, non-root user, pinning, offline docs. Minor follow-ups (not blocking): `init.sh` uses `curl -f`, which hides the 503 body on failure; `curl` is not a checked prerequisite. Status `accepted`.
- Next best step: next dependency-ready feature in `feature_list.json`.

### Session 005

- Date: 2026-11-13
- Goal: implement `gpu-job-broker` (spec `docs/specs/gpu-job-broker.md`), headless, in worktree `../hardwaremission.bricomission-worktrees/gpu-job-broker` (`COMPOSE_PROJECT_NAME=gpu-job-broker`, `API_PORT=3400`).
- Completed:
  - `packages/shared-types`: `GpuJobKind`, `GpuJobStatus`, `GpuJobErrorCode`, `GpuJobView`, `GpuJobEvent`.
  - `apps/api/src/ai/`: `AiModule.register()` (dynamic; debug controller only with `GPU_BROKER_DEBUG_ENDPOINTS=true`), tokens, env-backed `AiEndpointsProvider`, adapter interfaces, deterministic fakes (`fake-adapter.support.ts` shared helper), `LlamaServerLlmAdapter`, `AiBackendError`; `jobs/`: `GpuJobBrokerService` (in-memory FIFO, head-of-line admission, image exclusive, LLM concurrency, per-kind timeouts with abort, codes-only errors, queue cap, retention, per-job event history + replay), errors, options (env parsing), no-op `GpuResidencyHook`, `GET /ai/jobs/:id`, SSE `GET /ai/jobs/:id/events`, debug `POST /ai/jobs`, DTOs.
  - Tests: `test/gpu-job-broker.service.spec.ts`, `gpu-jobs.http.spec.ts`, `fake-adapters.spec.ts`, `llama-server-llm.adapter.spec.ts`, helper `gpu-test-helpers.ts`.
  - `compose.yaml` api env (6 vars, defaults), `.env.example`, `ARCHITECTURE.md`, `docs/technical-discovery.md` (queue decision, VRAM policy), `docs/risks-and-open-questions.md` (queue resolved, restart-loss risk), `AGENTS.md` (AI_ADAPTERS line).
- Verification run: frozen install (lockfile unchanged); `pnpm -r lint` exit 0; `pnpm -r test` 35 passed; compose up 4 healthy, `/health` up, POST flag off 404; compose SSE check with the debug flag (llm behind two images: queued pos 2 image, queued pos 1 image, running, done; stream closed; Last-Event-ID; unknown 404), flag restored; optional real-LLM smoke under `flock` (llama-server, `AI_ADAPTERS=local`: queued, running, done), llama-server stopped and api restored; `./init.sh` exit 0. Details in `feature_list.json` evidence.
- Deviations from the spec: (1) `queued` events are re-emitted when the position *or* `waitingFor` changes (spec: position); (2) extra env `AI_FAKE_IMAGE_DELAY_MS` (3000) / `AI_FAKE_LLM_DELAY_MS` (500), code defaults only, so the running API's fakes take time and queueing is observable over SSE (tests override the adapters with gated fakes); (3) extra helper files `src/ai/adapters/fake-adapter.support.ts` and `test/gpu-test-helpers.ts`; (4) `position` is 1-based (spec Scenario 1 "position 1"); (5) the image slot is released only after `GpuResidencyHook.afterImage()` resolves.
- Known risks: in-memory jobs are lost on API restart (documented in risks). Job endpoints have no auth yet (127.0.0.1 only, UUID v4 ids). The timeout/retention envs are not passed through compose (code defaults).
- Not run: no persistent E2E harness yet. No commit.
- Status: `passing`, ready for independent validation.
- Next best step: validator on `gpu-job-broker`, then `controlnet-render`.
- Independent validation: ACCEPT (2026-11-13). Published as PR #8 and merged.

### Session 006

- Date: 2026-11-13
- Goal: implement `keycloak-realm-roles` (spec `docs/specs/keycloak-realm-roles.md`) headless in worktree `feature/keycloak-realm-roles` (`COMPOSE_PROJECT_NAME=keycloak-realm-roles`, `KEYCLOAK_PORT=8390`, `API_PORT=3300`).
- Completed:
  - Compose `keycloak` service. It is built from `infra/keycloak/Dockerfile`: `quay.io/keycloak/keycloak:26.8.2` plus the Apache-2.0 email-OTP provider jar, sha256-checked. It runs `start-dev --import-realm` with dev-file H2 in the `keycloak-data` volume, fixed issuer `KC_HOSTNAME`, a dynamic backchannel, a bash `/dev/tcp` healthcheck on the management port, and `127.0.0.1:${KEYCLOAK_PORT:-8180}`.
  - Realm `infra/keycloak/import/BricoMission-realm.json`: roles `user`/`professional`/`admin`; clients `bricomission-api` (audience only) and `bricomission-dev-cli` (public, PKCE S256, audience mapper); seeded `bm-admin`/`bm-homeowner`/`bm-professional` with `${BM_SEED_*}` passwords; SMTP to Mailpit; browser flow `browser-email-otp` (cookie, then password, then email code).
  - API `src/auth/`: `TokenVerifier` (`jose` 6.2.17), global default-deny `AuthGuard` (401/503), `RolesGuard` (403), and the `@Public()`, `@Roles()` and `@CurrentUser()` decorators. Routes `GET /me` and `src/admin/` `GET /admin/ping`. `/health` is `@Public()`. Swagger declares the bearer scheme. Shared types `RealmRole`, `MeResponse`, `AdminPingResponse`.
  - Tests `test/auth.http.spec.ts`, `test/token-verifier.spec.ts` and `test/support/tokens.ts` use a local JWKS. Smoke script `scripts/keycloak-smoke.sh`.
  - `init.sh` "Keycloak:" step and hints. Updated `.env.example`, `ARCHITECTURE.md`, `AGENTS.md` ("Identity"), `docs/technical-discovery.md`, `docs/user-and-access-model.md` and `docs/risks-and-open-questions.md`, plus the spec's Implementation Notes.
- Verification run: frozen install, `pnpm -r lint` and `pnpm -r test` (36 passed, including the 7 pre-existing); `docker compose config -q`; pin awk check; fresh-volume `up --wait` (5 healthy) and realm import log; `restart` and `down`/`up` both skip the import; `./scripts/keycloak-smoke.sh` exit 0 (23 ok) on 3 runs; `ss -ltn` shows 127.0.0.1 only and no published 9000; cleartext grep finds nothing; `bash -n`; `./init.sh` exit 0; Keycloak step failure path exits 1. Details are in the `feature_list.json` evidence.
- Deviations from the spec (recorded in the spec's Implementation Notes):
  - The realm file must be named `BricoMission-realm.json`.
  - The audience mapper sits on the client instead of in a custom default client scope, because defining `clientScopes` drops Keycloak's built-in scopes.
  - The email-OTP fallback image was needed. Its jar is fetched in a `node:26.13.1-bookworm-slim` stage because the Keycloak image has no curl.
  - The 503 mapping also covers the generic `JOSEError` and `JWKSInvalid` (JWKS failures).
- Known risks:
  - The email-OTP provider implements Keycloak internal SPIs (warnings at boot), so recheck it on every Keycloak upgrade.
  - Password grants on `bricomission-dev-cli` skip the email code. That is acceptable only because the client is local and dev-only.
  - Realm JSON or seed password changes need a realm volume reset (AGENTS.md "Identity").
  - Future OIDC clients must add the `bricomission-api` audience mapper.
- Not run: no persistent E2E harness yet (Playwright arrives with `web-pwa-shell`). No GPU. No commit.
- State left: worktree stack running and healthy (5 services).
- Independent validation: ACCEPT (2026-11-13). Validator re-ran lint/test (36/36), `./init.sh`, the smoke (23 ok), a fresh-volume import plus restart in a throwaway project, port, secret and checksum checks, and hostile-JWT probes (all 401, no token leakage). Non-blocking notes: `init.sh` port parsing with `cut -d: -f2` breaks on IPv6 output (smoke uses `awk -F: '{print $NF}'`); `@Public()` wins over `@Roles()` on the same route. Status `accepted`.
- Next best step: publish via github-flow; then the next dependency-ready feature in `feature_list.json`.

### Session 007

- Date: 2026-11-13
- Goal: implement `catalog-rag-ingestion` (spec `docs/specs/catalog-rag-ingestion.md`), headless, in worktree `feature/catalog-rag-ingestion` (`COMPOSE_PROJECT_NAME=catalog-rag-ingestion`, `API_PORT=3500`, `EMBEDDING_PORT=8591`).
- Completed:
  - `compose.yaml`: `embedder` (profile `rag`; `llama.cpp:server-b12316` CPU, no devices; `--embeddings --pooling last -ngl 0`; 127.0.0.1:`EMBEDDING_PORT`) and `embedder-fetch` (profile `rag-fetch`). Volume `bricomission_embedding-models`. api env `EMBEDDING_URL`, `EMBEDDING_MODEL`, `EMBEDDING_QUERY_INSTRUCTION`.
  - `infra/ai/fetch-embedding-model.sh` (pinned Qwen3-Embedding-0.6B Q8_0). `.env.example` and `init.sh` hints.
  - Prisma models `CatalogDocument`/`CatalogChunk` and the first migration (`20261113000000_catalog_rag`: extension, `vector(1024)`, HNSW cosine). `apps/api/docker-entrypoint.sh` runs migrate deploy best-effort. `prisma` moved to dependencies; the runtime image adds `openssl`.
  - `apps/api/src/catalog/`: embedder interface, llama-server client and fake; `unpdf` page extraction with no-text-layer detection; page-bounded chunker; Prisma repository; ingestion service; search service with the SKU boost; `GET /catalog/search`; CLI `dist/catalog/cli/ingest.js`. Shared types `CatalogSearchResult`/`CatalogSearchResponse`.
  - `scripts/catalog/{ingest,generate-sample-catalog}.sh`. Generator `apps/api/scripts/generate-sample-catalog.ts` (Node type stripping). Committed `infra/catalog/samples/{bricomission-sample-catalog.pdf,README.md}`.
  - Docs: ADR 0004, ARCHITECTURE.md (catalog module, migrations, embedder row, `/catalog/search` auth follow-up), AGENTS.md (AI Services, ADR list), technical-discovery, risks (embedding model resolved, research task 3 updated).
- Verification run: Scenarios 1-8 as written (details and numbers in `feature_list.json` evidence). Also `pnpm -r lint`/`pnpm -r test` (70 tests, also with no network via `unshare -rn`), `bash -n` on every script, `docker compose config -q` with and without the profiles, the awk pin check, the api booting with postgres down, and `./init.sh` exit 0 (final run with the embedder stopped).
- Deviations from the spec:
  - Ports follow the orchestrator's exported env (3500/5405/8591), not the spec's 3300/5634/8390.
  - The PDF parser is `unpdf` 2.1.0, the alternative the spec allows. It bundles serverless PDF.js with no native canvas dependency.
  - The SKU boost also requires a digit in the token, so plain upper-case words (`OAK`) are not boosted.
  - `EMBEDDING_QUERY_INSTRUCTION` carries a literal `\n` in compose (compose defaults cannot hold newlines); the API decodes it. An empty value means no prefix.
  - The CLI also pre-checks the embedder before any database work. The wrapper prints the Prisma migrate output.
  - Report format: `[status] file: pages N, chunks N, skipped pages N`, plus warning lines and `summary: documents N, chunks N, warnings N, failed N`.
- Failed / not run: no real partner Catalogs yet (only the synthetic sample). There was no persistent E2E harness (no UI). No GPU was used and no sudo was run.
- State left: core stack healthy, embedder stopped, sample Catalog indexed in this worktree's database. Weights stay in `bricomission_embedding-models` (639 MB).
- Known risks:
  - Future schema changes must keep the hand-written HNSW index and the extension in the SQL, because Prisma does not model them (`migrate dev` would see drift).
  - `/catalog/search` requires a valid Bearer token since the merge with `keycloak-realm-roles` (global default-deny `AuthGuard`).
  - The api image is larger now that the Prisma CLI is a runtime dependency.
- Independent validation: ACCEPT (2026-11-13). Validator re-ran S1-S8 on the live stack: generator sha256 stable, embedder CPU-only (no devices) with 1024 dims on 127.0.0.1, ingest report with the page 5 no-text-layer warning, en/es/SKU search top hit page 3 with 189.90, re-run `unchanged` with identical id hashes, edition-2 replacement verified and restored, failure paths (exit 1/2, HTTP 503/400), 70 tests, `./init.sh` exit 0. Low non-blocking notes: SKU boost is case-sensitive; the embedder fetch checks size, not sha256 (sha256 recorded in ADR 0004); a mid-directory embedder failure loses earlier report lines. Status `accepted`.
- Next best step: next dependency-ready feature in `feature_list.json`.

### Session 008

- Date: 2026-11-13
- Goal: implement `web-pwa-shell` (spec `docs/specs/web-pwa-shell.md`) in the base checkout on branch `feature/web-pwa-shell` (default compose project and ports).
- Completed:
  - `apps/web` (`@bricomission/web`): Next.js 16 App Router + Tailwind 4 `@theme` with every DESIGN.md token, self-hosted Inter (latin + latin-ext). Home, Language Selection (`/language`), the language selector bottom sheet, `ApiStatus` (4 states), all built from the approved OpenPencil read-back (`docs/design/web-pwa-shell.md`).
  - i18n: 11 locales, `resolveLocale` (cookie, then highest-q supported subtag; `nb`/`nn` to `no`, `pt-*` to `pt`), `src/proxy.ts` (307 to `/language`, locale header), `POST /locale` cookie setter, 11 message files (10 agent-translated).
  - Same-origin `/api/*` proxy (fixed base, header allowlist, no cookies, traversal 400, 502 on unreachable). Manifest, icons (scaled from the design PNG), hand-written `public/sw.js`, production-only registration.
  - `packages/api-client`: committed `openapi.json` snapshot, generated `schema.ts`, `createApiClient`; `apps/api/test/openapi-snapshot.spec.ts` and `openapi:export`; `createOpenApiDocument` extracted in `app.setup.ts`.
  - Compose `web` (127.0.0.1:`WEB_PORT`, user `node`, healthcheck) and `web-e2e` (profile `e2e`, pinned Playwright image). `scripts/web/e2e.sh`, `scripts/web/lighthouse-pwa.sh`, root `test:e2e`. `init.sh` Web step. `.env.example`, `.gitignore`, `.dockerignore`, `eslint.config.mjs`, `pnpm-workspace.yaml`.
  - Docs: ARCHITECTURE.md (apps/web layout, i18n, proxy, api-client loop, runtime rows, test layering), AGENTS.md (Web step, `pnpm test:e2e`, OpenAPI regeneration, 11-file rule), DESIGN.md (design assets, English-only rule, non-token values), technical-discovery (web stack, proxy decision, Lighthouse 11 + CDP, locale mapping).
- Verification run: workspace gate (api 130, api-client 3, web 122 tests; also offline via `unshare -rn` with loopback up), OpenAPI drift check, compose config / pins / 6 healthy services / `node` user / 127.0.0.1 binding, curl checks (locales, 307, cookie, 400, proxy health, traversal 400, 502 with the api stopped), `pnpm test:e2e` 45 passed, Lighthouse `installable-manifest` 1, `./init.sh` exit 0 and its failure path (exit 1 with web logs), `bash -n`, CDN grep. Details in `feature_list.json` evidence.
- Deviations: see the spec's "Implementation Notes" (proxy.ts locale header; `POST /locale` with an Origin check; icons from the PNG export because the SVG pill renders as an ellipse; `aria-current` options; professional link rendered per Decision 1, so the stale validator checklist line about it does not apply).
- Failed / not run: nothing required was skipped. Translations have no native review (developer decision).
- State left: core stack (6 services) healthy and detached; `apps/web/.next`, `apps/web/test-results` and `playwright-report` are git-ignored build/test output. Nothing committed.
- Known risks: agent translations may contain errors; offline mode serves Home in the locale it was cached in; `pnpm install` still prints a stale "Ignored build scripts: @parcel/watcher" notice from the first install (now in `ignoredBuiltDependencies`).
- Next best step: independent validation of `web-pwa-shell` (`feature-validator`), then the next dependency-ready feature.

### Session 009

- Date: 2026-11-13
- Goal: implement `keycloak-login-theme` (spec `docs/specs/keycloak-login-theme.md`) in the base checkout, branch `feature/keycloak-login-theme`, default compose project `hardwaremissionbricomission`, default ports.
- Completed:
  - Realm JSON: self-registration, flow `registration-email-otp` (copy of the built-in registration form + `email-authenticator-no-enrollment` with `email-otp-6-digits`), default role `default-roles-bricomission` with `user`, internationalization (11 locales, default `en`), `loginTheme`/`emailTheme` `bricomission`, `ssoSessionIdleTimeout` 28800, `showMaskedEmailOnOtpForm=true`.
  - Theme `infra/keycloak/themes/bricomission/` (login + email, `parent=base`): 7 overridden login templates + icon macros, CSS with DESIGN.md tokens, password-toggle JS, self-hosted Inter + OFL, code email html/text, 11 + 11 message files (10 agent-translated each). Dockerfile `COPY`; image tag `bricomission/keycloak:26.8.2-emailotp26.7.2-theme1`.
  - Tests: `apps/web/test/keycloak-theme-messages.test.ts` (69 tests), `apps/web/e2e/keycloak-theme.spec.ts` (25 tests), helpers in `apps/web/e2e/support.ts`, Keycloak/Mailpit env in `scripts/web/e2e.sh`. `init.sh` theme check. `scripts/keycloak-smoke.sh` reads the code from the themed email.
  - Docs: ARCHITECTURE.md, AGENTS.md (Identity), DESIGN.md, docs/user-and-access-model.md, docs/technical-discovery.md, docs/risks-and-open-questions.md.
- Verification run: realm reset (`docker compose rm -sf keycloak && docker volume rm hardwaremissionbricomission_keycloak-data`), `./init.sh` exit 0 (api 130, api-client 3, web 191 tests; 6 healthy; theme check ok), `./scripts/keycloak-smoke.sh` exit 0 (seeded tokens keep exactly one role), `pnpm test:e2e` 70 passed (45 + 25), stale-realm failure path (throwaway project `kcstalecheck` with the base realm JSON: `./init.sh` exit 1 with the reset hint), grep checks, `bash -n`. Details in `feature_list.json` evidence.
- Blocker (spec stop-and-report rule, Scenario 5 precedence): a stored account `locale` (fr) beats `ui_locales=de` and also `kc_locale=de` on `/auth`, so the spec's fallback ("clients must also send kc_locale") does not work. Needs a developer decision; options in `docs/risks-and-open-questions.md`. The E2E records the observed behavior; it does not claim the fallback.
- Deviations: see the spec's "Implementation Notes" (subject without the code, masked email, no "Confirm your password." state, expired-code key, cooldown as info, extra `bmContinue` string).
- State left: core stack healthy (realm reset done). The throwaway project `kcstalecheck` is stopped but its containers and 4 volumes (`kcstalecheck_*`) remain: removing them was denied to the agent. Remove with `COMPOSE_PROJECT_NAME=kcstalecheck docker compose down -v`. Test accounts `e2e-*` and `probe-*` exist in the dev realm (cleared by any realm reset). Nothing committed.
- Follow-up (same day): developer chose option (a) for locale precedence. `register.ftl` no longer sends the hidden `locale` field; the precedence E2E now asserts that `ui_locales` wins for a newly self-registered account (registered in fr, signs in with de) and for seeded `bm-homeowner` (it). Docs updated; risk item moved to Resolved. Realm reset done (`hardwaremissionbricomission_keycloak-data`), which cleared the old `e2e-*`/`probe-*` accounts with a stored locale. Gates re-run: `./init.sh` exit 0 (api 130 / api-client 3 / web 191 tests), `./scripts/keycloak-smoke.sh` exit 0, `pnpm test:e2e` 70 passed; admin API shows new accounts `e2e-1794602055857` and `e2e-fr-1794602061277` with no `locale` attribute. Status `passing`.
- Next best step: independent validation of `keycloak-login-theme` (`feature-validator`). Developer cleanup still pending: `COMPOSE_PROJECT_NAME=kcstalecheck docker compose down -v`.

### Session 010

- Date: 2026-11-13
- Goal: implement `homeowner-password-login` (spec `docs/specs/homeowner-password-login.md`) in the base checkout, branch `feature/homeowner-password-login`, default compose project `hardwaremissionbricomission`, default ports. UI gate satisfied: `docs/design/homeowner-password-login.md` (approved by developer on 2026-11-13).
- Completed:
  - Realm: confidential client `bricomission-web` (secret, `rootUrl`/`baseUrl`, redirect and post-logout URIs from `${BM_WEB_*}` placeholders, PKCE S256, `webOrigins: []`, `bricomission-api` audience mapper). Compose `keycloak` env `BM_WEB_PUBLIC_URL`, `BM_WEB_CLIENT_SECRET`; `web` env `WEB_DATABASE_URL`, `WEB_PUBLIC_URL`, `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_WEB_CLIENT_SECRET`, `WEB_SESSION_KEY`. `.env.example`.
  - `apps/web/src/lib/auth/`: config, OIDC client (`openid-client` 6.9.0, explicit split metadata, ID token signature checks), session service (opaque cookie, single-flight refresh), handlers, runtime wiring, `safeReturnTo`, Origin rule; `db/` pool (`pg` 8.23.1), embedded `web_session` migration (advisory lock), AES-256-GCM crypto, Postgres repository with cleanup and abuse cap.
  - Routes `/auth/login|callback|logout|session` and the designed `/auth/error` page. Proxy: session token injected, client `Authorization` dropped, CSRF rule, 503 and cookie-clearing paths. `AccountEntry` (header entry + account sheet) and the narrow-screen language selector rule. `auth` namespace in the 11 message files (10 agent-translated). `sw.js` skips `/auth/*`, cache `v2`.
  - Tests: 6 new unit files (85 tests) plus the updated proxy tests; `e2e/auth.spec.ts` (19), `e2e/auth-persist.spec.ts`, `scripts/web/auth-persist-check.sh`; `scripts/web/e2e.sh` passes `E2E_PERSIST_PHASE`. `init.sh`: Keycloak web-client check with the reset hint; Web `/auth/session` and `/auth/login` checks.
  - Docs: ARCHITECTURE.md (web sign-in section, proxy rules, runtime env, tests), AGENTS.md (Identity), DESIGN.md (assets, non-token values), docs/technical-discovery.md (BFF and session decisions with rejected options), docs/user-and-access-model.md, docs/risks-and-open-questions.md (DB credentials in web, dev defaults, shared cookie across localhost ports), spec Implementation Notes.
- Verification run: realm reset; `./init.sh` exit 0 (api 130 / web 284 / api-client 3; 6 healthy; new Keycloak and Web lines); init failure path (client deleted with kcadm -> exit 1 with the reset hint; reset -> exit 0); offline workspace gate; OpenAPI drift none; `./scripts/keycloak-smoke.sh` exit 0; `pnpm test:e2e` 89 passed + 1 skipped; `bash scripts/web/auth-persist-check.sh` exit 0; curl, psql, live refresh, key change and postgres-down checks; static checks. Details in `feature_list.json` evidence.
- Unknowns: `${VAR}` placeholders resolve outside `credentials`; `prompt=create` works (no registrations endpoint); `openid-client` handles the split endpoints (no `jose` fallback).
- Deviations: see the spec's Implementation Notes (login failures show `/auth/error?reason=unavailable` instead of a raw 503; `/auth/error` carries `returnTo`; AAD has a purpose label; extra helper files; signed-in `/api/health` gives 503 with the database down).
- State left: core stack (6 services) healthy; realm reset done (new client present). Dev realm has test accounts `e2e-web-*`; `web_session` holds test sessions (expire within 10 h). `apps/web/test-results` has no `auth-state.json`. Nothing committed.
- Known risks: web holds DB credentials; dev default key and client secret are public; `bm_session` is shared across localhost ports (worktrees). Other checkouts need a realm reset after pulling (`./init.sh` detects it).
- Next best step: independent validation of `homeowner-password-login` (`feature-validator`).

### Session 011

- Date: 2026-11-14
- Goal: implement `kitchen-capture-draft` (spec `docs/specs/kitchen-capture-draft.md`, including the "Design Step Outcome" section) in the base checkout, branch `feature/kitchen-capture-draft`, default compose project `hardwaremissionbricomission`, default ports. UI gate satisfied: `docs/design/kitchen-capture-draft.md` (approved by developer on 2026-11-14).
- Completed:
  - API: `src/storage/` (`ObjectStorage`, `S3ObjectStorage`, lazy private bucket) and `src/kitchen-projects/` (draft token + `DraftTokenGuard` with the 404 policy, service, controller with 6 routes, multer upload interceptor, photo processor with sharp + heic-decode, measurement validation, `DraftCleanupService`, config, Prisma repository). Prisma models `KitchenProject`/`KitchenPhoto` and migration `20261114000000_kitchen_capture_draft` with hand-written CHECKs. `draftToken` API-key scheme. Shared types; OpenAPI and api-client regenerated.
  - Web: BFF start route `POST /api/kitchen-projects/drafts`; proxy maps `bm_draft` to `X-Draft-Token`, drops the client header, extends the CSRF rule and reuses `readCookie` (risk L2 resolved). Capture page and components (photo grid, measurement keypad sheet, alerts, sticky bar), pure helpers in `src/lib/kitchen-draft/`, `capture` namespace in the 11 message files (10 agent-translated).
  - Infra: api env for S3 and draft settings in `compose.yaml` and `.env.example`; two new `init.sh` Web checks. Fixture generator `apps/api/scripts/generate-heic-fixtures.sh` with committed HEIC/JPEG fixtures and `SOURCE.md` notes.
  - Tests: 7 api spec files, 4 new web unit files plus proxy cases, `e2e/capture.spec.ts` (14 tests).
  - Docs: ARCHITECTURE.md, AGENTS.md (Kitchen Drafts), DESIGN.md, docs/user-and-access-model.md, docs/domain-model.md, docs/technical-discovery.md, docs/risks-and-open-questions.md, spec Implementation Notes.
- Verification run: workspace gate (also offline), OpenAPI export (additions only), live curl against the API and through the web, HEIC probe and timing in the api container, MinIO policy/listing/metadata checks, psql checks (CHECKs, 32-byte hash, HNSW index kept, CHECK violation), cleanup after `docker compose restart api`, MinIO-stopped path (curl and a temporary browser spec, deleted), restart persistence (`docker compose restart web api`), `./init.sh` exit 0, `pnpm test:e2e` 103 passed / 1 skipped. Details in `feature_list.json` evidence.
- HEIC decoder outcome: sharp 0.35.5 fails on HEVC in the container; `heic-decode` 2.1.0 (ISC) + `libheif-js` 1.23.5 (LGPL-3.0, WASM, unmodified) works offline; 12 MP HEIC upload about 0.5 s.
- Deviations: see the spec's Implementation Notes (extra `photo_missing` code, 50 MP -> 413, delete order, field buttons instead of inputs, save-status/hint rule, localStorage expiry marker, heic-decode license ISC, trixie fixture image).
- State left: core stack (6 services) healthy with the new api and web images. Test drafts from curl and E2E runs exist in the dev database and bucket (they expire within 7 days and the sweeper removes them). No throwaway compose projects or buckets were created. Nothing committed.
- Known risks: global-only abuse cap (`DRAFT_MAX_OPEN`), MinIO root credentials in the api, HEVC patents before any distribution (all recorded in `docs/risks-and-open-questions.md`).
- Next best step: independent validation of `kitchen-capture-draft` (`feature-validator`).

### Session 012

- Date: 2026-11-14
- Goal: implement `brand-logo-animation` (spec `docs/specs/brand-logo-animation.md`, approved read-back `docs/design/brand-logo-animation.md`) on branch `feature/brand-logo-animation`.
- Completed:
  - Palette swap in DESIGN.md, `globals.css`, the Keycloak CSS, the code email, the overlays (`#18223166`), the manifest and the viewport theme color (`#2968EC`). `accent` was removed.
  - SVG `Wordmark` (140x22) plus `brand/{logo-paths.ts,Lettermark,LogoShapes}`; Keycloak `bm-logo.ftl` with favicon links; compose tag `…-theme2`.
  - `scripts/render-brand-assets.ts` (replaces `render-icons.ts`): app icons, apple-touch, `favicon.svg`/`favicon.ico` (web and Keycloak), and the email logo data URI. Service worker `v3`.
  - Welcome splash: `splash-script.ts` (inline head script), `WelcomeSplash.tsx`, `WelcomeSplash.module.css` and `splash-stages.ts`, wired in `layout.tsx`.
  - Tests: unit tests `contrast`, `brand-assets` and `splash-script`; `tokens`/`manifest` updated. E2E: `e2e/fixtures.ts` (`skipSplash`, `newContext`), every spec migrated, new `splash.spec.ts` and `brand.spec.ts`, keycloak/pwa/auth specs updated.
  - Docs: ARCHITECTURE.md, AGENTS.md, DESIGN.md, risks, and the spec's Implementation Notes.
- Verification run (all green): lint; `pnpm -r test` (api 203, web 416, api-client 3); the render script twice (byte-identical); `./init.sh` exit 0; `pnpm test:e2e` 131 passed / 1 skipped; `bash scripts/web/lighthouse-pwa.sh` exit 0; `./scripts/keycloak-smoke.sh` exit 0; the greps from the spec. Details are in the `feature_list.json` evidence.
- Not run (manual, developer): side-by-side comparison with `design/logo/*_animation.html`, Mailpit HTML view, a real Android/desktop install, and the favicon in light and dark OS themes. Evidence screenshots are in `apps/web/test-results/brand/` (git-ignored).
- Deviations: see the spec's Implementation Notes. Main points: exact read-back viewBoxes and sizes, a full-square apple-touch icon, a `data-splash="skip"` attribute instead of a class, and `lm`/`wm` prefixes for the two colliding keyframe names.
- Known risks (recorded in `docs/risks-and-open-questions.md`): data-URI email images can be blocked or raise spam scores, and the splash replays in each new tab.
- Next best step: independent validation of `brand-logo-animation` (`feature-validator`).

### Session 013

- Date: 2026-11-14
- Goal: implement `moodboard-selection` (spec `docs/specs/moodboard-selection.md` with the developer answers; approved read-back `docs/design/moodboard-selection.md`) on branch `feature/moodboard-selection` (issue #21), default compose project and ports.
- Completed:
  - Style Gallery: txt2img workflow `infra/comfyui/workflows/sdxl-txt2img.json`, `scripts/style-gallery/generate.sh`, `apps/api/scripts/build-style-gallery.ts`; 24 images generated with RealVisXL V5.0 (ComfyUI only, LLM not running; ComfyUI stopped afterwards), re-encoded metadata-free into `apps/api/assets/style-gallery/` with `manifest.json` and `SOURCE.md`; contact sheet `design/openpencil/moodboard-selection/gallery-contact-sheet.png`.
  - API: Prisma `MoodboardItem` + migration `20261114120000_moodboard_selection` (CHECKs, unique gallery id per draft); repository add/delete under the draft lock and Moodboard keys in `findExpired`; `MoodboardService`/`MoodboardController` (4 draft routes) and draft view fields; `StyleGalleryModule` (manifest validation, 2 public routes); assets shipped in the runtime image (`files: assets`). Shared types; OpenAPI and api-client regenerated (additive).
  - Web: Moodboard page and `src/components/moodboard/` (`MoodboardScreen`, `MoodboardGrid`, `StyleGallery`), `moodboard-state.ts` reducer, `moodboard-client.ts`, `draft-marker.ts` (moved from Capture), generic `uploadPhoto<T>` with `MOODBOARD_UPLOAD_URL`, `CaptureAlert`/`UploadingTile` test-id prefixes; `moodboard` namespace in the 11 message files (10 agent-translated).
  - Tests: api `moodboard.http`, `style-gallery/{manifest,style-gallery.http}`, migration and cleanup additions; web `moodboard-state`, `moodboard-client`, `style-gallery-messages`, upload additions; `e2e/moodboard.spec.ts` (12) and the updated Capture Continue test; `horizontalOverflow` skips `data-scroll-x`.
  - `init.sh` Web step: Moodboard page 200 and `/api/style-gallery` with 24 images.
  - Docs: ARCHITECTURE.md, AGENTS.md (Kitchen Drafts), DESIGN.md, CONTEXT.md, docs/domain-model.md, docs/technical-discovery.md, docs/risks-and-open-questions.md, spec Implementation Notes.
- Verification run (all green): `pnpm -r lint`, `pnpm -r test` (also offline), OpenAPI export, `./init.sh` exit 0, `pnpm test:e2e` 143 passed / 1 skipped, live curl against the API and the web proxy, MinIO listing and policy, MinIO-stopped path, psql (`\d moodboard_item`, HNSW index), expiry sweep after `docker compose restart api`, assets inside the api container. Details in `feature_list.json` evidence.
- Orchestrator follow-up (2026-11-14): the developer approved the contact sheet (OQ-8); licence checked on the model page (`openrail++`, CreativeML Open RAIL++-M, outputs usable in the app and the public video); independent validator verdict `accept`; feature marked `accepted`. Optional follow-ups from validation: N1 offline reload shows the empty-state text, N2 cross-tab limit 409 on upload shows the generic failed copy. `.style-gallery-work/` (git-ignored, the 24 source PNGs) is kept so single images can be regenerated and the set rebuilt after the review.
- State left: core stack (6 services) healthy with the new api and web images; `comfyui` stopped. Test drafts from curl and E2E runs exist in the dev database and bucket (they expire within 7 days). Nothing committed.
- Next best step (after moodboard-selection): `login-gate-claim` (accepted 2026-11-15).

### Session login-gate-claim (implementer)

- Date: 2026-11-14
- Goal: implement `login-gate-claim` (spec `docs/specs/login-gate-claim.md`, design `docs/design/login-gate-claim.md`).
- Completed: API (two migrations, `claimByTokenHash`/`findOwned`, `OwnedProjectGuard`, `KitchenProjectsController` without `@Public()`, `KitchenProjectsService`, `readiness.ts`, DTOs, shared types, OpenAPI + api-client regenerated); web (BFF claim route, `GenerateScreen`, `LoginGateSheet`, `ProjectSummary`, `GenerateAlert`, `OwnedProjectScreen`, pages, `generate`/`project` namespaces in 11 locales, step indicators "of 3"); tests (API claim/owned/readiness/migration/cleanup, web claim-draft/generate-state/readiness, `e2e/login-gate.spec.ts`, moodboard E2E update); `init.sh` Web lines; docs (ARCHITECTURE, AGENTS, CONTEXT, DESIGN, domain model, access model, technical discovery, risks).
- Verification run: `pnpm -r lint` exit 0; `pnpm -r test` api 261 / web 457 / api-client 3; `./init.sh` exit 0; `pnpm test:e2e` 149 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0; curl matrix with real tokens and psql checks (see `feature_list.json` evidence).
- Failed / not run: workspace gate offline (not rerun; tests need no network); Lighthouse (no PWA change).
- Accounts created in the dev realm: `e2e-curl-other` (admin API, curl checks) and `e2e-gate-<timestamp>` per E2E run (cleared by a realm reset).
- Known risk or unresolved issue: no project list (URL only); orphaned projects when a Keycloak user is deleted; `sub` stability with Google SSO linking (all in `docs/risks-and-open-questions.md`).
- Next best step: independent validation (`feature-validator`) of `login-gate-claim`.


### Session controlnet-render (implementer)

- Date: 2026-11-14
- Goal: implement `controlnet-render` (spec `docs/specs/controlnet-render.md`, design `docs/design/controlnet-render.md`, issue #25, branch `feature/controlnet-render`).
- Completed: API (`kitchen_render` migration + schema, `src/kitchen-projects/renders/` service, repository, prompt, geometry, recovery, config, DTOs; the renders POST replaces the 501 placeholder and keeps its guards and the 409 rule; list/one/content routes; `ImageAdapter` contract with image bytes; fake tint transform; `ComfyUiImageAdapter` + `buildRenderWorkflow`; global `AiModule`; `StyleGalleryService.promptFor`); shared types; OpenAPI + api-client regenerated; web (results page, `ResultsScreen`, `BeforeAfterSlider`, `RenderStatusCard`, `PhotoPicker`, `RenderHistory`, `render-state`/`render-client`, owned page CTA, claim landing for intent render, `results` namespace and `project` changes in 11 locales); tests (API `test/renders/*`, migration, updated login-gate/adapter/broker tests; web unit tests; `e2e/results.spec.ts`, `e2e/login-gate.spec.ts` updated); `scripts/ai/render-smoke.sh`; compose/.env.example `RENDER_CONTROL_MODE`, `RENDER_MAX_PER_PROJECT`; `init.sh` renders GET 401 line; docs (ARCHITECTURE, AGENTS, CONTEXT, DESIGN, domain model, access model, technical discovery, risks, spec Implementation Notes).
- Verification run: `pnpm -r lint` exit 0; `pnpm -r test` api 298 / web 469 / api-client 3; `./init.sh` exit 0; `pnpm test:e2e` 152 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0; fake smoke `bash scripts/ai/render-smoke.sh --no-gpu`; psql/MinIO checks; restart -> `interrupted`; real GPU smoke under `flock` with llama-server idle (cold 20.83 s, warm 9.12/10.25 s; portrait cold 14.32 s, warm 8.58 s; VRAM peak 16,256/16,304 MiB, no OOM). Details in `feature_list.json` evidence.
- Failed / not run: Lighthouse (no PWA change); workspace gate offline (not rerun).
- Evidence for the developer: `docs/spikes/assets/controlnet-render-compare.jpg` (and `-portrait.jpg`), left `before`, right Render. The centre tall cabinet became a glazed door; windows, sink, counter, stove and fridges stayed.
- State left: core stack (6 services) healthy, api on `AI_ADAPTERS=fake`; `llama-server` and `comfyui` stopped (volumes kept). Test projects and Renders from smoke and E2E runs remain in the dev database and bucket (claimed projects do not expire). Nothing committed.
- Known risk or unresolved issue: VRAM nearly full during a Render (16.26 of 16.3 GB) with llama-server idle; uploaded references do not guide the style; ComfyUI `input/` keeps the uploaded crops until the container is recreated; canny keeps clutter literally (all in `docs/risks-and-open-questions.md`).
- Next best step: developer visual check of the comparison image, then independent validation (`feature-validator`) of `controlnet-render`.
- Follow-up (2026-11-15, developer feedback on geometry: remove clutter, never add doors/openings/windows): prompt rewritten (constraints first; clutter + structural negatives, 72 CLIP tokens) and ControlNet made configurable (`RENDER_CANNY_LOW/HIGH` 0.6/0.95, `RENDER_CONTROL_STRENGTH` 0.8, `RENDER_CONTROL_END` 0.5, depth assist 0.7 for the whole run). 19 settings tried on the GPU (`docs/spikes/assets/controlnet-render-tuning.jpg`). Tuned smoke: landscape cold 19.6 s / warm 10.2-10.5 s, portrait cold 17.5 s / warm 10.8 s, VRAM peak 16.23/16.3 GB. Structure holds (pantry stays a cabinet, windows/sink/fridges unchanged); clutter is restyled, not removed: needs a mask + inpainting follow-up. Gates: lint 0, tests api 303 / web 469 / api-client 3, `--no-gpu` smoke ok. GPU services stopped, api on `fake`. Next: developer review of the new comparison images.

### Session budget-tier-computation (implementer)

- Date: 2026-11-14
- Goal: implement `budget-tier-computation` (spec `docs/specs/budget-tier-computation.md`, design `docs/design/budget-tier-computation.md`, branch `feature/budget-tier-computation`, compose project `budget-tier-computation` on its own ports).
- Completed: shared types; migration `20261117000000_budget_tier_computation` + Prisma models; `src/kitchen-projects/budget/` (config, repository, recovery, `BudgetService`, DTOs, `budget-math.ts`, `budget-engine/{budget-prompt,budget-extraction}.ts`); `FakeLlmAdapter` JSON mode; controller routes (501 placeholder, `Costly()` and `CostlyAction` removed); OpenAPI regenerated; web page, `src/components/budget/*`, `src/lib/budget/*`, owned-page CTA, claim landing for intent `budget`, `budget` namespace in 11 locales; `init.sh` budgets line; compose/`.env.example` `BUDGET_*`; `scripts/ai/budget-smoke.sh`; tests (api `test/budget/*`, fake adapter, migration; web `budget-state`, `budget-client`; `e2e/budget.spec.ts`, updated `e2e/login-gate.spec.ts`); docs (ARCHITECTURE, AGENTS, CONTEXT, domain model, technical discovery, user and access model, risks, spec Implementation Notes).
- Verification run: `pnpm -r lint` exit 0; `pnpm -r test` api 338 / web 479 / api-client 3; `./init.sh` exit 0; `pnpm test:e2e` 155 passed, 1 skipped; `./scripts/keycloak-smoke.sh` exit 0; `budget-smoke.sh --no-gpu` and real LLM (38.2 s and 55.7 s, 1 attempt, every Line Item verified, psql totals match); CHECK constraints rejected bad rows. Details in `feature_list.json` evidence.
- Failed / not run: Lighthouse (no PWA change); workspace gate offline (not rerun). First real-LLM run failed (8 items/tier hit the token cap, `timeout`); fixed, see spec Implementation Notes item 2.
- Deviations: see spec Implementation Notes (tier `subtotalCents` = before VAT; 5 items per tier; retry when any tier is empty; per-SKU-line price verification).
- Known risk or unresolved issue: LLM call close to the 120 s broker timeout when a retry follows a long first attempt; verification proves the price is printed for the SKU, not that the product is the right one; the sample Catalog cover says "VAT excluded" (all in `docs/risks-and-open-questions.md`).
- State left: core stack (6 services) healthy on `AI_ADAPTERS=fake`; `llama-server`/`comfyui` stopped; embedder stopped at the end; nothing committed.
- Next best step: independent validation (`feature-validator`) of `budget-tier-computation`.

- Orchestrator follow-up (2026-11-14): `budget-tier-computation` accepted after an independent validator revise/accept loop (price verifier hardening); design read-back approved by the developer the same day; residual price-verification layouts recorded in `docs/risks-and-open-questions.md`. Next ready feature: `budget-chat-personas`, `diy-shopping-list-pdf` or `dossier-publication` (all depend on budget-tier-computation, now accepted).

### Session: simulations-ux-overhaul phase B (2026-11-14)

- Goal: data model, Simulation API, calculated style, runner, residency hook and LLM adapter of `simulations-ux-overhaul` (status stays `in_progress`; phases C to F not started).
- Completed: migration `20261118000000_simulations_ux_overhaul` (applied to the dev volume by `./init.sh`: 70 Renders became 70 one-Render Simulations), `src/kitchen-projects/simulations/*`, `src/platform-settings/*`, admin `GET/PUT /admin/settings/style-blend`, Simulation routes (create, list, get, delete, selected-simulation, Render retry), removal of `POST|GET .../renders` and `RENDER_MAX_PER_PROJECT`, multimodal `LlmMessage`, router-mode `model` in the llama adapter, IP-Adapter workflow builder, residency hook unloading the LLM before images, fake adapter modes, OpenAPI and api-client regenerated. Details, deviations and temporary web shims: spec Implementation Notes.
- Verified: `pnpm -r lint`; `pnpm -r test` (api 369 + 1 skipped, web 479, api-client 3); migration backfill on a real PostgreSQL; `./init.sh` exit 0; live fake-adapter API smoke. Not run: `pnpm test:e2e` (results/budget/login-gate specs need phase E), real-GPU smoke, keycloak smoke.
- Next: phase C (Budget per Simulation, inventory, price bands, tier order, partial unique indexes on `budget`, `BUDGET_MAX_ATTEMPTS` 3, `GPU_BROKER_LLM_TIMEOUT_MS` 240000). AGENTS.md, ARCHITECTURE.md and the docs still describe the Render cap and `/renders` routes until phase F.

### Session: simulations-ux-overhaul phase C (2026-11-14)

- Goal: Budget per Simulation, element inventory, price bands and tier ordering (status stays `in_progress`; phases D to F not started).
- Completed: migration `20261119000000_budget_per_simulation` (two partial unique indexes, applied to the dev volume by `./init.sh`), `BudgetService` pipeline (vision inventory jobs, max-count merge, extended retrieval, price bands, pricing attempts with ordering feedback, `relabelByTotal` after the last attempt: developer decision OQ-5), recompute replaces the old Budget on success, `BudgetView` gained `stage`/`progress`/`relabeled`, `BUDGET_MAX_PER_PROJECT`/`budget_limit_reached`/`maxBudgets` removed, `BUDGET_MAX_ATTEMPTS` 3, `GPU_BROKER_LLM_TIMEOUT_MS` 240000, fake LLM ordered by default plus `AI_FAKE_BUDGET_ORDER=misordered`, `scripts/ai/budget-smoke.sh` on the Simulation flow, OpenAPI and api-client regenerated.
- Verified: `pnpm -r lint`; `pnpm -r test` (api 408 + 1 skipped, web 479, api-client 3); migration on a real PostgreSQL (db spec with a phase B data set); `./init.sh` exit 0; `bash scripts/ai/budget-smoke.sh --no-gpu` all checks passed. Not run: real-GPU smoke (phase F), `pnpm test:e2e` (budget/results/login-gate specs stale until phase E), `./scripts/keycloak-smoke.sh`, `auth-persist-check.sh`.
- Temporary web stub: `BudgetScreen.tsx` fixes `maxBudgets` at 5 (phase E rebuilds the screen). Deviations are listed in the spec Implementation Notes.
- Next: phase D (owner edit routes for claimed projects), then E (needs the design read-back, already approved) and F. Docs (AGENTS.md, ARCHITECTURE.md, ADRs) still describe the old caps and routes until phase F.

### Session: simulations-ux-overhaul phase E1 (2026-11-14)

- Goal: web for Capture (cm), Moodboard (wrapping chips) and Results around Simulations (status stays `in_progress`; E2 = project page, edit pages, Budget page, and F not started).
- Completed: `DEFAULT_MEASUREMENT_UNIT = 'cm'` with cm placeholders; multi-select wrapping Style Gallery chips; `lib/simulations/{simulation-state,simulation-client}.ts`, rebuilt `ResultsScreen` and `SimulationStatusCard`, `SimulationTiles`, `PhotoPicker`, `SimulationHistory`, controlled `BeforeAfterSlider`; phase B web stubs removed (`render-client.ts` deleted, `render-state.ts` trimmed to poll helpers); `results` messages in 11 locales; e2e `results.spec.ts` rewritten, `capture`, `moodboard` and `login-gate` specs updated.
- Verified: `pnpm -r lint`; `pnpm -r test` (api 420 + 1 skipped, web 493, api-client 3); `./init.sh` exit 0; full `pnpm test:e2e`: 153 passed, 3 failed, 1 skipped, 5 did not run. Failures: `budget.spec.ts` Scenario 6 and `Budget states` (Budget screen still the phase C stub, rebuilt in E2) and login-gate Scenario 1 + 7 (removed `POST /renders` route; fixed, login-gate 6/6 on rerun). Skipped: auth-persist (needs `E2E_PERSIST_PHASE`). Not run: real GPU, `keycloak-smoke.sh`, `auth-persist-check.sh`.
- Temporary: owned project page still shows the old copy and `?start=1` link (only its "has designs" probe moved to Simulations); `BudgetScreen` keeps `STUB_MAX_BUDGETS`; `data-scroll-x` stays in `e2e/support.ts` for `BudgetHistory`.
- Next: phase E2 (project page "My simulations", edit pages, Budget page, remaining E2E, `simulations` namespace), then F. Deviations are in the spec Implementation Notes.

### Session: simulations-ux-overhaul phase E2 (2026-11-14)

- Goal: web project page "My simulations", edit pages and Budget screen of `simulations-ux-overhaul` (status stays `in_progress`; phase F not started).
- Completed: owned project page rebuilt (three-row summary with edit links, `My simulations` with select/delete/open through the real API and a 2 s poll, delete confirm dialog, budget button states, `Generate more simulations`); edit pages `/kitchen-projects/<id>/edit/photos|measurements|styles` reusing Capture and Moodboard through an `edit` prop and the phase D owner routes; Budget screen for the selected Simulation (based-on card, reading image n of N, recalculate keeps the old Budget until the new one succeeds, relabel note, no-selection and not-ready alerts); Budget history, `Calculate again`, 5-budget limit, `STUB_MAX_BUDGETS`, `budget_limit_reached` and `data-scroll-x` removed; budget claim intent lands on the project page; `simulations`, `project`, `budget` messages in all 11 locales.
- Verified: `pnpm -r lint`; `pnpm -r test` (api 420 + 1 skipped, web 505, api-client 3); `./init.sh` exit 0; full `pnpm test:e2e` 175 passed, 1 skipped (auth-persist), 0 failed (embedder up and sample Catalog ingested for the run, embedder stopped afterwards; fake adapters only).
- Not run: real GPU, `./scripts/keycloak-smoke.sh`, `bash scripts/web/auth-persist-check.sh`, Prisma owner mutations on a real PostgreSQL, phase F.
- Next: phase F (compose/infra/init.sh/`.env.example`, `simulation-smoke.sh`, real-GPU runs per blend mode, docs and ADRs, `openapi:export`, evidence, status `passing`). Deviations are in the spec Implementation Notes (phase E2).

### Session: simulations-ux-overhaul phase F (2026-11-14)

- Goal: docs, ADRs, real-GPU smoke per blend mode, Retry failure switch, gates and harness of `simulations-ux-overhaul` (status now `passing`, not `accepted`).
- Completed: `scripts/ai/simulation-smoke.sh` and its real-GPU runs (all three blend modes, Generate again, selection, Budget, VRAM, contact sheet `docs/spikes/assets/simulations-blend-modes.jpg`); recommended default `both`; real-run bugs fixed (fake/real vision cache key, inventory token cap 500 -> 1200, smoke token expiry); fake image adapter poison photo (fails once per seed) with unit, HTTP and live Playwright Retry tests; ADR 0005, ADR 0001 amendment, ARCHITECTURE.md, AGENTS.md, CONTEXT.md, domain-model, user-and-access-model, technical-discovery, risks, DESIGN.md; `render-smoke.sh` removed.
- Verified: `pnpm -r lint` clean; `pnpm -r test` api 423 + 2 DB-gated skipped, web 505, api-client 3; `./init.sh` exit 0; `pnpm test:e2e` 176 passed, 1 skipped, 0 failed; `./scripts/keycloak-smoke.sh`, `bash scripts/web/auth-persist-check.sh`, `bash scripts/web/lighthouse-pwa.sh` pass; `simulation-smoke.sh` (`--no-gpu` and real GPU) all checks passed; Prisma owner mutations on a scratch PostgreSQL (`project-edits.db.spec.ts` with `PRISMA_TEST_DATABASE_URL`) 1 passed.
- Not run: an 8-photo real-GPU Simulation; independent validation.
- State left: default Compose project on `AI_ADAPTERS=fake`; llama-server, comfyui and the embedder stopped. Start the embedder (`docker compose --profile rag up -d --wait embedder`) before the Budget E2E specs or `budget-smoke.sh`.
- Next: independent `feature-validator`; the orchestrator marks `accepted`. After acceptance the developer may delete the old text model file from the `bricomission_llm-models` volume by hand. Deviations: spec Implementation Notes (phase F).

### Session: diagnostics-dashboard phase A (2026-11-15)

- Goal: spikes A1 (amdgpu per-container mapping), A2 (SSE through Nest and Next, AsyncLocalStorage through the broker), A3 (graph library offline) of `diagnostics-dashboard` (status stays `in_progress`; phases B to F not started).
- Completed: all three spikes passed with recorded evidence in `docs/spikes/diagnostics-metrics-spike.md`; fixtures in `docs/spikes/assets/diagnostics-fixtures/`; throwaway code in `scripts/ai-spike/diag-probe/` and `scripts/ai-spike/diag-spike/` (delete when phases B to E absorb it).
- Findings that change the spec (also in the spec Implementation Notes): per-container GPU % cannot come from `drm-engine-*` (absent for ROCm), use global `gpu_busy_percent` attributed by KFD `cu_occupancy`, `approx: true`; VRAM, CPU and RAM per container are real; agent needs `SYS_PTRACE` and `user: root`; filter compose containers by `container-number`/`oneoff`; raw `@Res()` SSE with 15 s keep-alive (a silent stream dies at 301 s); the broker leaks the previous job's correlation id unless captured in `submit` and re-entered in `start`; `@xyflow/react` 12.12.1 holds 60 fps with 25 nodes and 25 animated edges (no CSS `drop-shadow`, stable node arrays).
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (api 423 + 2 skipped, web 505, api-client 3) after removing the throwaway app and restoring `pnpm-lock.yaml`.
- Not run: phase B onwards, real-GPU run of the finished agent, non-AMD GPUs, GPU-accelerated browser frame times.
- State left: core stack up on the default Compose project with the API on `AI_ADAPTERS=fake`; llama-server, comfyui and the embedder stopped; no spike containers, networks or images left.
- Next: orchestrator folds the deviations into the spec, then phase B (shared types, redaction, ring buffer, event core, API endpoints).

### Session: diagnostics-dashboard phase B (2026-11-15)

- Goal: API core of `diagnostics-dashboard` (status stays `in_progress`): shared types, `redact`, `ring-buffer`, `event`, `correlation`, `DiagnosticsModule` (off by default), token guard, stream/topology/ingest routes, topology with model names from config, broker context capture.
- Completed: everything above in `apps/api/src/diagnostics/` plus `packages/shared-types`; 121 new tests in `apps/api/test/diagnostics/`; compose and `.env.example` env (`DIAGNOSTICS_ENABLED` false, `DIAGNOSTICS_TOKEN`, buffer size and MB) and a read-only `llama-models.ini` mount in `api`. Deviations are listed in the spec Implementation Notes (phase B): buffer 1000, thumbnails 96 px, ingest limit 100 KB, topology exactly as the design.
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (api 544 passed + 2 skipped, web 505, api-client 3; OpenAPI snapshot unchanged); `./init.sh` exit 0; on the running stack `/diagnostics/topology` is 404 by default, 401 without token and 200 with it (23 nodes, 24 edges, model names read from config), `/diagnostics/stream` sends `retry: 500` and `hello` first; the API was returned to the default (disabled) state.
- Not run: phases C to F (instrumentation, agent, dashboard, launch-demo), real-GPU run, E2E.
- Next: phase C (instrumentation: adapter, storage, embedder, Prisma decorators, broker/residency events, `thumbnail.ts` via `asThumbnail`, narration, web emitter and correlation in `api-proxy`).

### Session: diagnostics-dashboard phase C (2026-11-15)

- Goal: instrument the API and the web proxy for `diagnostics-dashboard` (status stays `in_progress`; phases D to F not started).
- Completed: decorators for the LLM, image, storage and embedder adapters (`apps/api/src/diagnostics/instrument/`), Prisma query events (`$on('query')`, coalesced), JWKS fetch events, broker and residency events (queued, running, done, failed, unload, cold reload), HTTP entry middleware (`api-guards` to the serving module, status, hashed subject, `poll` flag), `thumbnail.ts`, `route-node-map.ts`, `narrate/{simulation,budget,project}.ts` called from the runner, simulations, renders, budget, drafts, projects, cleanup and catalog search services; web: `apps/web/src/lib/diagnostics/{correlation,emitter,oidc}.ts` used by `api-proxy.ts` (correlation id minted or kept, forwarded, browser>web and web>api-guards spans, session lookup) and `auth/runtime.ts` (token endpoint calls); `DIAGNOSTICS_*` env on the `web` service in `compose.yaml`. Details and deviations: spec Implementation Notes (phase C).
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (api 563 passed + 2 skipped, web 517, api-client 3; OpenAPI snapshot unchanged); `./init.sh` exit 0; live fake run with diagnostics enabled (`simulation-smoke.sh --no-gpu` exit 0) captured 1515 events with no token, cookie, seed or image byte; api and web returned to disabled.
- Not run: real-GPU events (local adapters), agent (D), dashboard (E), `launch-demo.sh`, E2E, Mailpit/keycloak>mailpit event (diagnostics server probe, phase E).
- Next: phase D (metrics agent: parsers, mapping, sampler, server, Dockerfile, compose service, `gpu-check.sh`).

### Session: diagnostics-dashboard phase D (2026-11-15)

- Goal: metrics agent of `diagnostics-dashboard` (status stays `in_progress`; phases E and F not started).
- Completed: `apps/diagnostics-agent` (`@bricomission/diagnostics-agent`, Node stdlib only): pure parsers (`cgroup`, `fdinfo`, `kfd`), container identity filter and Docker GET allowlist (`mapping`, `docker`), `sampler` (1 s samples, 4 Hz `cu_occupancy`, 5 s discovery, per-tick PID tracking), `server` (`/healthz`, token-guarded `/metrics`, `/metrics/stream` SSE, `/topology`), `topology` (ini), Dockerfile, compose service `diagnostics-agent` (profile `diagnostics`, no published port, root + `SYS_PTRACE` only, read-only), metric types in `packages/shared-types`, `scripts/diagnostics/gpu-check.sh`. Unmeasurable values are `null` (`n/a`); per-container GPU % is always `approx: true`.
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (diagnostics-agent 46, api 563 passed + 2 skipped, web 517, api-client 3); `./init.sh` exit 0; live agent container healthy, privileges as specified, CPU/RAM equal to `docker stats`; `gpu-check.sh --llm-only` PASS (llama-server VRAM 4292 MiB, GPU ~39 % approx, 16.2 cores). Agent stopped and removed, llama-server stopped, 6 core services healthy, API unchanged on `fake`.
- Not run: `gpu-check.sh` default mode (full Simulation with ComfyUI, both AI nodes non-zero) is left to the phase F real-GPU run; dashboard (E); `launch-demo.sh`/`init.sh` integration, ADR 0006, `ARCHITECTURE.md`/`AGENTS.md` (F).
- Risks noted: VRAM and GPU of containers running as another uid (`api`, `web`, `keycloak`, `postgres`; `embedder` not observed) are `n/a` without `DAC_READ_SEARCH`; up to 5 s lag on container start/stop; GPU share falls back to VRAM share when no occupancy was seen for 10 s on a busy card.
- Next: phase E (`apps/diagnostics` from `docs/design/diagnostics-dashboard.md`; consumes `http://diagnostics-agent:3300/metrics/stream` with `X-Diagnostics-Token`, contract in the spec's phase D notes).

### Session: diagnostics-dashboard phase E (2026-11-15)

- Goal: dashboard app of `diagnostics-dashboard` (status stays `in_progress`; phase F not started).
- Completed: `apps/diagnostics` (`@bricomission/diagnostics`, Next 16 + Tailwind 4 + `@xyflow/react` 12.12.1, self-hosted Inter and JetBrains Mono, English only, no login): server routes `/stream` (merges the API event stream, the agent metrics stream and the Mailpit probe; replay source; the token stays on the server), `/api/topology`, `/api/health`; pure reducers (edge, node, log, metrics, connection); graph with the 23 nodes, 6 comment boxes and 24 edges of `layout-reference.json`; log panel, widgets, header, legend, state cards, responsive rules; Dockerfile; compose service `diagnostics` (profile `diagnostics`, `127.0.0.1:${DIAGNOSTICS_PORT:-3200}`, read-only, no depends_on); `DIAGNOSTICS_PORT` in `.env.example`.
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (diagnostics 84 new tests); `./init.sh` exit 0; live run with fake adapters (`simulation-smoke.sh --no-gpu` exit 0) watched in headless Chromium at 1920x1080, 1440x1080 and 1366x768: edges animate (solid and dashed), the log narrates with prompts and thumbnails, widgets show agent values, 0 external requests. Screenshots in `docs/spikes/assets/diagnostics-dashboard-*.png`.
- Deviations: design polylines used directly instead of ELK (ELK could not keep the layout; no `elkjs` dependency); others listed in the spec's phase E notes.
- Not run: persistent Playwright spec (phase F), Mailpit inferred event live, state cards and error edge live, replay with a recorded file, real adapters.
- Stack left: core 6 services healthy, diagnostics off on api and web, `diagnostics`, `diagnostics-agent` and `embedder` stopped, API on `fake`.
- Next: phase F (`launch-demo.sh`, `init.sh` checks, `record-replay.sh` and the replay file, `e2e/diagnostics.spec.ts`, real-GPU run, ADR 0006, `ARCHITECTURE.md`, `AGENTS.md`, risks, PRD section 8, `DESIGN.md`).

### Session: diagnostics-dashboard phase F (2026-11-15)

- Goal: infra integration, persistent E2E, real-GPU run, docs and gates of `diagnostics-dashboard` (status now `passing`, not `accepted`; nothing committed).
- Completed: `launch-demo.sh` starts diagnostics by default (`--no-diagnostics`, both stop paths, URL and two-window layout printed); `init.sh` checks (profile config, `/diagnostics/topology` 404); Playwright project `desktop-1920` with `apps/web/e2e/diagnostics.spec.ts` (15 tests: live group and stack states) and `scripts/diagnostics/e2e.sh` (`pnpm test:e2e:diagnostics`); `scripts/diagnostics/record-replay.sh` and the recorded `apps/diagnostics/replay/demo-simulation-budget.ndjson`; `ctx` in the llama-server model block from `LLAMA_CTX_SIZE`; ADR 0006; `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `DESIGN.md`, technical discovery, risks, access model, design read-back deviations, PRD section 8; throwaway spike code `scripts/ai-spike/diag-probe/` and `diag-spike/` deleted.
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0 (api 564 passed + 2 skipped, web 517, diagnostics 84, diagnostics-agent 46, api-client 3); `./init.sh` exit 0; `pnpm test:e2e` 176 passed, 16 skipped, 0 failed (default stack, dashboard spec skipped with its message); `pnpm test:e2e:diagnostics` 15 passed three times in a row (live 11, then RECONNECTING, NO AGENT, TOKEN MISMATCH, API DISABLED); `./launch-demo.sh --fake` up, dashboard 200 on `127.0.0.1:3200` only (LAN curl fails, agent unpublished), SIGTERM stops all 11 services, `--keep-core` restores diagnostics off; `./scripts/keycloak-smoke.sh` and `bash scripts/web/auth-persist-check.sh` exit 0.
- Real GPU: `DIAGNOSTICS_ENABLED=true bash scripts/diagnostics/gpu-check.sh` PASS (324 samples; llama-server peak VRAM 4475 MiB, GPU ~99 % approx; comfyui peak VRAM 15767 MiB, GPU ~100 % approx; smoke all checks passed, Budget 131.0 s). Stream of the run: 5045 events, none simulated, unload spans and the cold reload step, real inventory, budget and ComfyUI prompts, no secret pattern. Screenshot `docs/spikes/assets/diagnostics-dashboard-real-gpu-1920.png`.
- Failures met and fixed on the way: `scripts/catalog/ingest.sh` recreates the api and turned the events off (scripts now export the flag; documented); the first E2E draft asserted hop order from edge sequences, which the 50 ms batching and the late web ingest batches do not guarantee (order now from the log rows); three timing assumptions in the spec file (late batch after collapse, late batch after Clear, the short reconnect window); `context.setOffline` does not cut an open localhost stream (RECONNECTING is now a stack-state run that restarts the dashboard container).
- Not run or not proven live: the real `style_traits` call (vision cache hit in the smoke project); the red error edge and `FAILED` row, the API restart `bootId` marker and the "events missed" row in a browser (unit tests only); `n/a` on a non-AMD GPU; `launch-demo.sh --no-diagnostics` and its real-model mode; independent validation.
- Side effect undone: `simulation-smoke.sh` rewrote the committed `docs/spikes/assets/simulations-blend-modes.jpg`; restored with `git checkout`.
- State left: core 6 services healthy by `./init.sh` (api and web `DIAGNOSTICS_ENABLED=false`, API on `fake`); `llama-server`, `comfyui`, `embedder`, `diagnostics`, `diagnostics-agent` stopped; GPU lock free. Start the embedder before the Budget E2E specs.
- Next: independent `feature-validator`; the orchestrator marks `accepted`, commits, and updates the two `CLAUDE.md` status lines. Deviations: spec Implementation Notes (phase F).

### Session: diagnostics-dashboard validator repair 1 (2026-11-15)

- Goal: apply the validator's `revise` brief to `diagnostics-dashboard` (status stays `passing`; nothing committed).
- Completed: below 100 % zoom the value, bar and height of every metric tile follow the label size (CSS variables in `apps/diagnostics/src/app/globals.css`, all 0 at 100 %); API TOTALS title on one line (card widens when scaled); APPROX tag 9 px effective when scaled (AI tiles close up); the log filter row wraps in the 400 px log and its menu opens inside the panel; the button text is computed (`+9`); `compose.yaml` header for the diagnostics services; the responsive E2E test asserts all of it at 1440x1080 and 1366x768; `docs/design/diagnostics-dashboard.md` updated; the two responsive screenshots refreshed.
- Verified: `pnpm -r lint` exit 0; `pnpm -r test` exit 0; `pnpm test:e2e:diagnostics` exit 0 (live 11 passed, 4 state runs 1 each); headless before/after: 1920x1080 geometry equal (only the filter button 1 px wider for `+9`), static screenshot regions byte-identical; 1440x1080 and 1366x768 label-over-value overlaps 28 to 0, filter row 453/399 to 399/399; `./init.sh` exit 0.
- Not proven: the APPROX tag below 100 % zoom with a real GPU (checked with an injected sample only; the fake stack never shows the tag).
- State left: core 6 services healthy (api and web `DIAGNOSTICS_ENABLED=false`, API on `fake`); `diagnostics`, `diagnostics-agent`, `embedder`, `llama-server`, `comfyui` stopped.
- Next: independent `feature-validator` again. Details: spec Implementation Notes (validator repair 1).

### Session: diagnostics-dashboard acceptance (2026-11-15)

- Goal: independent validation and acceptance of `diagnostics-dashboard` (issue #31).
- Validator round 1: `revise` (widget labels over values at 1440x1080 and 1366x768; filter menu unreachable at 1366x768). Security, redaction, disabled-mode parity, design fidelity at 1920x1080 and scope passed.
- Validator round 2 (after repair 1): `accept`. `pnpm -r lint`, `pnpm -r test` and `pnpm test:e2e:diagnostics` exit 0; headless checks at 1920x1080, 1440x1080 and 1366x768.
- Orchestrator marked the feature `accepted`. The MVP feature set is complete.
- Open for the developer: acknowledge the recorded design deviations (reference polylines instead of elkjs, `+9` filter label, violet pin on `residency-hook > llama-server`); two stale status lines in `CLAUDE.md`.
- Next: push the branch and open the PR (`Closes #31`) once the developer allows the push.
