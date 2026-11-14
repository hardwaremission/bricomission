# Feature Implementation Spec: Homeowner gets a photorealistic Render that keeps the room geometry

## Source Feature

- `id`: controlnet-render
- `area`: ai-visuals
- `depends_on`: gpu-job-broker (accepted), login-gate-claim (accepted, merged `1ecff60`)
- `status`: not_started at planning time (2026-11-14); set to `in_progress` by the planner
- `source`: `feature_list.json`; branch `feature/controlnet-render`
- Feature notes: UI gate "AI Results" screen (render part only; chat arrives with `budget-chat-personas`). Quota checks are added later by `daily-quota-enforcement`.

## Goal

A Homeowner who owns a ready, claimed Kitchen Project presses "Generate my kitchen". The API takes one project Photo and the Moodboard. It builds a prompt and runs SDXL (RealVisXL V5.0) + ControlNet in ComfyUI through the GPU job broker, as an exclusive image job. It stores the result as a metadata-free JPEG in MinIO. The web shows queue and progress states, then the Render with a before/after slider over the exact source crop. `POST /kitchen-projects/:projectId/renders` stops answering 501. It keeps its path, its guards and the 409 `project_incomplete` rule.

## Non-Goals

- Budget (the `POST .../budget` 501 placeholder stays), chat, Personas, quotas, usage counters.
- IP-Adapter or any new model download, ComfyUI image changes, or new compose services (see OQ-2).
- Deleting or editing Renders, editing claimed projects, a "My Kitchen Projects" list, Dossier snapshots.
- Durable GPU queue, cancellation endpoint, admin endpoint hot-swap (`admin-service-endpoints`), cloud image fallback.
- Changes to the broker scheduling rules (only the residency hook may be wired, OQ-9).

## Decisions (the developer accepted every recommended option, OQ-1..OQ-10, on 2026-11-15)

1. **Source photo (OQ-1):** one Render per request, from one Photo. Body `{ photoId?: uuid }`; if absent, the Photo at position 0. The results screen offers a photo picker when the project has more than one Photo.
2. **Moodboard to prompt (OQ-2, OQ-3):** pure function `buildRenderPrompt(moodboard, gallery)`:
   - Dominant style = the `styleId` that occurs most among gallery items (tie: lowest position).
   - Style text = the internal manifest `prompt` of that style's first gallery item, without the shared suffix that starts at ", interior design photography".
   - Positive = `"photorealistic renovated " + styleText + ", same room layout, same windows and doors, interior design photography, natural daylight, sharp focus, high detail"`. Negative = the spike negative.
   - Upload items do not change the prompt (no IP-Adapter weights exist in the `ai-fetch` volumes). An uploads-only Moodboard uses the `modern-01` text and `styleId: null`.
   - `StyleGalleryService` keeps `prompt` internally (`promptFor(id)`). It is never returned by any route.
3. **ControlNet (OQ-4):** `canny` by default. The spike's canny run kept both windows, the sink and the counter runs; depth turned a window into a cabinet. Env `RENDER_CONTROL_MODE=canny|depth` (default canny). Both preprocessors work offline: the core `Canny` node needs no weights, and Depth Anything V2 Small is in `bricomission_comfyui-annotators` (`HF_HUB_OFFLINE=1`). Spike parameters: 25 steps, `dpmpp_2m` karras, cfg 6, strength 0.8, canny 0.2/0.5, depth resolution 1024.
4. **Size and alignment (OQ-5):** pick the SDXL bucket nearest the Photo aspect. Ratio >= 1.2 gives 1216x832, <= 0.83 gives 832x1216, otherwise 1024x1024. The API center-crops and resizes the stored `full` Photo with sharp to that size. That JPEG is the **before** image (stored) and the ComfyUI input. The Render has the same size, so the slider aligns pixel to pixel. ComfyUI's `ImageScale` is a no-op at that size.
5. **Lifecycle (OQ-6):** the POST answers 202 with the Render `queued`. Status values are `queued -> running -> succeeded | failed`, persisted in the DB. The web polls `GET .../renders/:renderId` every 2 s (the view carries the queue `position` and `waitingFor` from `broker.get`) and stops on a terminal status. The existing SSE `/ai/jobs/:id/events` stays as is and is not used by the web.
6. **Count (OQ-7):** every POST creates a new Render with a random seed (`crypto.randomInt(0, 2**31)`), and the history is kept, newest first. Rules:
   - One active (`queued`/`running`) Render per project: 409 `render_in_progress`.
   - At most `RENDER_MAX_PER_PROJECT` (default 10) non-failed Renders: 409 `render_limit_reached`. Failed Renders do not count.
7. **Where (OQ-8):** new page `/kitchen-projects/<id>/results` (AI Results, render section). On the owned page "Generate my kitchen" is enabled and links there; it reads "See my kitchen" once a Render exists (design decides the wording). On the Generate step with `intent=render`, the claim redirects to `/kitchen-projects/<id>/results?claimed=1&start=1`, and the page starts one Render automatically. The page strips `start` with `replaceState`, and the server's `render_in_progress` rule prevents a double start. "Get my budget" stays disabled with "Available soon".
8. **GPU residency (OQ-9):** `GpuResidencyHook` stays a no-op. The real-GPU run is measured with `llama-server` loaded and idle. If it shows OOM, a ComfyUI error or more than a 25 % slowdown, wire `POST /free` in `afterImage()` behind `COMFYUI_FREE_AFTER_RENDER=true` and record the result.
9. **Restart:** jobs live in memory. On API start, `RenderRecoveryService` marks every `queued`/`running` row `failed` with code `interrupted` (the API is a single instance).

## Job Story

When my kitchen and my style are saved, I want to press one button and see my own room renovated, with the windows, doors and plumbing where they really are, and slide between before and after, so I can judge the result before I pay for anything.

## Users And Permissions

- Homeowner (`user`) owner: create, list and read Renders and their content on own claimed projects.
- Other Homeowners: 404. Professional and Admin: 403. Anonymous: 401. Draft ids: 404 (same `OwnedProjectGuard`).
- Every Render route lives in `KitchenProjectsController` (class `@Roles('user')`, no `@Public()`) or in a new controller with the same decorators.

## API Contract

- `POST /kitchen-projects/:projectId/renders` body `{ photoId?: uuid }`. Check order:
  - 401, 403, then 400 for a malformed id, then 404 for a project that is not owned.
  - 409 `project_incomplete`, then 400 `render_photo_unknown` for a malformed or foreign `photoId`.
  - 409 `render_in_progress`, then 409 `render_limit_reached`.
  - 429 `gpu_queue_full` (broker `GpuQueueFullError`; the row and the before object are removed). 503 `storage_unavailable` or database down.
  - Success: **202** `{ render: RenderView }`.
- `GET /kitchen-projects/:projectId/renders`: 200 `{ renders: RenderView[] }`, newest first.
- `GET /kitchen-projects/:projectId/renders/:renderId`: 200 `RenderView`. 400 for a malformed id, 404 for an unknown Render or one from another project.
- `GET /kitchen-projects/:projectId/renders/:renderId/content?variant=before|full|thumb`: 200 `image/jpeg` with `private, max-age=3600`. 400 for a bad variant. 404 when the variant does not exist yet (`full`/`thumb` before success). 503 `storage_unavailable`.
- `RenderView` = `{ id, status, photoId, styleId: string|null, mode, width, height, position: number|null, waitingFor: GpuJobKind|null, errorCode: RenderErrorCode|null, createdAt, startedAt|null, finishedAt|null, beforeUrl, fullUrl|null, thumbUrl|null }`. `fullUrl`/`thumbUrl` are non-null only when `succeeded`. Seed, prompt and job id are internal.
- Shared types: `RenderStatus`, `RenderMode`, `RenderView`, `RenderListResponse`, `CreateRenderResponse`, `RenderErrorCode` = `adapter_error | timeout | interrupted | storage_unavailable`. New `KitchenProjectErrorCode` values: `render_photo_unknown`, `render_in_progress`, `render_limit_reached`, `gpu_queue_full`. Regenerate OpenAPI and `api-client`.

## Acceptance Scenarios

### Scenario 1: Render with the fake adapter (API)
Given an owned, ready project and `AI_ADAPTERS=fake`, when the owner POSTs, then:
- The answer is 202 `queued`. The GET later shows `running`, then `succeeded`.
- MinIO holds `kitchen-projects/<pid>/renders/<rid>/{before,full,thumb}.jpg`. They are JPEGs with no EXIF/XMP/ICC text and no PNG text chunks. `before` and `full` have identical dimensions.
- The three content variants return 200.

### Scenario 2: Ownership and guards
- Every Render route: anonymous 401, Professional 403, another Homeowner 404, a draft id 404.
- A not-ready project gets 409 `project_incomplete`, and the broker is never called.
- A foreign `photoId` gets 400. A second POST while one is active gets 409 `render_in_progress`. The 11th non-failed Render gets 409 `render_limit_reached`.

### Scenario 3: Failures
- An adapter error gives `failed` / `adapter_error`, and a broker timeout gives `failed` / `timeout`. No `full`/`thumb` objects are left and the next POST is accepted.
- MinIO down at POST gives 503 and no row.
- After an API restart with an active row, the row is `failed` / `interrupted`.

### Scenario 4: AI Results screen (fake adapter, E2E)
Path: sign in, claim with `intent=render`, land on `/results`. Then:
- The queued/running state is designed and shows "Waiting for the GPU" when `position` is set. The succeeded state shows the before/after slider.
- The slider handle moves by drag and by keyboard (arrow keys, `role="slider"` or a range input with `aria-valuenow`).
- "Generate again" creates a second Render. The history shows both.
- A project with 2 photos shows the picker, and a POST with the second `photoId` uses that photo.
- Layout: 390x844 (en, es) and 360x780 (de, fi). No horizontal overflow, targets >= 44 px, one primary CTA.

### Scenario 5: Real GPU (feature verification)
Setup: `AI_ADAPTERS=local`, profile `ai` up (llama-server idle and loaded), and `infra/ai/samples/kitchen-sample.jpg` in a claimed project with 1 gallery item. Then:
- A cold Render (after `POST /free`) reaches `succeeded` in <= 35 s, POST to terminal status.
- Two warm Renders take <= 20 s each. The spike measured 17-20 s cold and 8.5-9 s warm; the margin covers storage and encoding.
- A side-by-side before/after image shows the window, door, sink/tap and counter positions unchanged. A human records the check.

### Scenario 6: Gates
`pnpm -r lint`, `pnpm -r test` (OpenAPI drift), `./init.sh`, `pnpm test:e2e` and `./scripts/keycloak-smoke.sh` all pass. `pnpm -r test` needs no GPU, Docker or network.

## Repository Research

### Files Inspected
- `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `feature_list.json`, `CONTEXT.md`, `docs/domain-model.md`, `docs/technical-discovery.md` (GPU Serialization, Login Gate), `docs/risks-and-open-questions.md`, `ARCHITECTURE.md` (grep), PRD §3 lines 296-347 (grep), `docs/spikes/local-ai-gpu-spike.md`.
- Specs: `gpu-job-broker`, `login-gate-claim`, `moodboard-selection` (first 80 lines).
- API: `src/ai/{ai.module,ai-endpoints.provider}.ts`, `src/ai/adapters/{image-adapter,fake-image.adapter}.ts`, `src/ai/jobs/{gpu-job-broker.service,gpu-residency.hook,gpu-jobs.controller}.ts`, `src/kitchen-projects/{kitchen-projects.controller,kitchen-projects.service,kitchen-projects.module,kitchen-drafts.repository}.ts`, `src/storage/object-storage.ts`, `src/style-gallery/style-gallery.service.ts`, `prisma/schema.prisma`, and the `manifest.json` entries (`prompt`, `seed`).
- Infra: `compose.yaml` (api env, `comfyui`, `ai-fetch`), `infra/ai/fetch-models.sh` (only RealVisXL, controlnet depth/canny and Depth Anything: **no IP-Adapter or CLIP-vision weights**), `infra/comfyui/workflows/sdxl-controlnet-{depth,canny}.json`, `scripts/ai-spike/comfy-run.sh`.
- Web: `src/lib/api-proxy.ts` (streams bodies; forwards `last-event-id`), `src/components/generate/OwnedProjectScreen.tsx`.
- Not inspected: `photo-processor.ts`, `owned-project.guard.ts`, `GenerateScreen.tsx`, `test/support/*`, `infra/comfyui/Dockerfile`, `DESIGN.md` in full, `docs/design/login-gate-claim.md`.

### Patterns To Follow
Use these existing patterns:
- Thin controllers and a repository interface with an in-memory test repo; injected clock.
- Hand-edited `prisma migrate diff` migrations with hand-written CHECKs. Keep the catalog HNSW index.
- Logs carry error class names only.
- Two-phase object writes, like photos.
- `processPhoto`-style sharp re-encoding (sharp writes no metadata by default).
- The OpenAPI regeneration loop, 11 message files, and E2E specs that import `test` from `e2e/fixtures.ts`.

## Technical Approach

- **Prisma:** new enums `kitchen_render_status` (`queued`, `running`, `succeeded`, `failed`) and `kitchen_render_mode` (`canny`, `depth`). New table `kitchen_render` with these columns:
  - `id`, `kitchen_project_id` (FK cascade), `photo_id` (FK to `kitchen_photo`, ON DELETE SET NULL), `status`, `mode`, `style_id` (nullable).
  - `prompt` text (internal provenance), `seed` int, `width`, `height`.
  - `before_key`, `full_key`, `thumb_key`, `error_code`, `gpu_job_id` uuid.
  - `created_at`, `started_at`, `finished_at`, `seconds` real.
  - Index `(kitchen_project_id, created_at)`.
  - CHECKs: `succeeded` means `full_key`/`thumb_key`/`finished_at` NOT NULL; `failed` means `error_code` NOT NULL; `error_code` is in the code list.
  - One migration, `2026111600xxxx_controlnet_render`.
- **Adapter contract (`src/ai/adapters/image-adapter.ts`, changed; only fakes and tests use it today):** `render({ mode, image: Buffer /* JPEG, exactly width x height */, width, height, prompt, negativePrompt, seed }, signal) -> { image: Buffer /* PNG or JPEG */, seconds }`. Storage stays in the service; adapters never touch MinIO.
- **`ComfyUiImageAdapter`** (`src/ai/adapters/comfyui-image.adapter.ts`), using `fetch` with `endpoints.get().comfyuiBaseUrl` read per request:
  - Upload with multipart `POST /upload/image`. The filename is `bm-<random uuid>.jpg`, with no project or user data.
  - Build the workflow with `buildRenderWorkflow(params)` (`src/ai/adapters/comfyui-workflow.ts`, a TS port of the spike JSON). `SaveImage` is replaced by `PreviewImage`, so outputs go to ComfyUI's temp dir and not to the `comfyui-output` volume.
  - `POST /prompt` with a `client_id`, then poll `GET /history/:id` every 250 ms (honor `signal`), then `GET /view?type=temp`.
  - On abort: `POST /interrupt` (best effort). Non-2xx or an execution error throws `AiBackendError` without the body.
- **Fake:** `FakeImageAdapter` returns a deterministic transform of the input: sharp `.tint({ r: 41, g: 104, b: 236 })` plus a 24 px border, PNG. The before/after difference is visible in E2E. It keeps `calls`, `active`/`maxActive`, `delayMs` and gates.
- **`AiModule`:** `AI_ADAPTERS=local` now selects `ComfyUiImageAdapter` (remove the warning). Fake delay unchanged (3000 ms in the running API).
- **Render service** (`src/kitchen-projects/renders/`: `renders.controller.ts` or extra routes in the existing controller, `renders.service.ts`, `render.repository.ts`, `render-prompt.ts`, `render-geometry.ts`, `render-recovery.service.ts`, `renders.dto.ts`). The POST runs these steps outside the GPU slot:
  1. Readiness check.
  2. Photo pick.
  3. Active and limit check, under a project row lock (`SELECT ... FOR UPDATE`) in the same transaction that inserts the `queued` row.
  4. Read the Photo `full` from storage, crop with sharp to `before.jpg` (q90), and put it.
  5. `broker.submit('image', run, { ownerRef: sub })` and store `gpu_job_id`.
  6. Return 202.

  The `run` function:
  1. Set the row to `running` with `started_at`.
  2. Call `adapter.render(...)`.
  3. Use sharp to make `full.jpg` (q88) and `thumb.jpg` (longest edge 512, q80), then put both.
  4. Set the row to `succeeded` with `seconds`.

  On `result` rejection, set `failed` with the code (`timeout`/`adapter_error` from `GpuJobFailedError`; storage errors in `run` give `storage_unavailable`) and delete any written `full`/`thumb`. Queue full: delete the row and `before`, then answer 429.
- **The 501 placeholder is replaced:**
  - `requestRender` gets `@HttpCode(202)`, body DTO and Swagger responses for 202/400/409/429/503. It keeps `Owned()` and the `project_incomplete` check first.
  - `Costly()` stays only for budget.
  - `requestCostlyAction` keeps the `'budget'` path.
  - Update the HTTP tests and E2E that asserted 501 for renders.
- **Env** (compose `api` and `.env.example`): `RENDER_CONTROL_MODE=canny`, `RENDER_MAX_PER_PROJECT=10`. Optional `COMFYUI_FREE_AFTER_RENDER=false` only if OQ-9 triggers it. The broker image timeout stays at 180 s.
- **Web:**
  - `src/app/kitchen-projects/[projectId]/results/page.tsx` (dynamic, uuid else 404; identical HTML).
  - `src/components/results/{ResultsScreen,BeforeAfterSlider,RenderStatusCard,RenderHistory,PhotoPicker}.tsx` (names follow the design).
  - `src/lib/renders/{render-client,render-state}.ts` (pure reducer and poll loop with an injected timer).
  - `OwnedProjectScreen` Render CTA enabled. `GenerateScreen` redirect for `intent=render`.
  - Namespace `results` in 11 message files (10 agent-translated).
  - Test ids: `results-start`, `results-status`, `results-position`, `results-slider`, `results-again`, `results-failed`, `results-retry`, `results-photo-<n>`, `results-history`.
  - Images load through `/api/kitchen-projects/.../content` (same origin; the proxy adds the token).
- **init.sh Web step:** add API `GET /kitchen-projects/00000000-0000-4000-8000-000000000000/renders` without a token: 401. Keep the POST line.
- **Script:** `scripts/ai/render-smoke.sh` (bash, `flock /tmp/bricomission-gpu.lock`). It creates a draft through the API, uploads the sample photo, sets measurements, adds `modern-01`, claims with a password-grant token of `bm-homeowner` (as `keycloak-smoke.sh` does), POSTs Renders (cold after `POST /free`, then 2 warm), and prints timings. It downloads `before`/`full` and writes a side-by-side JPEG with ffmpeg to `docs/spikes/assets/controlnet-render-compare.jpg`. It never prints tokens.

## Expected File Changes

- Create:
  - API files above, the migration, and `apps/api/test/renders/{renders.http,render-prompt,render-geometry,comfyui-image.adapter,render-recovery}.spec.ts` (the adapter is tested against a `node:http` stub).
  - Web files above, `apps/web/test/{render-state,render-client}.test.ts`, `apps/web/e2e/results.spec.ts`.
  - `scripts/ai/render-smoke.sh`.
- Modify:
  - API: `image-adapter.ts`, `fake-image.adapter.ts`, `ai.module.ts`, `fake-adapters.spec.ts`, `kitchen-projects.{controller,service,module}.ts`, `style-gallery.service.ts` (internal prompt), `prisma/schema.prisma`, `test/support/memory-*`, `migration.spec.ts`, the login-gate HTTP tests (501 to 202).
  - Shared: `packages/shared-types`, `packages/api-client/{openapi.json,src/schema.ts}`.
  - Web: `OwnedProjectScreen.tsx`, `GenerateScreen.tsx`, the 11 message files, `e2e/login-gate.spec.ts`.
  - Infra: `compose.yaml` (api env), `.env.example`, `init.sh`.
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

UI involved: yes. Before any UI code, the orchestrator asks the developer to open `design/openpencil/bricomission_B2C_app.fig` in OpenPencil and waits for confirmation that the `open-pencil` MCP is connected. The new page is **AI Results** (render section; leave room for the later chat). The read-back goes to `docs/design/controlnet-render.md` with "approved by developer on <date>", and exports to `design/openpencil/controlnet-render/`. Missing artifact: UI tasks are `blocked`; API, adapter and smoke work may start.

Brief (English only, 390x844, DESIGN.md tokens, one primary CTA, reuse the owned-project header, alerts and bottom bar):
1. Queued: "Waiting for the GPU", with the position when known.
2. Running: indeterminate progress with "about 10-30 s".
3. Succeeded: the before/after slider (the DESIGN.md component), with labels "Before"/"After" and a visible handle.
4. Primary "Generate again", secondary "Back to my kitchen".
5. History strip of earlier Renders, and the photo picker (2+ photos).
6. Failed (Retry), interrupted, limit reached, offline.
7. The owned page CTA change.
8. Checks at 360x780 in de and fi.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Render routes and `RenderView`, the renders module, the ComfyUI adapter and workflow builder, storage keys, recovery, tests, the results page.
- `AGENTS.md`: update "AI Services": `AI_ADAPTERS=local` now renders through ComfyUI, plus `scripts/ai/render-smoke.sh` and `RENDER_CONTROL_MODE`. Update "Kitchen Drafts": Render keys.
- `docs/domain-model.md`: update. Render entity, its lifecycle and count rules, before/after crop, storage.
- `CONTEXT.md`: update Render (one Photo plus the dominant Moodboard style; before image).
- `docs/technical-discovery.md`: update. Render pipeline decisions (canny, buckets, prompt rule, polling, PreviewImage, recovery, residency result).
- `docs/user-and-access-model.md`: update. Renders are owner-only.
- `docs/risks-and-open-questions.md`: add these entries:
  - Uploaded references do not influence the Render yet.
  - Uploaded inputs remain in the ComfyUI container's `input/` dir until it is recreated (random names, local only).
  - Renders lost from the queue on restart are marked `interrupted`.
  - Fake renders in E2E do not prove quality.
- `DESIGN.md`: update the assets and non-token values from the read-back. `CONSTRAINTS.md`: not needed (it does not exist).

## Implementation Tasks

- [ ] The developer answers the open questions. The design read-back is approved (UI tasks are blocked until then).
- [ ] Shared types. Migration, schema, repository and memory repo. `render-geometry.ts` and `render-prompt.ts` with unit tests.
- [ ] Image adapter contract, fake transform, `buildRenderWorkflow`, `ComfyUiImageAdapter` with stub tests, `AiModule` selection.
- [ ] Render service, routes (replacing the 501), recovery, HTTP tests (Scenarios 1-3). `openapi:export`.
- [ ] Web results page, slider, polling, CTA and redirect changes, messages, `e2e/results.spec.ts`. Update the login-gate E2E.
- [ ] `init.sh` line, env, `render-smoke.sh`, the real-GPU run (Scenario 5), docs, evidence. Status `passing`.

## Verification Plan

Use the orchestrator's env (`COMPOSE_PROJECT_NAME`, ports). No sudo, never read `.env`, never remove or re-download `bricomission_*` volumes.

- Workspace gate: `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`. Required named tests:
  - Scenarios 1-3, including the guard order and that the broker is never called on 409.
  - Prompt: dominant style, tie, uploads-only, suffix stripped, no prompt or seed in any response.
  - Bucket choice and boundaries.
  - Metadata-free output (sharp `metadata()` has no `exif`/`icc`/`xmp`).
  - Adapter: workflow fields, upload name, interrupt on abort, no body leak.
  - Recovery. Migration SQL (CHECKs, HNSW intact).
- OpenAPI: `pnpm --filter @bricomission/api openapi:export`. The diff is additive, apart from the renders POST responses (501 becomes 202).
- Stack: `docker compose up -d --build --wait` (6 healthy).
- curl with real tokens: owner POST 202, then poll to `succeeded`; other Homeowner 404; Professional 403; anonymous 401; second active 409; content variants 200.
- MinIO listing of the three keys. psql: `\d kitchen_render`, the row values, the HNSW index.
- Restart check: `docker compose restart api` during an active fake Render gives `interrupted`.
- E2E: `pnpm test:e2e` with the new `results.spec.ts` (fake adapter) and every existing spec green.
- Real GPU (Scenario 5): under `flock`, run `docker compose --profile ai up -d --wait`, then the api with `AI_ADAPTERS=local`, then `bash scripts/ai/render-smoke.sh`. Also record VRAM with `scripts/ai-spike/vram-sample.sh`. Afterwards, stop it with `docker compose --profile ai stop llama-server comfyui` and restore the api env.
- Then `./init.sh` exit 0 and `./scripts/keycloak-smoke.sh` exit 0.

## Evidence To Capture

- Test names and counts, the OpenAPI diff summary, curl statuses (never tokens), MinIO and psql output, the E2E list, the `./init.sh` tail.
- Real-GPU timings (cold and warm), the VRAM peak with llama-server idle, the comparison image path, and the visual geometry check.
- The design artifact path and its approval date. Deviations go in this spec's Implementation Notes.

## Validator Checklist

- [ ] The renders POST keeps its path, `OwnedProjectGuard`, `@Roles('user')`, no `@Public()`, and 409 `project_incomplete` before any GPU work. Budget is still 501.
- [ ] Every GPU call goes through `broker.submit('image', ...)`. The adapter never touches MinIO. No prompt, seed, job id, ComfyUI URL or backend body reaches responses or logs.
- [ ] Stored images are metadata-free JPEGs, and `before` and `full` have the same size. Keys match the spec. Owner-only content routes.
- [ ] Fake adapter by default, so tests need no GPU. `AI_ADAPTERS=local` uses ComfyUI. The real run is within budget, with geometry evidence.
- [ ] UI matches `docs/design/controlnet-render.md`. Slider accessible. 11 locales. One primary CTA.
- [ ] Docs updated, gates pass, status `passing` (not `accepted`).

## Risks

- ComfyUI history polling vs websocket: polling is simpler; 250 ms adds less than 0.25 s.
- Portrait phone photos: an 832x1216 render has the same pixel count, but it was not measured in the spike; measure it in Scenario 5 if possible.
- Canny keeps the old door fronts and clutter edges. If the restyle looks too literal, try depth or a lower strength (0.6), and record the result.
- Next.js proxy buffering is irrelevant for polling. It matters only if OQ-6 picks SSE.
- Scope is large (API + adapter + UI). If the UI design stalls, the API and real-GPU parts can still be validated first.

## Open Questions For The Developer (recommended default first)

**Developer answers (2026-11-15):** OQ-1..OQ-10 all answered with the recommended option (user-picked photo, default first; dominant gallery style prompt, uploads ignored; uploads-only Moodboard renders with neutral `modern-01` plus a note; canny with `RENDER_CONTROL_MODE` switch; closest SDXL bucket with centre crop as the before image; 2 s polling with queue position; history, new seed each time, one active, max 10 non-failed; new `/kitchen-projects/<id>/results` page with automatic start after the Generate claim; residency hook empty, measure first, add `/free` only on OOM/slowdown; deleting Renders out of scope). No open questions remain.


1. **OQ-1 Which photo.** Recommended: one Render per request, from a photo the Homeowner picks (default: first photo). Alternatives: (a) always the first photo, no picker; (b) one request renders every photo (N x 9-20 s of GPU per click).
2. **OQ-2 Moodboard to prompt.** Recommended: the dominant gallery style, using that style's first gallery item manifest prompt (boilerplate stripped) plus a fixed geometry/photo suffix. Uploads are ignored, because the `ai-fetch` volumes have no IP-Adapter or CLIP-vision weights and `ComfyUI_IPAdapter_plus` is not installed. Alternatives:
   - (a) Add IP-Adapter for uploads: one-time network download of about 3.5 GB (CLIP ViT-H image encoder plus `ip-adapter-plus_sdxl_vit-h`), a pinned custom node and a ComfyUI image rebuild, plus more VRAM and seconds per Render. Better as its own follow-up feature.
   - (b) A hand-written short style phrase per style id.
   - (c) The LLM writes the prompt (a GPU-serialized LLM job before each Render, plus seconds).
3. **OQ-3 Uploads-only Moodboard.** Recommended: render with the neutral `modern-01` style. The results screen shows a note that own references guide future versions. Alternatives: 409 asking for at least one gallery pick; or IP-Adapter (OQ-2a).
4. **OQ-4 ControlNet type.** Recommended: canny (the spike kept every window, door and the sink), with env `RENDER_CONTROL_MODE` for depth. Alternatives: depth (freer restyle, but it lost a window in the spike); depth and canny stacked (both models are downloaded; time and VRAM are unmeasured).
5. **OQ-5 Aspect ratio.** Recommended: the nearest SDXL bucket (1216x832, 832x1216, 1024x1024) with a stored center-cropped "before". Alternative: always 1216x832 (portrait photos lose a lot).
6. **OQ-6 Status transport.** Recommended: poll `GET .../renders/:id` every 2 s (queue position included). Alternative: SSE `/api/ai/jobs/:jobId/events` through the web proxy (live, but the job id would be exposed and proxy streaming is untested).
7. **OQ-7 Renders per project.** Recommended: keep the history, a new seed per request, 1 active per project, at most 10 non-failed. Alternatives: (a) one Render per photo, replaced on regenerate; (b) no cap until `daily-quota-enforcement`.
8. **OQ-8 Where results live.** Recommended: a new `/kitchen-projects/<id>/results` page. Claim with `intent=render` lands there and starts the Render automatically. Alternatives: (a) results inline on the owned project page; (b) no auto-start (the Homeowner presses Generate again after sign-in).
9. **OQ-9 VRAM residency.** Recommended: keep the no-op hook and measure with llama-server idle. Add ComfyUI `/free` after each Render only if the run shows OOM or slowdown. Alternatives: always `/free` (+8-11 s on the next Render); stop llama-server around Renders (+5.5 s to restart).
10. **OQ-10 Render removal.** Recommended: out of scope (no delete). Alternative: `DELETE .../renders/:id` now (objects first, as for photos).

## Implementation Notes (implementer, 2026-11-14)

Status: implemented and self-verified (`passing`); independent validation pending. The visual geometry check still needs the developer's eye (see Real GPU below).

Deviations and interpretations (all small, recorded here instead of silently changing the contract):

1. `RenderListResponse` has an extra `maxRenders` field (additive) so the history counter `{count} of {max}` and the limit hint follow `RENDER_MAX_PER_PROJECT`.
2. Style text: the manifest prompt of the dominant style's **first Moodboard item** (lowest position), so the Homeowner's own pick drives the text; uploads-only uses `modern-01`.
3. Polling: the first poll runs 0.5 s after the POST (its 202 always says `queued`, even when the GPU was free), then every 2 s.
4. `?claimed=1` is stripped together with `start` on `/results`; the results design has no "saved" alert.
5. Owned page: with no succeeded Render, "Generate my kitchen" links to `/results?start=1` (auto-start, the server's one-active rule prevents doubles); with 1+ succeeded Render it reads "See my designs" and links to `/results`.
6. Undesigned fallback "empty" phase (no Render yet, e.g. the auto-start answered 429): the selected photo, title "Designing your kitchen", helper "{style} style, from photo {n}." and the primary "Generate my kitchen". New key `results.helperIdle` (also used for the failed phase).
7. Failed Renders are not in the history strip (they have no thumb); the counter counts non-failed Renders. The queued "jobs ahead" line uses the broker `position` (position 1 = the running job ahead).
8. `AiModule.register()` returns a global module, so `KitchenProjectsModule` shares the single broker and image adapter.
9. `FakeImageAdapter` gained `echo: true` (returns the input bytes) for the broker scheduling tests, which must not wait on sharp; the default fake is the specified tint + 24 px border transform. The debug `POST /ai/jobs` image job now renders a generated grey 1024x1024 JPEG.
10. Migration name `20261116000000_controlnet_render`. `COMFYUI_FREE_AFTER_RENDER` was not added: OQ-9 did not trigger.

Evidence summary:

- Workspace gate: `pnpm install --frozen-lockfile`, `pnpm -r lint` exit 0; `pnpm -r test` api 298 (34 files; new `test/renders/*` 34 tests plus the migration spec), web 469 (29 files; new `render-state.test.ts` 8, `render-client.test.ts` 3, `claimLanding`), api-client 3. OpenAPI regenerated; the only non-additive change is `POST .../renders` (501 placeholder -> 202/400/409/429/503) and the error-code enum order.
- Stack: `./init.sh` exit 0 (6 healthy, new line `API GET /kitchen-projects/<id>/renders (no token) -> 401`). `./scripts/keycloak-smoke.sh` exit 0. `pnpm test:e2e` 152 passed, 1 skipped (new `e2e/results.spec.ts` 3 tests; `login-gate.spec.ts` updated: Scenario 2 claims with the budget intent, renders POST 202, Scenario 6 lands on `/results`).
- Fake curl flow (`bash scripts/ai/render-smoke.sh --no-gpu --warm 1`): 401/403, 202, 409 `render_in_progress`, succeeded in 3.4 s, content variants 200, no prompt/seed/job id. psql `\d kitchen_render` shows the 3 CHECKs, both FKs (CASCADE / SET NULL) and the index; `catalog_chunk_embedding_hnsw_idx` still present. MinIO lists `before.jpg`, `full.jpg`, `thumb.jpg` per Render. `docker compose restart -t 0 api` during an active fake Render gives `failed`/`interrupted` (log `Marked 1 interrupted Render(s) failed`); the next POST is 202.
- Real GPU (2026-11-14, `AI_ADAPTERS=local`, profile `ai` up, llama-server loaded and idle, canny, 1216x832): cold (after `POST /free`) 20.83 s, warm 9.12 s and 10.25 s, POST to terminal status. Portrait crop of the sample (832x1216): cold 14.32 s, warm 8.58 s. VRAM (`vram-sample.sh`, desktop baseline 1849 MiB, llama-server idle 4904 MiB): peak 16,256 of 16,304 MiB (14.4 GB over baseline), no OOM, no ComfyUI errors, llama-server answered a chat request afterwards. Warm times are within 1-14 % of the spike's 9.0 s (includes storage and the 0.25 s poll), under the 25 % trigger, so `GpuResidencyHook` stays a no-op. GPU services stopped with `docker compose --profile ai stop llama-server comfyui`; api back on `fake`.
- Geometry evidence (left `before`, right Render): `docs/spikes/assets/controlnet-render-compare.jpg` and `docs/spikes/assets/controlnet-render-compare-portrait.jpg`. Implementer reading: both left windows, the right window, the sink and tap, the counter runs, the stove position and both fridges stay in place; the tall wooden cabinet in the centre became a glazed door and the restyle keeps clutter (kettle, dish racks, coils) literally (canny). Developer confirmation of the visual check is pending.

### Tuning after the developer's geometry review (2026-11-15)

Feedback: geometry correct, but the Render must remove clutter (kettle, dish racks and drainers, bottles, utensils, small appliances) and must never turn a cabinet or wall into a door, opening, archway or new window.

- Prompt (`render-prompt.ts`): positive = `photorealistic renovated kitchen, (clean empty countertops:1.3), (nothing on the counters:1.2), every cabinet stays a cabinet in the same position, same walls, doors and windows, ` + style text + `, interior design photography, natural daylight, sharp focus` (prefix 32 CLIP tokens, so the constraints sit in the first chunk; with the longest style text the prompt reaches 84 tokens and ComfyUI concatenates a second chunk). Negative (72 tokens, one chunk): `(kettle:1.3), (dish rack:1.3), dish drainer, plastic tub, bowls, extra sink, extra faucet, bottles, utensils, dishes, small appliances, (clutter:1.3), (doorway:1.3), (glass door:1.3), extra door, archway, wall opening, new window, removed wall, structural change, blurry, cartoon, distorted perspective, warped walls, people, text, watermark`. Token counts measured with the SD CLIP tokenizer inside the ComfyUI image.
- ControlNet (new `RenderControl` in the image request, env in compose/.env.example): `RENDER_CANNY_LOW` 0.6, `RENDER_CANNY_HIGH` 0.95, `RENDER_CONTROL_STRENGTH` 0.8, `RENDER_CONTROL_END` 0.5, `RENDER_DEPTH_ASSIST_STRENGTH` 0.7 (0 = off), `RENDER_DEPTH_ASSIST_END` 1. The depth assist is a second ControlNet (Depth Anything V2 Small, `sdxl-depth`) chained after canny; no new weights, no DB or API contract change (`mode` stays `canny`).
- Tried with a direct ComfyUI harness (fixed seed 20261115, plus seeds 7/99/1234 for candidates; grid `docs/spikes/assets/controlnet-render-tuning.jpg`):
  - A spike (canny .2/.5, 0.8, end 1, old prompt): pantry -> glass door, all clutter kept.
  - B new prompt only: same door, kettle kept (prompt cannot beat canny edges).
  - C/D/G/H canny .4/.8, end 1 / .7-.75: no door, pantry -> steel built-in panel, kettle kept or turned into a box, racks -> black bowls.
  - E (.5/.9, s .9, end .7), F (.3/.7, s .9, end .6), J (.3/.6, end .75): pantry -> door.
  - I (.4/.8, s 1, end .6): kettle -> box, steel pantry panel.
  - L cfg 7.5: no change in clutter.
  - M/N/O canny + unblurred depth: pantry a white tall cabinet, all structure kept, kettle and bowls kept.
  - P/Q/R canny end .3-.4 + blurred or low-res depth: clutter gone but windows and layout lost.
  - S/T/W canny .6/.95 end .5-.6 + depth blurred r31: clutter mostly gone on seed 20261115, but seeds 7/99/1234 turned the pantry into a door or oven tower and windows into glass cabinets.
  - Y/Z depth blur 10/15: kettle kept (even as a handbag), Z2 pantry -> door.
  - AA/AB/AC canny .5-.6/.9-.95 end .5 + depth .7-.8 (full, 384/512/1024): structure kept on both seeds.
  - Chosen: AB (canny .6/.95, 0.8, end .5 + depth .7 to 1.0 at 1024).
- Real API smoke with the defaults (llama-server idle): landscape cold 19.55 s, warm 10.24/10.51 s; portrait cold 17.45 s, warm 10.81 s; VRAM peak 16,227/16,304 MiB, no OOM. About +1.5 s per warm Render for the second ControlNet; still inside the 35/20 s budget.
- Result (`docs/spikes/assets/controlnet-render-compare.jpg`, `-portrait.jpg`): windows, sink and tap, counter runs, stove and fridge positions unchanged; the pantry stays a tall cabinet; no new door, opening or window. **Not solved:** clutter is restyled, not removed. Landscape: the kettle (now black), two black vessel bowls where the dish racks were, a bottle by the tap, a plant on a fridge. Portrait: black bowls on wooden boards, plates on the hob, a basket and a plant. Every setting that removed the clutter broke the structural rule on some seed. Real removal needs a clutter mask (segmentation model such as OneFormer/ADE20K, not in the offline volumes; or user-marked areas) plus inpainting: proposed follow-up feature.
