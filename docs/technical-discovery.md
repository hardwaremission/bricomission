# Technical Discovery

Host hardware and VRAM limits: doc section 1.4 of `Documentación del Proyecto_BricoMission.md`.

## Product Surface

Mobile-first PWA for Homeowners; the same PWA serves the B2B dashboard and the Admin Dashboard (desktop-friendly), both [Phase 2] since 2026-11-15 (their roles exist in Keycloak, their functions are not built in the delivered MVP).

MVP addition (2026-11-15, built; ADR 0006, `ARCHITECTURE.md` section "Diagnostics"): `diagnostics-dashboard`, a separate desktop web (own URL and port on 127.0.0.1, own Compose profile, no login) that draws every container and API module as a blueprint-style node graph, animates the connections that are working, narrates each hop in a collapsible log, and shows CPU %, RAM, VRAM and GPU % per container (API modules share the API container's values). It is diagnostic only. Compose services `diagnostics` (127.0.0.1:3200) and `diagnostics-agent` (no published port), profile `diagnostics`, off by default (`DIAGNOSTICS_ENABLED`). Framework-agnostic REST API reused later by a native iOS app.

## Candidate Stack

- **Monorepo**: TypeScript, pnpm workspaces. `apps/web`, `apps/api`, shared `packages/` (types, API client generated from OpenAPI). See ADR 0003.
- **Web**: Next.js (App Router) + Tailwind, client of the API only; i18n with 11 locales (en canonical); PWA manifest + service worker.

Built in `web-pwa-shell` (2026-11-13):

- Next.js 16.4.6 (Turbopack build, `output: 'standalone'`), React 19.3.1, Tailwind CSS 4.3.5 (`@tailwindcss/postcss`), `next-intl` 4.15.1 without i18n routing (no locale in the URL), `lucide-react` icons, Inter self-hosted from `@fontsource-variable/inter` (latin + latin-ext only). No Google Fonts or CDN: the PWA makes no internet requests.
- Locale mapping: browser `nb`, `nn` and `no` all map to `no` (Bokmål); `pt-BR`/`pt-PT` to `pt`. Unsupported or missing languages see Language Selection (`/language`, English). The choice persists on the device in the `NEXT_LOCALE` cookie (1 year, `SameSite=Lax`); persistence on the account is `language-preference-account`. The 10 non-English message files are agent translations without native review (developer decision); only the automated parity test guards them.
- Proxy decision: the browser calls the API through a same-origin route handler (`/api/*` to `API_INTERNAL_URL`) instead of CORS: no per-worktree origins, first-party cookies, one origin for the service worker and future auth. Not `rewrites`, because standalone output fixes them at build time. The native iOS client calls the API directly.
- Typed client: `packages/api-client` (`openapi-fetch` 0.17.0 over `openapi-typescript` 7.13.0 output from a committed OpenAPI snapshot).
- Installability is proven twice: CDP `Page.getInstallabilityErrors` returns `[]` in the Playwright E2E, and Lighthouse 11.7.1 (pinned; Lighthouse 12+ dropped the PWA category and `installable-manifest`) scores `installable-manifest` 1 with the Playwright image's Chromium 158.
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
- Photo upload path (`kitchen-capture-draft`): the browser posts multipart through the same-origin web proxy to the API, which validates and normalizes every image before anything is stored. Presigned browser-to-MinIO PUTs were rejected: they need MinIO CORS and a second browser-visible origin (the signature host differs inside and outside compose), and unprocessed originals with GPS data would land in storage.
- Image pipeline and privacy: the type comes from the file's magic bytes; JPEG/PNG/WebP decode with `sharp` 0.35.5; HEIC/HEIF decode with `heic-decode` 2.1.0 over `libheif-js` 1.23.5 (WASM libheif + libde265, LGPL-3.0 unmodified), because sharp's prebuilt libvips includes libheif for AVIF only and fails on HEVC (probed in the api container). Every photo is stored as a metadata-free sRGB JPEG `full` (<= 2560 px, orientation applied once) plus a `thumb` (<= 512 px); EXIF/GPS, XMP, IPTC, ICC and the original bytes are never stored.
- Style Gallery (`moodboard-selection`, developer decision OQ-2/OQ-7): 24 kitchen images generated once at development time with the local SDXL checkpoint (RealVisXL V5.0, ComfyUI txt2img, fixed prompts and seeds; `scripts/style-gallery/generate.sh` + `apps/api/scripts/build-style-gallery.ts`), re-encoded with sharp to metadata-free JPEGs and committed in `apps/api/assets/style-gallery/` (about 3.2 MB, `SOURCE.md` has model, workflow, seeds and licence status). The API serves them from disk on public routes (`GET /style-gallery`, `GET /style-gallery/images/:id/content`): no database, MinIO, GPU or network at runtime, one source for the web, the future iOS app and the later Render. Rejected: CC0 web photos (network, uneven quality) and web `public/` files (the API would still need the ids).
- Moodboard reference photos reuse the Photo pipeline unchanged (`processPhoto`) and the same private bucket, under `kitchen-projects/<projectId>/moodboard/<itemId>/{full,thumb}.jpg`.
- S3 client: `@aws-sdk/client-s3` 3.1169.0 (path-style, `requestChecksumCalculation`/`responseChecksumValidation` `WHEN_REQUIRED` for MinIO), behind the API's `ObjectStorage` interface (in-memory fake in tests). One private bucket `bricomission-media`, created lazily by the API; no anonymous policy. Photos are served only through the API.
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

Built in `homeowner-password-login` (2026-11-13), web sign-in as a Backend-for-Frontend:

- The Next.js server is the confidential OIDC client `bricomission-web` (Authorization Code + PKCE S256, `state`, `nonce`) on `openid-client` 6.9.0 with explicit metadata: the issuer and authorization endpoint use the public Keycloak URL, the token, JWKS and logout endpoints the internal one. The themed Keycloak pages do the password and email code. Rejected: tokens in the browser (Keycloak JS adapter), custom password forms (no email code), iframes.
- Sessions in PostgreSQL, schema `web_session` owned by the web (`pg`, lazy idempotent migration under an advisory lock); the API's Prisma owns `public`. Rejected: internal session endpoints in the API (they widen the surface behind the `/api` proxy, couple sign-in to API uptime and mix browser concerns into the REST API the iOS app will reuse) and tables in the API's Prisma schema (two apps writing one model). Cost: the web container holds database credentials.
- Opaque cookie (`bm_session`, 32 random bytes; the row key is its SHA-256) and AES-256-GCM tokens at rest (`WEB_SESSION_KEY`). Login transactions are stored too (10 min), so a login survives a web restart.
- `/api/*` calls carry the session's access token (refreshed 30 s before expiry, single flight per process); the browser's `Authorization` header is dropped; unsafe methods with the session cookie need a same-origin `Origin`.
- Registration from the app uses `prompt=create` (Keycloak 26.8.2 opens the themed registration page; verified 2026-11-13). Realm `${VAR}` placeholders resolve in any field of the import file (secret, `rootUrl`, `redirectUris`), not only in `credentials`.

Built in `keycloak-login-theme` (2026-11-13):

- Keycloak-hosted pages, themed: custom theme `bricomission` (login + email, `parent=base`) baked into the image from `infra/keycloak/themes/bricomission/`. It overrides the base templates for sign in, create account, error, info and page expired, plus the email-OTP provider's `email-code-form.ftl` and `code-email.ftl` (a theme template wins over the provider's `theme-resources`). Recheck these overrides on every Keycloak or provider upgrade.
- Self-registration with the email code: flow `registration-email-otp` = built-in registration form + `email-authenticator-no-enrollment` (REQUIRED). Default role `user`. SSO idle 8 h.
- i18n: realm internationalization with the 11 MVP locales (default `en`); no language picker; the page language comes from `ui_locales` sent by the client. Theme message files cover every string on the designed pages, so pages do not depend on Keycloak's bundled locales.
- Provider facts used by the theme: wrong code is a field error `invalidAccessCodeMessage`; empty code `missingTotpMessage`; expired code `expiredActionTokenSessionExistsMessage`; 5 wrong codes set `maxAttemptsReached`; resend has a 30 s cooldown reported as a global error (`email-authenticator-resend-cooldown`, shown as info); the code email subject gets only the realm display name (no code); `showMaskedEmailOnOtpForm=true` gives `maskedEmail` (for example `h***r@bricomission.local`).
- Locale precedence (developer decision 2026-11-13, option a): the app language always wins. Keycloak's register page normally stores the page locale on the account, and a stored `locale` beats both `ui_locales` and `kc_locale` on `/auth` (measured). So `register.ftl` sends no `locale` field and Keycloak stores no locale on new accounts; `ui_locales` (the PWA's current language) decides every Keycloak page and the code email. `kc_locale` is unnecessary. The per-account language preference lives in the app (`language-preference-account`), not in Keycloak. Do not set the Keycloak `locale` attribute from the app or the admin console.

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
- VRAM policy (revised 2026-11-14, `simulations-ux-overhaul`, ADR 0005): the multimodal LLM (about 4-4.6 GB resident) plus an IP-Adapter render beside it cost +46 % to +100 % render time at the card limit, so `GpuResidencyHook.beforeImage()` unloads the LLM (llama-server router mode `POST /models/unload`, 0.01 s) before every image job and the next LLM request reloads it (about 7 s). `beforeLlm`/`afterLlm`/`afterImage` are no-ops (an LLM load beside resident ComfyUI models fits at 13.2 GB, which keeps ComfyUI warm). Switching cost is paid once per Simulation (vision describe, then N renders back to back) and once per Budget (inventory, then pricing). The earlier "no unload, hook is a no-op" decision (OQ-9 of `controlnet-render`, text-only LLM, no IP-Adapter) no longer holds. Numbers: `docs/spikes/simulations-gpu-spike.md`.
- Superseded 2026-11-14 by the revised VRAM policy above (historical measurement, not current behaviour): Measured 2026-11-12: serialization is required. The LLM holds about 3.2 GB. ComfyUI holds about 7.4 GB idle-cached and peaks at about 15 GB over the desktop baseline during a render, because it takes whatever VRAM is free. Running both at once did not OOM but cost about 25 % speed on each, so renders run alone and chat requests wait. Unload: ComfyUI `POST /free` (VRAM is released within about 3 s, and the next render adds about 8-11 s of reload). `docker compose stop llama-server` takes 0.6 s, and `up -d --wait` brings it back healthy in about 5.5 s. Today the LLM is unloaded before every render rather than left resident, and chat/LLM jobs still wait in the queue while a render runs.
- Chat requests during a Render wait in the queue with a visible status.

## Budget Computation

See ADR 0002. LLM returns JSON Line Items (schema-constrained output) with source references; the API verifies each cited price against the retrieved chunk text and computes subtotals, tier totals, VAT, penalties, and commission with decimal arithmetic.

Implemented in `budget-tier-computation` (`src/kitchen-projects/budget/`): fixed-category retrieval (8 queries x 5 hits, at most 30 chunks and 12 000 characters, outside the GPU job; embedder down = 503, empty index = 409); **one** `LlmAdapter.complete` with a JSON Schema for all four tiers (at most 5 items per tier, about 1 000 completion tokens, 38-56 s measured with llama-server alone at 25.5 tok/s, inside the 120 s `GPU_BROKER_LLM_TIMEOUT_MS`); every Line Item cites a numbered chunk (`chunkRef`), a SKU and a quoted price that must be printed on a line of that chunk's text, otherwise it is rejected; one retry with feedback when a tier ends without a verified item, then `verification_failed`; all amounts are BigInt integer cents (`budget-math.ts`, half-up). **VAT decision (OQ-1, 2026-11-14):** Catalog retail prices are VAT-inclusive, `BUDGET_VAT_PERCENT` (21) splits each tier total into subtotal and VAT; the Contract PDF VAT stays for a later feature. The synthetic sample Catalog's cover still says "VAT excluded" (it is fake test data; real partner Catalogs decide their own convention).

Changed in `simulations-ux-overhaul` (ADR 0005): a Budget belongs to the selected Simulation (one current Budget per Simulation). A first stage reads every Render image with the vision model (one separate `llm` job each, about 10 s, schema-constrained elements `{category, label, count}`, cached on the Render), code merges them (max count per category) and extends retrieval (8 fixed queries plus one per present category, at most 12). Price bands (terciles per category) are printed as hints. The pricing job runs up to `BUDGET_MAX_ATTEMPTS` (3) attempts; an attempt must verify every tier AND satisfy Luxury > High > Medium > Low on totals (`tier-order.ts`), otherwise it is retried with feedback naming the totals; after the last attempt the tiers are relabelled by total rank (`relabeled`, names only). `GPU_BROKER_LLM_TIMEOUT_MS` is 240000 per broker job. The one-retry statement above is superseded by these three attempts.

## Testing and Verification

- Unit tests for budget math, penalty and commission computation, access rules.
- API integration tests against the Compose stack (Postgres, Keycloak test realm).
- E2E with Playwright on a mobile viewport (390x844): `pnpm test:e2e` runs the specs in `apps/web/e2e/` inside the pinned image `mcr.microsoft.com/playwright:v1.65.0-noble` (compose service `web-e2e`, profile `e2e`) against the running stack; no host browsers (`playwright install-deps` would need sudo and Debian/Ubuntu).
- AI calls behind an interface with deterministic fakes in tests.

## Observability

Structured JSON logs from API (request id, user id, AI call duration, tokens, quota usage). Admin Dashboard shows token and image usage per user and per service [Phase 2]. No external monitoring in MVP; the `diagnostics-dashboard` (2026-11-15, ADR 0006) is the live, local, diagnostic view of module activity and CPU/RAM/VRAM/GPU: an own in-memory event bus over SSE with correlation ids and a read-only metrics agent, no OpenTelemetry, nothing persisted.

## Constraints

- Deadline 2026-11-22; full PRD scope.
- ~14.5 GB free VRAM; 64 GB RAM; RDNA4 (gfx1201) needs ROCm ≥ 6.4 in containers, Vulkan as fallback.
- Linux host, bash scripts only, Docker Compose v2.
- English for code and technical docs.

## Login Gate and claim (`login-gate-claim`)

- Owner key: `kitchen_project.owner_sub` = the Keycloak `sub` of the claiming Account (indexed). There is no local Account table yet; the local profile arrives with `language-preference-account`.
- The claim runs in the web BFF route `POST /api/kitchen-projects/drafts/current/claim` (same-origin Origin required; session token from `web_session`, draft token from the HttpOnly `bm_draft` cookie), which calls the API `POST /kitchen-projects/drafts/current/claim` (Bearer + `X-Draft-Token`) and clears `bm_draft` on 200 and 404. The API locks the draft row (`SELECT ... FOR UPDATE`) so two concurrent claims give exactly one owner.
- Owner routes `/kitchen-projects/:projectId/...` use `OwnedProjectGuard`. The costly routes are real GPU work through the job broker: `POST .../simulations` (one `llm` describe job for uncached references, then one `image` job per Render) and `POST .../budget` for the selected Simulation (one vision `llm` job per Render image for the inventory, then the pricing job with up to 3 attempts). `POST|GET .../renders` (create and list) were removed in `simulations-ux-overhaul`; Renders exist only inside a Simulation (`GET .../renders/:id`, `.../content` and `POST .../renders/:id/retry` remain).


> Update (`simulations-ux-overhaul`): a Render is now created only through a Simulation (one per Photo, shared calculated style: Style Gallery and Moodboard uploads both guide it; ADR 0005). The bullets below about one Render per request, ignored uploads, the per-project cap, the lifecycle POST and the no-unload residency describe the earlier feature and are superseded; ControlNet, geometry, tuning and adapter details still hold.

## Render pipeline (`controlnet-render`)

- Decisions OQ-1..OQ-10 (developer, 2026-11-15; spec `docs/specs/controlnet-render.md`): one Render per request from one Photo (`photoId`, default photo 1); the prompt comes from the dominant Moodboard gallery style (manifest prompt of that style's first Moodboard item, cut before ", interior design photography", plus a fixed geometry suffix); uploads are ignored and an uploads-only Moodboard uses `modern-01`; ControlNet canny by default (`RENDER_CONTROL_MODE=canny|depth`); RealVisXL V5.0, 25 steps, dpmpp_2m karras, cfg 6, Depth Anything V2 Small at 1024.
- Tuning (developer feedback 2026-11-15: no clutter, never turn a cabinet or wall into a door, opening or window). Defaults, all env-configurable: canny thresholds `RENDER_CANNY_LOW/HIGH` 0.6/0.95 (drop texture and fine edges), canny `RENDER_CONTROL_STRENGTH` 0.8 for the first half of the steps (`RENDER_CONTROL_END` 0.5) so late steps can clean surfaces, and a depth ControlNet stacked for the whole run (`RENDER_DEPTH_ASSIST_STRENGTH` 0.7, `RENDER_DEPTH_ASSIST_END` 1; 0 = off) that keeps cabinets as cabinets and walls/windows/doors unchanged. Prompt: the constraints open the positive prompt (`(clean empty countertops:1.3)`, `(nothing on the counters:1.2)`, every cabinet stays a cabinet in the same position, same walls, doors and windows) and the negative lists clutter and structural hallucinations (72 CLIP tokens, one chunk). 19 settings were tried (grid `docs/spikes/assets/controlnet-render-tuning.jpg`): every setting that removed the clutter (canny until <= 0.6 with a blurred depth map, or no depth) also turned the pantry cabinet into a door or a window into glass cabinets on some seeds; the chosen setting keeps the structure on 2 seeds x 2 aspect ratios, but objects whose silhouettes are in both control maps (kettle, dish racks) are restyled, not removed. Removing them needs a mask (segmentation or user-marked) plus inpainting: a follow-up.
- `RENDER_CONTROL_STRENGTH`/`RENDER_CONTROL_END` also apply to `RENDER_CONTROL_MODE=depth` (the spike guided depth for the whole run; set `RENDER_CONTROL_END=1` when switching to depth). `RENDER_CONTROL_END=0` with the depth assist off removes geometry control: never use it. The tuning values are not stored per Render, so changing them later does not reproduce older Renders exactly.
- Geometry: the API picks the SDXL bucket nearest the Photo aspect (>= 1.2: 1216x832, <= 0.83: 832x1216, else 1024x1024), centre-crops the stored `full` Photo with sharp and stores it as `before.jpg`; that JPEG is the ComfyUI input, so the Render aligns with it pixel for pixel and ComfyUI's `ImageScale` is a no-op.
- `ComfyUiImageAdapter` (`AI_ADAPTERS=local`): `POST /upload/image` (`bm-<uuid>.jpg`), `POST /prompt` with a workflow built in TypeScript (`comfyui-workflow.ts`, the spike JSON with `PreviewImage` instead of `SaveImage`, so outputs go to the temp dir), `GET /history/:id` every 250 ms, `GET /view?type=temp`; on abort `POST /interrupt`. Errors carry no URL or body. The adapter never touches MinIO.
- Lifecycle: the POST answers 202 `queued` after the active/limit checks (under the project row lock) and the `before` upload, then submits an exclusive `image` job to the broker; the job sets `running`, renders, re-encodes `full`/`thumb` with sharp (metadata-free) and sets `succeeded`. The web polls `GET .../renders/:id` (first after 0.5 s, then every 2 s; the view carries the queue `position`); the SSE job stream is not used by the web. Restart recovery marks active rows `interrupted`.
- Measured 2026-11-14 with the spike settings (llama-server loaded and idle): landscape cold 20.8 s and warm 9.1/10.3 s; portrait cold 14.3 s and warm 8.6 s. Re-measured 2026-11-15 with the tuned defaults (canny + depth assist, two ControlNets): landscape cold 19.6 s, warm 10.2/10.5 s; portrait (832x1216) cold 17.5 s, warm 10.8 s, POST to terminal status; VRAM peak 16,227 of 16,304 MiB (14.4 GB over the desktop baseline), no OOM. Evidence: `docs/spikes/assets/controlnet-render-compare.jpg` and `controlnet-render-compare-portrait.jpg` (left `before`, right Render).
