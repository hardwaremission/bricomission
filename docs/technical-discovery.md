# Technical Discovery

Host hardware and VRAM limits: doc section 1.4 of `Documentación del Proyecto_BricoMission.md`.

## Product Surface

Mobile-first PWA for Homeowners; the same PWA serves the B2B dashboard and the Admin Dashboard (desktop-friendly). Framework-agnostic REST API reused later by a native iOS app.

## Candidate Stack

- **Monorepo**: TypeScript, pnpm workspaces. `apps/web`, `apps/api`, shared `packages/` (types, API client generated from OpenAPI). See ADR 0003.
- **Web**: Next.js (App Router) + Tailwind, client of the API only; i18n with 11 locales (en canonical); PWA manifest + service worker.
- **API**: NestJS, REST + OpenAPI, Prisma on PostgreSQL, SSE endpoints, background job queue (BullMQ on Redis, or PostgreSQL-based; decide in the first feature spec).
- **Identity**: Keycloak realm `BricoMission`, OIDC; roles `user`, `professional`, `admin`.
- **LLM**: llama.cpp `llama-server` (OpenAI-compatible) running a medium MoE model (e.g. Qwen3-30B-A3B, Q4) with experts in system RAM (`--n-cpu-moe` / `-ot`). See ADR 0001.
- **Embeddings / RAG**: small embedding model served locally; vectors in PostgreSQL (pgvector).
- **Images**: ComfyUI with SDXL + ControlNet (Depth, Canny), driven by API workflows from `apps/api`.
- **PDF**: server-side generation (Shopping List, Contract) in `apps/api`.
- **Demo video**: HyperFrames + local Whisper (doc section 5), outside the runtime stack.

## Data and Storage

- PostgreSQL (container): relational data + pgvector.
- MinIO (container): photos, Renders, Catalog PDFs, generated PDFs. Credentials editable from the Admin Dashboard.
- Optional (not required, developer-run, needs sudo): keep Docker images and volumes off the system disk by mounting a data NVMe and setting `"data-root"` in `/etc/docker/daemon.json` before the first image pull, then restarting docker (`sudo systemctl restart docker`). Not scripted.
- Catalog ingestion: Catalog PDFs (curated with NotebookLM offline by the developer) are chunked and embedded by an ingestion script into pgvector.

## Integrations

| Integration | Online | Offline fallback |
| --- | --- | --- |
| Google SSO (Keycloak identity provider) | yes | Keycloak username/password |
| OTP | email OTP | Mailpit container as local inbox |
| PayPal Sandbox | yes | Simulated payment |
| Cloud LLM endpoint | optional | local llama.cpp |

## Authentication and Authorization

OIDC Authorization Code + PKCE from the PWA; the API validates Keycloak JWTs and enforces resource rules from `docs/user-and-access-model.md`. Re-authentication (`max_age`/`prompt=login`) before Electronic Acceptance.

## Deployment and Operations

- Single `compose.yaml` at repo root: postgres, keycloak, minio, mailpit, llama-server, comfyui, (redis), api, web. Pinned image tags, named volumes, healthchecks.
- GPU passed to llama-server and ComfyUI via `/dev/kfd` and `/dev/dri` (ROCm) or `/dev/dri` (Vulkan). Measured setup (2026-11-12): both use ROCm, `group_add: [video, ${RENDER_GID:-987}]` (host `render` GID 987 owns `/dev/kfd`; `video` GID 983). ComfyUI also uses `ipc: host` and `seccomp=unconfined`.
- The AI services are opt-in compose profiles: `ai` (`llama-server`, `comfyui`) and `ai-fetch` (one-shot weight download into the named volumes `llm-models`, `comfyui-models`, `comfyui-annotators`). `./init.sh` never starts them. Ports `LLAMA_PORT` (8080) and `COMFYUI_PORT` (8188) bind to 127.0.0.1. Measurements: `docs/spikes/local-ai-gpu-spike.md`.
- `init.sh` brings the stack up and verifies health; works offline after the first pull.
- Per-worktree isolation via `COMPOSE_PROJECT_NAME`.

## GPU Serialization

- One GPU job broker in `apps/api`: image jobs run one at a time.
- Before an SDXL job, the broker ensures VRAM headroom (MoE LLM uses little VRAM; if not enough, pause chat requests or unload the LLM).
- Measured 2026-11-12: serialization is required. The LLM holds about 3.2 GB. ComfyUI holds about 7.4 GB idle-cached and peaks at about 15 GB over the desktop baseline during a render, because it takes whatever VRAM is free. Running both at once did not OOM but cost about 25 % speed on each, so renders run alone and chat requests wait. Unload: ComfyUI `POST /free` (VRAM is released within about 3 s, and the next render adds about 8-11 s of reload). `docker compose stop llama-server` takes 0.6 s, and `up -d --wait` brings it back healthy in about 5.5 s.
- Chat requests during a Render wait in the queue with a visible status.

## Budget Computation

See ADR 0002. LLM returns JSON Line Items (schema-constrained output) with source references; the API verifies each cited price against the retrieved chunk text and computes subtotals, tier totals, VAT, penalties, and commission with decimal arithmetic.

## Testing and Verification

- Unit tests for budget math, penalty and commission computation, access rules.
- API integration tests against the Compose stack (Postgres, Keycloak test realm).
- E2E smoke of the demo path with Playwright on a mobile viewport.
- AI calls behind an interface with deterministic fakes in tests.

## Observability

Structured JSON logs from API (request id, user id, AI call duration, tokens, quota usage). Admin Dashboard shows token and image usage per user and per service. No external monitoring in MVP.

## Constraints

- Deadline 2026-11-22; full PRD scope.
- ~14.5 GB free VRAM; 64 GB RAM; RDNA4 (gfx1201) needs ROCm ≥ 6.4 in containers, Vulkan as fallback.
- Linux host, bash scripts only, Docker Compose v2.
- English for code and technical docs.
