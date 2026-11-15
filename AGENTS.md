# Project Agent Instructions

BricoMission is an AI-powered kitchen renovation platform: homeowners turn photos and measurements into photorealistic renders and catalog-grounded budgets, then go DIY or publish a locked dossier to an anonymous marketplace of validated contractors (the DIY list and the marketplace are phase 2). MVP deadline: 2026-11-22.

MVP scope (decision 2026-11-15): the delivered MVP is the features without a `phase` field in `feature_list.json` (the 16 already `accepted` plus `diagnostics-dashboard`). `diagnostics-dashboard` closes the MVP: a separate localhost-only desktop web with a live blueprint-style graph of the whole architecture. Features with `"phase": "phase-2"` (marketplace, bidding, contracts, payments, quotas, Admin panel, budget chat and personas, DIY PDF, Google SSO, language preference, render declutter) are the next phase, outside the project presented to the tutors.

## Read First

- `CONTEXT.md` — domain language (use these terms in code and docs).
- `docs/build-brief.md` — goals, non-goals, MVP priority order (with the 2026-11-15 scope update).
- `docs/domain-model.md` — entities, relationships, lifecycles.
- `docs/risks-and-open-questions.md` — risks and unresolved questions.

Read when relevant:

- `docs/user-and-access-model.md` — roles, permissions, anonymity, revocation.
- `docs/technical-discovery.md` — stack, Compose services, integrations, GPU serialization, testing.
- `ARCHITECTURE.md` — what is built today: monorepo layout, API module layout, runtime services, test layering.
- `docs/adr/` — accepted decisions (0001 local MoE LLM, 0002 deterministic budget math, 0003 monorepo, 0004 CPU multilingual embeddings, 0005 calculated style blend, 0006 diagnostics event bus and metrics agent).
- `DESIGN.md` — visual tokens and UI rules, for any UI work.
- `Documentación del Proyecto_BricoMission.md` — full project definition and PRD (section 3), phase plan (4.2), discovery decisions (4.3), demo video pipeline (5).

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `PROGRESS.md` for current verified state and next step.
3. Read `feature_list.json` and pick the first ready unfinished feature in list order (all `depends_on` accepted) that does NOT carry `"phase": "phase-2"`. Phase 2 features are skipped unless the developer explicitly asks for one.
4. Run `./init.sh`. It runs the workspace gate (`pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`), then the compose gate (`docker compose up -d --build --wait` for the 6 core services, then `/health` must report `database: up`, Keycloak must serve realm `BricoMission` with issuer `http://localhost:$KEYCLOAK_PORT/realms/BricoMission`, and the Web step must pass: `/` with `Accept-Language: es` is 200 with `lang="es"`, `/` with `ja` is 307 to `/language`, `/manifest.webmanifest` is 200, `/api/health` through the web proxy reports `database: up`, and the Capture and Moodboard pages plus `/api/style-gallery` (24 images) answer). If it reports Docker missing or the daemon unreachable, ask the developer to run `./scripts/install-host-prereqs.sh` in their own terminal (it uses sudo) and re-login. Agents never run the install mode or `sudo`; they only run `./scripts/install-host-prereqs.sh --check`.
   - pnpm (version pinned in `package.json` `packageManager`) must be resolvable as `pnpm` or `corepack pnpm`. Without sudo: `corepack enable --install-directory "$HOME/.local/bin" pnpm`, or `npx --yes corepack@0.36.0 enable --install-directory "$HOME/.local/bin" pnpm`, or `npm install --prefix "$HOME/.local" pnpm@<pinned>`. Set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in headless shells.
   - Baseline commands: `pnpm -r lint` and `pnpm -r test` (no database, Docker or browser needed). A second stack of the repo (not the normal flow, which has one feature and one stack) must set `COMPOSE_PROJECT_NAME` and the port env vars (including `API_PORT`, `KEYCLOAK_PORT` and `WEB_PORT`) before any `docker compose` command.
   - Browser E2E against the running stack: `pnpm test:e2e` (Playwright in the pinned `web-e2e` image; extra args go to `playwright test`). PWA installability: `bash scripts/web/lighthouse-pwa.sh`. `./init.sh` never runs either. The diagnostics dashboard spec (project `desktop-1920`) skips itself on a stack without the dashboard; run it with `pnpm test:e2e:diagnostics` (see Diagnostics).
   - E2E specs import `test` from `e2e/fixtures.ts`, which pre-sets `sessionStorage['bm.splash.seen']` so the welcome splash never plays; create extra contexts with its `newContext`; `e2e/splash.spec.ts` opts out with `skipSplash: false`.
   - Brand assets (app icons, favicons, Keycloak favicon copies, code email logo) are generated from `design/openpencil/brand-logo-animation/`: `docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" web-e2e node scripts/render-brand-assets.ts` (commit the output).
5. If baseline verification fails, fix the baseline before adding new feature work.

## Working Rules

- One feature at a time. Keep changes inside its scope.
- Code, identifiers, commits, and technical docs in English. Talk to the developer in Spanish.
- Linux host: scripts are bash `.sh` only.
- Infrastructure runs in Docker Compose v2 (`compose.yaml` at repo root), pinned image tags, named volumes, healthchecks. Anything native needs a written justification.
- GPU: ~14.5 GB free VRAM. Never assume the LLM and the image model are co-resident; go through the API GPU job broker.
- Never let the LLM produce an amount: it extracts cited Line Items, code computes (ADR 0002).
- i18n: every UI string goes into all 11 `apps/web/messages/<locale>.json` files (en canonical; same keys and ICU placeholders; the parity test fails otherwise). Designs are English only.
- API contract changes: run `pnpm --filter @bricomission/api openapi:export` (rewrites `packages/api-client/openapi.json` and `src/schema.ts`) and commit both; `pnpm -r test` fails on drift. The web calls the API only through `@bricomission/api-client` and the same-origin `/api` proxy.
- UI gate: for any new or changed screen, ask the developer to open the matching `.fig` in `design/openpencil/` in OpenPencil, wait for confirmation that the `open-pencil` MCP is connected, design through it, iterate until approved, then implement strictly from the design read back via MCP.
- Do not mark a feature done just because code exists. Do not silently change verification rules.
- Git: repository-local identity only, never `gh`, never merge PRs. Subagents never commit.

## Identity

- Keycloak realm `BricoMission` comes from `infra/keycloak/import/BricoMission-realm.json`. Its realm roles are `user`, `professional` and `admin`.
- Seeded accounts (passwords from env, defaults in `.env.example`):
  - `bm-admin` (`admin`, `BM_SEED_ADMIN_PASSWORD`)
  - `bm-homeowner` (`user`, `BM_SEED_HOMEOWNER_PASSWORD`)
  - `bm-professional` (`professional`, `BM_SEED_PROFESSIONAL_PASSWORD`)
  - Master console admin: `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD`.
- Browser login asks for the password, then a 6-digit code sent by email (read it in Mailpit). Password grants on the dev-only client `bricomission-dev-cli` skip the code.
- Anyone can create an account on the Keycloak sign-in page ("Create account"). A new account gets exactly realm role `user` (default role) and must enter the email code before it is signed in.
- Keycloak pages and the code email use the theme in `infra/keycloak/themes/bricomission/` (11 locales, chosen by the client's `ui_locales`). Keycloak stores no `locale` on accounts: never set that attribute, since it would override `ui_locales`. Theme changes need `docker compose up -d --build --wait keycloak`, not a realm reset.
- `./scripts/keycloak-smoke.sh` checks role tokens, API 401/403/200, SMTP to Mailpit and the email-code login against the running stack.
- Web sign-in: the "Sign in" entry in the Home header goes to `/auth/login`. The web server is the confidential OIDC client `bricomission-web` (BFF): tokens stay on the server, sessions live in the web-owned schema `web_session` (opaque `bm_session` cookie, AES-GCM tokens). Any realm account may sign in. `/api/*` calls carry the session's token; the browser's `Authorization` header is dropped.
  - Secrets from env with dev defaults in `.env.example`: `BM_WEB_CLIENT_SECRET` (shared by Keycloak and the web; a change needs a realm reset) and `WEB_SESSION_KEY` (base64 of 32 bytes; `openssl rand -base64 32`; a change signs every web session out). Never use the defaults outside local development.
  - Sign in on `http://localhost:$WEB_PORT`, not `127.0.0.1` (cookies are host-scoped; `/auth/login` redirects there).
  - `bash scripts/web/auth-persist-check.sh` proves a session survives `docker compose restart web`.
- The API is default-deny. A new route is protected unless it is explicitly `@Public()`. Restrict it by role with `@Roles(...)`.
- The realm is imported only once per `keycloak-data` volume. After editing the realm JSON or the seed passwords, reset the realm: `docker compose rm -sf keycloak && docker volume rm ${COMPOSE_PROJECT_NAME}_keycloak-data`, then `docker compose up -d --build --wait`. Confirm the project name first; without `COMPOSE_PROJECT_NAME` it is the directory name. A realm volume older than `keycloak-login-theme` or `homeowner-password-login` needs this reset; `./init.sh` detects it (no theme on the sign-in page, or the `bricomission-web` client is rejected) and prints the command. `WEB_PORT` is baked into the client's redirect URI at import, so changing it also needs the reset.

## Kitchen Drafts

- Anonymous Capture drafts (`/kitchen-projects/new`) are bound to the HttpOnly cookie `bm_draft`. The web proxy sends it to the API as `X-Draft-Token`; the API stores only its SHA-256. Unknown or expired tokens give 404.
- Photos are stored as metadata-free JPEGs in the private MinIO bucket `bricomission-media` (`S3_BUCKET`), keys `kitchen-projects/<projectId>/photos/<photoId>/{full,thumb}.jpg`. Inspect them in the MinIO console on `MINIO_CONSOLE_PORT` (9001) with the MinIO root credentials. Never add a bucket policy.
- Claim (`login-gate-claim`): at the Generate step (`/kitchen-projects/new/generate`) a signed-in Homeowner claims the draft through `POST /api/kitchen-projects/drafts/current/claim`. The row becomes `claimed` (owner = Keycloak `sub`, no expiry, same id), `bm_draft` is cleared, and the owner reads it at `/kitchen-projects/<id>`. Claimed projects never expire and the sweeper never touches them. Professional/Admin tokens get 403. Claimed projects stay editable: owner routes `PUT /kitchen-projects/:id/measurements`, `POST|DELETE .../photos`, `POST .../moodboard/gallery-items|uploads`, `DELETE .../moodboard/items/:itemId` (same bodies and limits as the draft routes; web pages `/kitchen-projects/<id>/edit/photos|measurements|styles`), refused with 409 `simulation_in_progress` or `budget_in_progress` while a Simulation or Budget is active. Reuse `OwnedProjectGuard` for new owner routes.
- Simulations (`simulations-ux-overhaul`, ADR 0005): `POST /api/kitchen-projects/:id/simulations` (202) creates one Simulation = one Render per photo (max 8) sharing one calculated style; `GET .../simulations[/:simulationId]`, `DELETE` (204; removes Renders, objects and Budget), `PUT .../selected-simulation`, `POST .../renders/:renderId/retry`; pages `/kitchen-projects/<id>/results` and the project page "My simulations". Keys `kitchen-projects/<projectId>/renders/<renderId>/{before,full,thumb}.jpg` (`before` = the exact crop the model got; same size as `full`). One active Simulation per project (409 `simulation_in_progress`), no cap on Simulations or Renders, never expire. A Simulation is selectable and budgetable only when every Render succeeded. The blend mode (`ip_adapter|vlm_text|both`, default `both`) is read from the platform setting at creation: `GET|PUT /api/admin/settings/style-blend` (admin token; no UI yet). `POST|GET .../renders` no longer exist. The fake image adapter fails a solid magenta "poison photo" (`apps/web/e2e/fixtures/fail-once.jpg`) once per seed, so Retry is testable without mocks.
- Budgets (`budget-tier-computation`, ADR 0002): owner routes `POST /api/kitchen-projects/:id/budget` (202, polls `GET .../budgets/:budgetId`), `GET .../budgets`, page `/kitchen-projects/<id>/budget`. Pure database rows (no MinIO keys); all money is integer cents computed by `budget-math.ts`; Catalog prices are VAT-inclusive (`BUDGET_VAT_PERCENT` 21). A Budget belongs to the selected Simulation (409 `no_simulation_selected`, `simulation_not_ready`): one current Budget per Simulation, replaced on recompute, removed with the Simulation; one active Budget per project; no per-project cap. A vision job reads every Render image first (inventory), then the pricing job runs up to `BUDGET_MAX_ATTEMPTS` (3) attempts; code enforces Luxury > High > Medium > Low on totals and otherwise relabels the tiers by total rank (`relabeled`, names only). Every Line Item must quote a SKU and price printed in the cited Catalog chunk, else it is rejected. The Budget needs the CPU embedder up and a Catalog ingested (409 `catalog_empty`, 503 `embedding_unavailable`), also with the fake adapter: start `docker compose --profile rag up -d --wait embedder` and `./scripts/catalog/ingest.sh infra/catalog/samples` before E2E (`pnpm test:e2e` budget specs) or `scripts/ai/budget-smoke.sh`.
- Drafts expire `DRAFT_TTL_DAYS` (7) after their last change. The API deletes expired drafts and their objects on start and every `DRAFT_CLEANUP_INTERVAL_MS`. `DRAFT_MAX_OPEN` caps open drafts.
- Moodboard (`/kitchen-projects/new/moodboard`): at most 12 items per draft. Reference photos use the photo pipeline and keys `kitchen-projects/<projectId>/moodboard/<itemId>/{full,thumb}.jpg`; Style Gallery picks store no objects. The sweeper deletes both kinds of keys.
- Style Gallery: 24 committed JPEGs in `apps/api/assets/style-gallery/` (manifest, `SOURCE.md`), served by public API routes from disk. Never generate at runtime. To regenerate an image (GPU): `docker compose stop llama-server`, `docker compose --profile ai up -d --wait comfyui`, `scripts/style-gallery/generate.sh <id ...>`, `node apps/api/scripts/build-style-gallery.ts --contact-sheet <png>`, then `docker compose --profile ai stop comfyui`. Ids are stable: never remove or reuse one.
- HEIC fixtures: `apps/api/scripts/generate-heic-fixtures.sh` (needs network for apt in a pinned Debian container).

## AI Services

- The local AI stack is opt-in and GPU-bound, so `./init.sh` never starts it.
  - Download the weights once: `docker compose --profile ai-fetch run --rm ai-fetch` (about 30 GB into named volumes; idempotent).
  - Start: `docker compose --profile ai up -d --wait` (`llama-server` on `LLAMA_PORT` 8080, `comfyui` on `COMFYUI_PORT` 8188, both on 127.0.0.1).
  - Stop: `docker compose --profile ai stop llama-server comfyui` (name the services: a bare `--profile ai stop/down` also stops the core stack).
- Models (ADR 0001 amended, ADR 0005): `llama-server` runs in router mode (`--models-preset infra/ai/llama-models.ini --models-max 1`) with `Qwen3-VL-30B-A3B-Instruct` Q4_K_M plus its mmproj (19.6 GB), so every chat request must send `"model": "qwen3-vl"` (`LLM_MODEL`); ComfyUI has the IP-Adapter custom node (pinned commit in `infra/comfyui/Dockerfile`) and its weights. Both come from `docker compose --profile ai-fetch run --rm ai-fetch`, so an older checkout must rerun it (and rebuild comfyui: `docker compose --profile ai build comfyui`) before `--profile ai up`. The old text model stays in the `llm-models` volume until the developer deletes it by hand.
- Serialization and residency (measured 2026-11-14, `docs/spikes/simulations-gpu-spike.md`): the vision model is about 4-4.6 GB resident and ComfyUI fills the card (about 15-16 GB) during a render; both together cost +46 % to +100 % render time. The API therefore unloads the LLM before every image job (`POST /models/unload`, 0.01 s) and the next LLM job reloads it (about 7 s). Never assume the two are resident together. Free ComfyUI with `POST /free` or `docker compose stop llama-server`.
- Spike tools: `scripts/ai-spike/{llm-bench,comfy-run,vram-sample,vlm-bench,ipadapter-run}.sh`.
- The API reaches llama-server and ComfyUI only with `AI_ADAPTERS=local`; the default `fake` uses deterministic adapters and never touches the GPU (the fake Render is a tinted copy of the photo; the fake vision traits and inventory come from the image hash). Tests and E2E always use `fake`. The vision cache key carries `fake:` for fake adapters, so fake and real traits never mix.
- Real Simulations and Budgets in one run: `docker compose --profile rag up -d --wait embedder` (the Budget needs the CPU embedder; the script ingests `infra/catalog/samples` when the index is empty), then `bash scripts/ai/simulation-smoke.sh` (holds `/tmp/bricomission-gpu.lock`; recreates the api with `AI_ADAPTERS=local` and checks it; a project with 3 photos and 3 references; one Simulation per blend mode switched through the admin API, the default restored, a "Generate again" Simulation, selection and a Budget; prints stage and per-Render seconds, merged style keywords and weights, llama-server loaded/unloaded transitions, VRAM peaks, tier totals, the psql re-sum; writes `docs/spikes/assets/simulations-blend-modes.jpg`; `--no-gpu` runs the same flow on the fakes with a temporary contact sheet; `--keep` keeps the Simulations). Afterwards: `docker compose --profile ai stop llama-server comfyui`, `docker compose --profile rag stop embedder`, `docker compose up -d --wait api` (back on `fake`).
- Tuned Render defaults (2026-11-15): `RENDER_CONTROL_MODE=canny|depth` (default canny), `RENDER_CANNY_LOW/HIGH` 0.6/0.95, `RENDER_CONTROL_STRENGTH` 0.8, `RENDER_CONTROL_END` 0.5, depth assist `RENDER_DEPTH_ASSIST_STRENGTH` 0.7 / `RENDER_DEPTH_ASSIST_END` 1 (0 = off); IP-Adapter base weights `SIMULATION_IPADAPTER_BASE_WEIGHT` 0.6 (`ip_adapter`) and `SIMULATION_BOTH_BASE_WEIGHT` 0.4 (`both`). Single-Render timings with llama-server idle: cold 17.5-19.6 s, warm 10.2-10.8 s; with references 14-16 s warm. `scripts/ai/render-smoke.sh` was removed (it drove the deleted `POST /renders`); `simulation-smoke.sh` replaces it. Tuning harness results: `docs/spikes/assets/controlnet-render-tuning.jpg`.
- Real Budgets: `docker compose --profile ai up -d --wait llama-server` (`budget-smoke.sh` starts `comfyui` itself for its Simulation), `AI_ADAPTERS=local docker compose up -d --wait api`, then `bash scripts/ai/budget-smoke.sh` (holds `/tmp/bricomission-gpu.lock`, ingests `infra/catalog/samples` when the index is empty, prints the four tier totals with citations, seconds and token counts, and recomputes the tier totals from the Line Item rows with psql; `--no-gpu` runs the same flow on the fake adapter). Afterwards `docker compose --profile ai stop llama-server` and `docker compose up -d --wait api` to go back to `fake`. Measured 2026-11-14 (llama-server alone): 38.2 s and 55.7 s for one Budget, 1 attempt, 900-1428 completion tokens, every Line Item verified; the broker LLM timeout is now 240 s per job (`GPU_BROKER_LLM_TIMEOUT_MS`), enough for three pricing attempts; see `docs/spikes/simulations-gpu-spike.md` for the multimodal numbers.
- Demo launcher: `./launch-demo.sh` brings up the whole stack with the real models (core, CPU embedder, sample Catalog ingest, llama-server, ComfyUI, API on `AI_ADAPTERS=local`) and the diagnostics dashboard (API and web with `DIAGNOSTICS_ENABLED=true`, profile `diagnostics`), prints the URLs and test account, and stays in the foreground: Ctrl+C or SIGTERM runs `docker compose stop` for everything (volumes kept). Options: `--fake` (no GPU), `--fetch` (idempotent weight downloads), `--keep-core` (stop only GPU services, embedder and diagnostics services; API back on fake, API and web without diagnostics), `--no-diagnostics` (no dashboard). llama-server and ComfyUI load their models lazily, so the first request is slower (about 25 s for an image).
- Catalog RAG embedder (ADR 0004). It is CPU-only: do not add GPU devices, `group_add` or `-ngl` > 0 to it.
  - Download the weights once: `docker compose --profile rag-fetch run --rm embedder-fetch` (about 640 MB into `bricomission_embedding-models`; idempotent).
  - Start: `docker compose --profile rag up -d --wait embedder` (`EMBEDDING_PORT` 8090 on 127.0.0.1). Stop: `docker compose --profile rag stop embedder` (name the service).
  - Ingest any directory of Catalog PDFs: `./scripts/catalog/ingest.sh <dir> [--force]` (exit 0 ok, 1 failed document or embedder down, 2 usage). Search: `GET /catalog/search?q=&limit=`.
  - Synthetic sample Catalog: `./scripts/catalog/generate-sample-catalog.sh [out-dir] [--edition 2]` (committed output in `infra/catalog/samples/`). Real Catalogs stay out of git.

## Diagnostics

- The diagnostics dashboard (ADR 0006) is opt-in and off by default, so `./init.sh` never starts it (it only validates the profile and checks that `/diagnostics/topology` is 404).
  - Start: `DIAGNOSTICS_ENABLED=true docker compose --profile diagnostics up -d --build --wait` (recreates `api` and `web` with events on; adds `diagnostics` on `127.0.0.1:${DIAGNOSTICS_PORT:-3200}` and `diagnostics-agent`, which has no published port). Open `http://localhost:3200` in a desktop window: no login, English only, 1920x1080 (also 1440x1080 and 1366x768).
  - Stop: `docker compose --profile diagnostics stop diagnostics diagnostics-agent` (name the services), then `docker compose up -d --wait` so `api` and `web` run without diagnostics again.
  - `./launch-demo.sh` does both by itself (dashboard on by default, `--no-diagnostics` to skip).
- Env (`.env.example`): `DIAGNOSTICS_ENABLED` (false), `DIAGNOSTICS_TOKEN` (shared secret of api, web, agent and dashboard server, at least 16 characters; compose dev default, never outside local use), `DIAGNOSTICS_PORT` (3200), `DIAGNOSTICS_BUFFER_SIZE` (1000 events), `DIAGNOSTICS_BUFFER_MAX_MB` (32), `DIAGNOSTICS_SOURCE` (`live`, or `replay` to play the recorded session). A changed token or flag needs `api`, `web`, `diagnostics` and `diagnostics-agent` recreated from the same environment.
- Any command that recreates the `api` without the flag turns the events off again (the dashboard then shows `API DISABLED`): `./scripts/catalog/ingest.sh`, `scripts/ai/simulation-smoke.sh`, `scripts/ai/budget-smoke.sh`, a plain `docker compose up -d`. Export `DIAGNOSTICS_ENABLED=true` in that shell first.
- The dashboard never changes app state and never calls an AI endpoint. It shows every user's prompts and project metadata without login: demo machine only. The API routes `/diagnostics/*` are `@Public()` plus `DiagnosticsTokenGuard` (header `X-Diagnostics-Token`) and hidden from OpenAPI; the token never reaches a browser.
- New instrumentation: emit through the injected `DIAGNOSTICS` service (`{ token: DIAGNOSTICS, optional: true }`, guarded by `diagnostics.enabled`), with node ids from `apps/api/src/diagnostics/topology.ts`. Never put tokens, cookies, codes, seeds or image bytes in a payload (images only through `makeThumb`); `redact.ts` runs on every event anyway. A new node or edge needs the OpenPencil design re-exported (`design/openpencil/diagnostics-dashboard/layout-reference.json`) first: the topology and layout tests fail until API, layout and export agree.
- Metrics agent (`diagnostics-agent`): read-only, but privileged (`pid: host`, `cgroup: host`, root with only `SYS_PTRACE`, `/sys` and the Docker socket read-only). Keep it in its profile with no published port and keep its GET-only Docker allowlist; do not add capabilities, ports or write calls without a new ADR. VRAM per container is measured; GPU % per container is always approximate (`approx: true`); unmeasurable values are `null` (`n/a`), never 0.
- Replay: `http://localhost:3200/?source=replay` (optional `&speed=5`) plays `apps/diagnostics/replay/demo-simulation-budget.ndjson` with the `REPLAY` chip, without the API or the agent. Re-record with `bash scripts/diagnostics/record-replay.sh` (fake adapters), then rebuild the `diagnostics` image.
- E2E: `pnpm test:e2e:diagnostics` (`scripts/diagnostics/e2e.sh`; `-- --live-only` skips the stack states). It starts the stack with diagnostics on, the embedder and the sample Catalog, runs Playwright project `desktop-1920` (`apps/web/e2e/diagnostics.spec.ts`) live, then once per stack state (dashboard restart, agent stopped, token mismatch, API disabled), and leaves the stack up with diagnostics on. Needs fake adapters.
- Real GPU metrics check: `docker compose --profile diagnostics up -d --wait diagnostics-agent`, `docker compose --profile rag up -d --wait embedder`, then `DIAGNOSTICS_ENABLED=true bash scripts/diagnostics/gpu-check.sh` (runs `simulation-smoke.sh`, which holds `/tmp/bricomission-gpu.lock`; `--llm-only` is the short variant). Restore afterwards as for the smoke script, plus the diagnostics Stop above.

## Required Artifacts

- `feature_list.json`: source of truth for feature state (`not_started`, `in_progress`, `blocked`, `passing`, `accepted`).
- `PROGRESS.md`: current verified state and session log.
- `init.sh`: standard startup and verification path.

## Definition Of Done

A feature is done only when all are true:

- target behavior is implemented,
- required verification actually ran,
- evidence is recorded in `feature_list.json` or `PROGRESS.md`,
- the repository restarts cleanly with `./init.sh`,
- docs are updated if product behavior, domain rules, API, or verification changed.

Only the `/feature-flow` orchestrator marks `accepted`, after the independent validator's `accept`.

## End Of Session

1. Update `PROGRESS.md`.
2. Update `feature_list.json`.
3. Record unresolved risks or blockers.
4. Leave the repo ready for `./init.sh`.
