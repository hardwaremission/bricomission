# Feature Implementation Spec: API serializes GPU jobs and streams their status

## Source Feature

- `id`: gpu-job-broker
- `area`: ai-infrastructure
- `depends_on`: local-ai-gpu-spike (accepted), api-skeleton (accepted)
- `status`: not_started (at planning time, 2026-11-13)
- `source`: `feature_list.json`

## Goal

Add one in-process GPU job broker to `apps/api`. Every AI call that touches the GPU goes through it. Image jobs run alone, one at a time. LLM (chat) jobs wait while an image job runs or is queued ahead of them. Clients follow a job's `queued -> running -> done|failed` status over SSE. AI backends sit behind adapter interfaces with deterministic fakes, so all automated tests run without a GPU, Docker or network.

## Non-Goals

- Product endpoints that use the broker: Render (`controlnet-render`), Budget/chat (`budget-*`). No Prisma models or migrations, and no MinIO writes.
- Real ComfyUI adapter, workflow handling and image upload (`controlnet-render`). In this feature the image adapter is fake only.
- Auth, ownership checks and quotas (`keycloak-realm-roles`, `login-gate-claim`, `daily-quota-enforcement`). The job record has an optional opaque `ownerRef` for later use.
- DB-backed Platform Settings and admin hot-swap (`admin-service-endpoints`). This feature reads endpoints from env through a swappable provider.
- Stopping/starting `llama-server` or calling ComfyUI `POST /free` from the API (see Technical Approach, VRAM policy).
- Durable or multi-instance queues, retries, priorities, cancellation endpoints, LLM token streaming.
- Any UI (no OpenPencil gate). No new compose service.

## Job Story

When several AI requests reach the API while the single 16 GB GPU is busy,
I want them admitted in arrival order with image jobs running exclusively,
so renders never contend for VRAM, chat waits visibly instead of slowing a render, and clients can show live status.

## Users And Permissions

- No product roles yet. `GET /ai/jobs/:id` and `GET /ai/jobs/:id/events` are public, reachable only on 127.0.0.1, addressed by a random UUID v4. Ownership checks arrive with auth features.
- `POST /ai/jobs` is a debug/test endpoint, mounted only when `GPU_BROKER_DEBUG_ENDPOINTS=true`. Otherwise it returns 404. Default `false` in compose.

## Acceptance Scenarios

### Scenario 1: Two image jobs never overlap
Given the broker uses the fake image adapter
When two image jobs are submitted back to back
Then the second stays `queued` (position 1) until the first finishes, the fake adapter's recorded max concurrent image runs is 1, and they finish in submission order.

### Scenario 2: Chat during an image job is queued, then served
Given an image job is `running`
When an LLM job is submitted
Then it is `queued` with `waitingFor: "image"`, the fake LLM adapter is not called while the image runs, and once the image job is `done` the LLM job runs and finishes `done` with the fake's deterministic text.

### Scenario 3: FIFO admission, no starvation
Given an LLM job is running and an image job is queued behind it
When another LLM job is submitted
Then the new LLM job does not start before the queued image job (head-of-line FIFO). LLM jobs may share the GPU with each other up to `GPU_BROKER_LLM_CONCURRENCY` (default 1), but never with an image job.

### Scenario 4: Failures and timeouts release the GPU
Given a running job whose adapter throws, or exceeds its kind's timeout
When the failure happens
Then the job ends `failed` with an error code (`adapter_error` or `timeout`) and no adapter message or URL, the abort signal passed to the adapter fires on timeout, and the next queued job starts.

### Scenario 5: Bounded queue and retention
Given `GPU_BROKER_MAX_QUEUED` jobs are already queued
When one more is submitted
Then submission is rejected with `GpuQueueFullError` (debug endpoint: 429). Finished jobs stay readable for `GPU_BROKER_RETENTION_MS` (default 1 h), then return 404.

### Scenario 6: SSE emits ordered status events
Given the debug endpoint is enabled
When a client submits a job via `POST /ai/jobs` (202 with the job view) and opens `GET /ai/jobs/:id/events`
Then the response is `text/event-stream` with events in order `queued` (zero or more, with position updates), `running`, then exactly one `done` or `failed`. Each event has a strictly increasing integer `id` (per-job `seq`), an `event:` name equal to the status, and JSON `data` matching `GpuJobEvent`. The stream closes after the terminal event. A client that connects late first receives the replayed history. With `Last-Event-ID: n` only events with `seq > n` are sent. Unknown id -> 404.

### Scenario 7: Gate stays green and offline
Given no Docker, GPU or network
When `pnpm -r lint` and `pnpm -r test` run
Then both exit 0, and `./init.sh` still exits 0 with the core stack (the api boots with `AI_ADAPTERS=fake` and makes no AI calls at startup).

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `feature_list.json` (this feature's verification and notes; `controlnet-render`, `budget-tier-computation`, `admin-service-endpoints` depend on it).
- `ARCHITECTURE.md`: ESM with `.js` import suffixes, one Nest module per feature under `src/<feature>/`, `configureApp`, DTO classes `implement` shared types, Vitest + unplugin-swc, DB-free tests.
- `docs/technical-discovery.md` (GPU Serialization), `docs/spikes/local-ai-gpu-spike.md` (render 8.5 s warm / 17-20 s cold; LLM 3.2 GB VRAM; concurrent run no OOM but -25 %; `/free` and llama stop/start timings), `docs/risks-and-open-questions.md` (queue choice open), `docs/domain-model.md` (chat waits while GPU busy; Platform Settings hold AI endpoints).
- `apps/api/package.json` (no queue/Redis/config deps; `rxjs` present), `src/app.module.ts`, `src/app.setup.ts`, `src/health/*`, `test/health.http.spec.ts`, `vitest.config.ts` (`test/**/*.spec.ts`, `src/**/*.spec.ts`).
- `packages/shared-types/src/index.ts`, `compose.yaml` (api env; `llama-server`/`comfyui` in profile `ai`; fixed-name weight volumes), `.env.example`, `scripts/ai-spike/comfy-run.sh` (ComfyUI API usage, for later).
- Not inspected: NestJS 12 SSE internals beyond the documented `@Sse()` + `Observable<MessageEvent>` API. Verify `id`/`type` fields serialize as expected in the first HTTP test.

### Existing Patterns To Follow

- Feature module folder, Swagger DTO classes, `logger: false` HTTP tests that override providers, error logging by class name only (see `HealthService`).

## Technical Approach

**Queue technology: in-process, in-memory scheduler (decided).** The MVP runs one API instance and one physical GPU. Jobs are short (render 8-20 s, chat seconds) and are tied to a live client waiting on SSE. An in-process scheduler gives exact mutual exclusion with no extra service, no Redis port per worktree, and no migrations, and it works offline. BullMQ + Redis would add a container and give durability/multi-instance support we do not need. A Postgres queue would need the first migration plus polling or LISTEN/NOTIFY for the same result. Trade-off accepted: queued and running jobs are lost on API restart (clients get 404 and retry). Callers depend only on the `GpuJobBroker` interface, so a durable backend can replace it later. Record the decision in `docs/technical-discovery.md` and resolve the risks entry.

**Scheduler rules (`GpuJobBrokerService`).**
- One FIFO queue. Job kinds: `image` (exclusive) and `llm` (shared up to `llmConcurrency`).
- Admission loop runs on submit and on every finish: look at the queue head only. An `image` head starts when nothing is running. An `llm` head starts when no image is running and running LLM jobs < `llmConcurrency`. Loop until the head cannot start. No look-ahead (prevents starvation, Scenario 3).
- `submit<T>(kind, run: (ctx: { signal: AbortSignal }) => Promise<T>, opts?: { ownerRef?: string }): { jobId: string; result: Promise<T> }`. Throws `GpuQueueFullError` when `queued.length >= maxQueued`. `result` rejects with `GpuJobFailedError(code)` on failure. Product features call `submit` and await `result`.
- `get(jobId): GpuJobView | undefined` and `events(jobId, afterSeq?): Observable<GpuJobEvent> | undefined`. Per job, store an ordered event history plus an rxjs `Subject`. Replay history with `seq > afterSeq`, then live events, then complete after the terminal event.
- Emit `queued` on submit (with `position`, `waitingFor`). Emit a new `queued` event only when the position changes. Then `running`, then `done`/`failed`.
- Timeout per kind (`GPU_BROKER_IMAGE_TIMEOUT_MS` default 180000, `GPU_BROKER_LLM_TIMEOUT_MS` default 120000): abort the `AbortController`, mark `failed`/`timeout`, free the slot. A late settle of the run promise is ignored.
- Adapter errors are logged by class name only. The public error is a code.
- Retention: prune finished jobs older than `retentionMs` on each submit and with an `unref()`'d interval. Clear it in `onModuleDestroy`.
- Inject a `Clock`/`now()` and id generator (default `crypto.randomUUID`) so tests are deterministic. Tests drive completion with deferred promises (gates), not sleeps.

**VRAM policy.** Serialization alone meets the measured constraint: LLM idle 3.2 GB + ComfyUI idle cache 7.4 GB coexist, and the overload comes only from simultaneous compute. The broker therefore never runs LLM and image work at the same time, and it does not unload models (avoids the 8-11 s reload). Add a no-op `GpuResidencyHook` with `beforeImage()`/`afterImage()` called around image jobs, so `controlnet-render` can plug in ComfyUI `/free` or LLM stop if real renders prove it necessary.

**Adapters (`src/ai/adapters/`).**
- `LlmAdapter`: `complete(req: { messages: {role:'system'|'user'|'assistant'; content:string}[]; jsonSchema?: object; maxTokens?: number }, signal: AbortSignal): Promise<{ text: string; promptTokens: number; completionTokens: number }>`.
- `ImageAdapter`: `render(req: { mode: 'depth'|'canny'; sourceImageKey: string; prompt: string; seed: number }, signal): Promise<{ imageKey: string; seconds: number }>`.
- Fakes are deterministic. `FakeLlmAdapter` returns `fake:` + sha256 of the JSON request (first 16 hex chars). `FakeImageAdapter` returns `imageKey: fake/<sha256-16>.png`. Both honor `signal` and take an optional `delayMs` or injected gate. They expose `active`, `maxActive` and a `calls` log so tests can assert overlap.
- `LlamaServerLlmAdapter`: `fetch` POST `${baseUrl}/v1/chat/completions` (non-streaming; `response_format: {type:'json_schema', json_schema:{name:'out', strict:true, schema}}` when `jsonSchema` is given), passing `signal`. Map `choices[0].message.content` and `usage`. A non-2xx response throws `AiBackendError(status)` without the body.
- Tokens `LLM_ADAPTER`, `IMAGE_ADAPTER`, `GPU_BROKER_OPTIONS`, `AI_ENDPOINTS` (`src/ai/ai.tokens.ts`). Factory providers read env (no new dependency): `AI_ADAPTERS=fake|local` (default `fake`). With `local`, the LLM uses llama-server and the image adapter stays fake and logs one warning (real one in `controlnet-render`). `AI_ENDPOINTS` provider: `{ llmBaseUrl: LLM_BASE_URL ?? 'http://llama-server:8080', comfyuiBaseUrl: COMFYUI_BASE_URL ?? 'http://comfyui:8188' }`, behind an `AiEndpointsProvider` interface (`get(): AiEndpoints`) that `admin-service-endpoints` will back with Platform Settings.

**HTTP (`src/ai/jobs/gpu-jobs.controller.ts`, tag `ai-jobs`).**
- `GET /ai/jobs/:id` -> 200 `GpuJobView` or 404. Validate UUID with `ParseUUIDPipe` (400 on malformed).
- `GET /ai/jobs/:id/events` (`@Sse`): 404 if unknown (check before returning the Observable). Map each event to `{ id: String(seq), type: status, data: event }`. Read `@Headers('last-event-id')`.
- `POST /ai/jobs` (debug): body `{ kind: 'image'|'llm', prompt?: string }`. Runs the adapter call through the broker, returns 202 `GpuJobView`, 429 on queue full. Mount it with a separate debug controller registered only when `GPU_BROKER_DEBUG_ENDPOINTS === 'true'` at module build time (dynamic module `AiModule.register()` read from env in `AppModule`), so it is absent from OpenAPI when disabled.
- Swagger: DTO classes implement the shared types. Document 200/404 for the GETs and 202/429 for POST.

**Shared types (`packages/shared-types`).** `GpuJobKind = 'image'|'llm'`, `GpuJobStatus = 'queued'|'running'|'done'|'failed'`, `GpuJobErrorCode = 'adapter_error'|'timeout'`, `GpuJobView { id; kind; status; position: number|null; waitingFor: GpuJobKind|null; createdAt; startedAt: string|null; finishedAt: string|null; errorCode: GpuJobErrorCode|null }`, `GpuJobEvent { jobId; seq; status; position: number|null; waitingFor: GpuJobKind|null; at: string; errorCode: GpuJobErrorCode|null }`. ISO-8601 strings. Results are not in the view: product features store and expose their own outputs.

**Compose and env.** No new service. `api.environment` adds `AI_ADAPTERS: ${AI_ADAPTERS:-fake}`, `LLM_BASE_URL: ${LLM_BASE_URL:-http://llama-server:8080}`, `COMFYUI_BASE_URL: ${COMFYUI_BASE_URL:-http://comfyui:8188}`, `GPU_BROKER_DEBUG_ENDPOINTS: ${GPU_BROKER_DEBUG_ENDPOINTS:-false}`, `GPU_BROKER_LLM_CONCURRENCY: ${GPU_BROKER_LLM_CONCURRENCY:-1}`, `GPU_BROKER_MAX_QUEUED: ${GPU_BROKER_MAX_QUEUED:-20}`. Mirror them in `.env.example` with comments. Timeout/retention envs are optional and default in code.

## Expected File Changes

- Create `apps/api/src/ai/`: `ai.module.ts`, `ai.tokens.ts`, `ai-endpoints.provider.ts`, `adapters/{llm-adapter.ts,image-adapter.ts,fake-llm.adapter.ts,fake-image.adapter.ts,llama-server-llm.adapter.ts,ai-backend.error.ts}`, `jobs/{gpu-job-broker.service.ts,gpu-job-broker.errors.ts,gpu-broker.options.ts,gpu-residency.hook.ts,gpu-jobs.controller.ts,gpu-jobs-debug.controller.ts,gpu-jobs.dto.ts}`.
- Modify `apps/api/src/app.module.ts` (import `AiModule.register()`).
- Create tests `apps/api/test/gpu-job-broker.service.spec.ts`, `gpu-jobs.http.spec.ts`, `fake-adapters.spec.ts`, `llama-server-llm.adapter.spec.ts` (local `node:http` stub on port 0).
- Modify `packages/shared-types/src/index.ts`, `compose.yaml` (api env only), `.env.example`.
- Docs: `ARCHITECTURE.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `PROGRESS.md`, `feature_list.json`.
- No new npm dependency expected. If one becomes necessary, pin it exactly and keep the frozen lockfile committed.

## Visual Design Impact

- UI involved: no. API only, so no design artifact and no OpenPencil gate.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Add the `src/ai/` module (broker rules, adapters, tokens, env), the job endpoints and SSE contract, and fakes in the test layering.
- `docs/technical-discovery.md`: update. Queue decision (in-process) with its rationale and the VRAM policy. Replace the "BullMQ on Redis, or PostgreSQL-based" candidate wording.
- `docs/risks-and-open-questions.md`: update. Move "Job queue" to resolved and add the risk "in-memory jobs lost on API restart".
- `AGENTS.md`: update one line in AI Services: the API reaches llama-server only with `AI_ADAPTERS=local`, default `fake`.
- `CONSTRAINTS.md`: not needed (does not exist; rules live in `AGENTS.md`).

## Implementation Plan

1. Shared types, then adapter interfaces + fakes + their unit tests.
2. `GpuJobBrokerService` with options/clock injection. Write the broker unit tests first (Scenarios 1-5).
3. Controllers, DTOs, dynamic `AiModule.register()`, wiring into `AppModule`. HTTP/SSE tests (Scenario 6).
4. `LlamaServerLlmAdapter` + stub-server test.
5. Compose env, `.env.example`, run the gate and the compose checks. Optional GPU smoke.
6. Docs, `PROGRESS.md`, `feature_list.json` (status `passing` with evidence, never `accepted`).

## Implementation Tasks

- [ ] Shared types for job kind/status/view/event.
- [ ] `LlmAdapter`/`ImageAdapter` interfaces, deterministic fakes with overlap tracking.
- [ ] Broker: FIFO head-of-line admission, image exclusive, LLM concurrency, timeouts with abort, codes-only errors, queue cap, retention, ordered per-job events with replay.
- [ ] `GpuResidencyHook` no-op called around image jobs.
- [ ] `GET /ai/jobs/:id`, `GET /ai/jobs/:id/events` (SSE, Last-Event-ID), debug `POST /ai/jobs` behind the env flag.
- [ ] `AiEndpointsProvider` (env-backed), `AI_ADAPTERS` selection, `LlamaServerLlmAdapter`.
- [ ] Tests listed in Verification Plan; compose env; docs.

## Verification Plan

Export before any compose command: `COMPOSE_PROJECT_NAME=gpu-job-broker POSTGRES_PORT=5634 MINIO_API_PORT=9300 MINIO_CONSOLE_PORT=9301 MAILPIT_UI_PORT=8325 MAILPIT_SMTP_PORT=1325 API_PORT=3300 LLAMA_PORT=8380 COMFYUI_PORT=8488`. Use `newgrp docker` if the shell lacks the docker group. No sudo.

- `pnpm install --frozen-lockfile` exit 0, lockfile unchanged. `pnpm -r lint` exit 0.
- `pnpm -r test` exit 0, with named tests at least for:
  - broker: "two image jobs never overlap" (maxActive 1, order), "llm submitted during image is queued with waitingFor image, then served", "queued image blocks later llm (FIFO)", "llm concurrency 2 runs two llm jobs together but never with image", "adapter error -> failed adapter_error, next job starts", "timeout aborts signal -> failed timeout, slot freed, late settle ignored", "queue full throws", "retention evicts finished jobs", "events have strictly increasing seq and end with one terminal event".
  - HTTP: debug POST 404 when flag off; 202 when on; GET job 200/404/400; SSE content-type `text/event-stream`, parsed events `queued..running..done` with increasing ids and stream end; late subscriber gets replay; `Last-Event-ID` skips earlier events; failed job stream ends with `failed`; `/docs-json` has `/ai/jobs/{id}` and `/ai/jobs/{id}/events`.
  - Adapters: fakes deterministic (same input, same output); llama adapter sends `json_schema` and maps usage against the stub; non-2xx throws without leaking the body.
- `grep -rn "setTimeout" apps/api/test/gpu-*` is limited to gate helpers. Tests must not depend on wall-clock sleeps longer than about 50 ms.
- `docker compose config -q`. `docker compose up -d --build --wait` exit 0 (4 healthy). `curl -s http://127.0.0.1:3300/health` shows `database: up`. `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3300/ai/jobs` gives `404` (flag off).
- Compose SSE check: `GPU_BROKER_DEBUG_ENDPOINTS=true docker compose up -d --wait api`. Then POST `{"kind":"image"}` twice and `{"kind":"llm"}` once, and run `curl -sN http://127.0.0.1:3300/ai/jobs/<id>/events` on the llm job. Expect `queued` (waitingFor image), `running`, `done`, and the stream to end. Then restore the flag (`docker compose up -d --wait api` without it).
- `./init.sh` exit 0.
- Optional real-LLM smoke (not required for acceptance). Run the whole block under `flock /tmp/bricomission-gpu.lock bash -c '...'`: `docker compose --profile ai up -d --wait llama-server`; api with `AI_ADAPTERS=local GPU_BROKER_DEBUG_ENDPOINTS=true`; POST `{"kind":"llm","prompt":"Say OK"}` -> `done`; then `docker compose stop llama-server` and restore the api env. Never remove or re-download `bricomission_*` volumes. Do not start comfyui (no real image adapter yet).
- E2E: no persistent E2E harness exists (Playwright arrives with `web-pwa-shell`). The supertest SSE tests plus the curl check cover this API flow.

## Evidence To Capture

- Test names with pass counts. Lint/test exit codes. Lockfile unchanged.
- The curl SSE transcript (event lines) for the llm-behind-image case. 404 on POST with the flag off.
- `./init.sh` tail and exit code. Optional smoke output, or "not run".
- Record in `feature_list.json` evidence and a `PROGRESS.md` session entry.

## Validator Checklist

- [ ] Scope: no Prisma models/migrations, no real ComfyUI adapter, no auth/quota, no UI, no new compose service, no Redis.
- [ ] Image jobs exclusive; LLM never co-runs with an image; FIFO head-of-line admission; queue cap; timeouts abort and free the slot.
- [ ] Errors exposed as codes only. No adapter messages, URLs or bodies in responses or logs beyond the class name.
- [ ] SSE: ordered, strictly increasing ids, one terminal event, stream closes, replay and Last-Event-ID work, 404 for unknown ids.
- [ ] Debug POST absent (404 and not in OpenAPI) unless `GPU_BROKER_DEBUG_ENDPOINTS=true`; compose default `false`.
- [ ] Adapters behind interfaces/tokens; fakes deterministic; `AI_ADAPTERS` default `fake`; endpoints from an `AiEndpointsProvider` (env defaults = compose service URLs).
- [ ] `pnpm -r test` needs no Docker/GPU/network; `./init.sh` exit 0; any GPU smoke ran under `flock` and left GPU services stopped.
- [ ] Docs updated as listed; `feature_list.json` status `passing`, not `accepted`.
