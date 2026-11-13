# Technical Discovery

Host hardware and VRAM limits: doc section 1.4 of `Documentación del Proyecto_BricoMission.md`.

## Product Surface

Mobile-first PWA for Homeowners; the same PWA serves the B2B dashboard and the Admin Dashboard (desktop-friendly). Framework-agnostic REST API reused later by a native iOS app.

## Candidate Stack

- **Monorepo**: TypeScript, pnpm workspaces. `apps/web`, `apps/api`, shared `packages/` (types, API client generated from OpenAPI). See ADR 0003.
- **Web**: Next.js (App Router) + Tailwind, client of the API only; i18n with 11 locales (en canonical); PWA manifest + service worker.
- **API**: NestJS, REST + OpenAPI, Prisma on PostgreSQL, SSE endpoints, in-process GPU job queue (decided in `gpu-job-broker`, see GPU Serialization).
- **Identity**: Keycloak realm `BricoMission`, OIDC; roles `user`, `professional`, `admin`.
- **LLM**: llama.cpp `llama-server` (OpenAI-compatible) running a medium MoE model (e.g. Qwen3-30B-A3B, Q4) with experts in system RAM (`--n-cpu-moe` / `-ot`). See ADR 0001.
- **Embeddings / RAG**: `Qwen3-Embedding-0.6B` Q8_0 (1024 dimensions, multilingual), served **CPU-only** by llama.cpp `server-b12316` (compose service `embedder`); vectors in PostgreSQL (pgvector `vector(1024)`, HNSW cosine). See ADR 0004.
- **Images**: ComfyUI with SDXL + ControlNet (Depth, Canny), driven by API workflows from `apps/api`.
- **PDF**: server-side generation (Shopping List, Contract) in `apps/api`.
- **Demo video**: HyperFrames + local Whisper (doc section 5), outside the runtime stack.

## Data and Storage

- PostgreSQL (container): relational data + pgvector.
- MinIO (container): photos, Renders, Catalog PDFs, generated PDFs. Credentials editable from the Admin Dashboard.
- Optional (not required, developer-run, needs sudo): keep Docker images and volumes off the system disk by mounting a data NVMe and setting `"data-root"` in `/etc/docker/daemon.json` before the first image pull, then restarting docker (`sudo systemctl restart docker`). Not scripted.
- Catalog ingestion: Catalog PDFs (curated with NotebookLM offline by the developer) are chunked and embedded into pgvector by `./scripts/catalog/ingest.sh <dir>`. It accepts any directory, extracts text page by page, skips pages without a text layer, and is idempotent by content hash and embedding model. Search: `CatalogSearchService` (in-process) and `GET /catalog/search`.

## Integrations

| Integration | Online | Offline fallback |
| --- | --- | --- |
| Google SSO (Keycloak identity provider) | yes | Keycloak username/password |
| OTP | email OTP | Mailpit container as local inbox |
| PayPal Sandbox | yes | Simulated payment |
| Cloud LLM endpoint | optional | local llama.cpp |

## Authentication and Authorization

OIDC Authorization Code + PKCE from the PWA; the API validates Keycloak JWTs and enforces resource rules from `docs/user-and-access-model.md`. Re-authentication (`max_age`/`prompt=login`) before Electronic Acceptance.

Built in `keycloak-realm-roles` (2026-11-13):

- Keycloak 26.8.2 runs in compose with `start-dev` and `KC_DB=dev-file`. That is H2 in the `keycloak-data` named volume, not PostgreSQL, a deliberate local-only choice: no shared-DB bootstrap, and each worktree gets an isolated realm. Production would use a Postgres-backed Keycloak (non-goal for the MVP).
- The realm is imported from a versioned JSON on first start and skipped on later starts. Seed passwords are `${BM_SEED_*}` placeholders that Keycloak resolves from env at import time.
- Fixed issuer `http://localhost:$KEYCLOAK_PORT/realms/BricoMission` (`KC_HOSTNAME`) for browser, CLI and API alike. The API fetches the JWKS over the compose backchannel (`http://keycloak:8080`, `KC_HOSTNAME_BACKCHANNEL_DYNAMIC`).
- Access tokens carry `aud: bricomission-api` through an audience mapper on the client. The API checks RS256 signature, `iss`, `aud` and `exp`, and authorizes on `realm_access.roles`.
- Email OTP: core Keycloak 26.8.2 has no email-code login authenticator, so the image adds the Apache-2.0 provider `mesutpiskin/keycloak-2fa-email-authenticator` v26.7.2. It uses authenticator `email-authenticator-no-enrollment`, a 6-digit code with 300 s TTL and 5 attempts, sent through the realm SMTP, which is Mailpit (`mailpit:1025`, from `noreply@bricomission.local`). The browser flow `browser-email-otp` runs cookie, then password, then the email code. The direct grant flow stays default (no code) for the dev-only CLI client.

## Deployment and Operations

- Single `compose.yaml` at repo root: postgres, keycloak, minio, mailpit, llama-server, comfyui, api, web (no Redis: the job queue is in-process). Pinned image tags, named volumes, healthchecks.
- GPU passed to llama-server and ComfyUI via `/dev/kfd` and `/dev/dri` (ROCm) or `/dev/dri` (Vulkan). Measured setup (2026-11-12): both use ROCm, `group_add: [video, ${RENDER_GID:-987}]` (host `render` GID 987 owns `/dev/kfd`; `video` GID 983). ComfyUI also uses `ipc: host` and `seccomp=unconfined`.
- The AI services are opt-in compose profiles: `ai` (`llama-server`, `comfyui`) and `ai-fetch` (one-shot weight download into the named volumes `llm-models`, `comfyui-models`, `comfyui-annotators`). `./init.sh` never starts them. Ports `LLAMA_PORT` (8080) and `COMFYUI_PORT` (8188) bind to 127.0.0.1. Measurements: `docs/spikes/local-ai-gpu-spike.md`.
- The Catalog RAG embedder is opt-in too: profile `rag` (`embedder`, CPU-only, no GPU devices, port `EMBEDDING_PORT` 8090 on 127.0.0.1) and `rag-fetch` (`embedder-fetch`, one-shot download into the fixed-name volume `bricomission_embedding-models`). `./init.sh` never starts it.
- The api container applies Prisma migrations (`prisma migrate deploy`) best-effort on start; `scripts/catalog/ingest.sh` applies them too.
- `init.sh` brings the stack up and verifies health; works offline after the first pull.
- Per-worktree isolation via `COMPOSE_PROJECT_NAME`.

## GPU Serialization

- One GPU job broker in `apps/api` (`src/ai/jobs/gpu-job-broker.service.ts`, built by `gpu-job-broker`): image jobs run one at a time, LLM jobs never run alongside an image job.
- Queue decision (2026-11-13): in-process, in-memory FIFO scheduler. Rationale: one API instance and one physical GPU; jobs are short (render 8-20 s, chat seconds) and tied to a live client waiting on SSE; exact mutual exclusion with no extra service, no Redis port per worktree, no migration, works offline. Rejected: BullMQ + Redis (an extra container for durability/multi-instance support we do not need) and a PostgreSQL queue (first migration plus polling or LISTEN/NOTIFY for the same result). Trade-off: queued and running jobs are lost on API restart (clients get 404 and retry). Callers depend on the `GpuJobBroker` interface, so a durable backend can replace it.
- Admission: one FIFO queue, head-of-line only (no look-ahead, so a queued image is never starved by later chat). An image head starts when nothing runs; an LLM head starts when no image runs and fewer than `GPU_BROKER_LLM_CONCURRENCY` (default 1) LLM jobs run. Per-kind timeouts abort the adapter and free the slot.
- VRAM policy: serialization alone meets the measured constraint (LLM idle 3.2 GB and ComfyUI idle cache 7.4 GB coexist; only simultaneous compute overloads the card), so the broker does not unload models and avoids the 8-11 s reload. `GpuResidencyHook.beforeImage()/afterImage()` (no-op) runs around every image job; `controlnet-render` can plug ComfyUI `POST /free` or an LLM stop in there if real renders prove it necessary.
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
