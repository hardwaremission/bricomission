# Progress Log

## Current Verified State

- Repository root: `/home/juanmi/Proyectos/hardwaremission.bricomission`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (bootstrapped variant since `api-skeleton`) checks host prerequisites, validates `feature_list.json`, runs the workspace gate (`pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`), then the compose gate (`docker compose up -d --build --wait`; postgres, minio, mailpit, api healthy) and requires `GET /health` to report `database: up`. Without Docker it skips the compose gate after the pnpm steps and exits 0; with an unreachable daemon, an unhealthy stack or API health not up it exits 1; without pnpm it exits 1 with no-sudo guidance.
- Last accepted features: `api-skeleton` and `local-ai-gpu-spike` (validator ACCEPT, 2026-11-12), both run in parallel by github-flow `execute`
- Current next ready features: see `feature_list.json` (dependency-ready after these two)
- `catalog-rag-ingestion`: `passing` (implemented and self-verified 2026-11-13, awaiting independent validation). Opt-in compose profiles `rag` (`embedder`, CPU-only) and `rag-fetch` (weights into `bricomission_embedding-models`); the api applies Prisma migrations best-effort on start.
- Local AI stack: opt-in compose profiles `ai` (`llama-server`, `comfyui`) and `ai-fetch` (weights). Both run on the RX 9070 XT with ROCm in Docker. GPU jobs must be serialized (see `docs/spikes/local-ai-gpu-spike.md`). Weight volumes have fixed names (`bricomission_*`) shared by all checkouts.
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
  - `/catalog/search` is unauthenticated until `keycloak-realm-roles`.
  - The api image is larger now that the Prisma CLI is a runtime dependency.
- Independent validation: ACCEPT (2026-11-13). Validator re-ran S1-S8 on the live stack: generator sha256 stable, embedder CPU-only (no devices) with 1024 dims on 127.0.0.1, ingest report with the page 5 no-text-layer warning, en/es/SKU search top hit page 3 with 189.90, re-run `unchanged` with identical id hashes, edition-2 replacement verified and restored, failure paths (exit 1/2, HTTP 503/400), 70 tests, `./init.sh` exit 0. Low non-blocking notes: SKU boost is case-sensitive; the embedder fetch checks size, not sha256 (sha256 recorded in ADR 0004); a mid-directory embedder failure loses earlier report lines. Status `accepted`.
- Next best step: next dependency-ready feature in `feature_list.json`.
