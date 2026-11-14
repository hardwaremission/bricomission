# Feature Implementation Spec: Visitor builds a Moodboard from references

## Source Feature

- `id`: moodboard-selection
- `area`: homeowner-capture
- `depends_on`: kitchen-capture-draft (accepted, merged in base `e958a01` together with `brand-logo-animation`)
- `status`: not_started at planning time (2026-11-14); set to `in_progress` by the planner
- `source`: `feature_list.json`; GitHub issue #21; branch `feature/moodboard-selection`

## Goal

Capture's Continue (`/kitchen-projects/new/moodboard`, 404 today) opens the **Moodboard** screen (PRD wireframe 3, "Moodboard/Style Selection", step 2 of 2). The visitor, still anonymous, builds the Moodboard of the same draft Kitchen Project in two ways: upload own reference photos, or pick images from a curated, offline **Style Gallery**. Picked gallery images and uploaded references form the Moodboard. Tapping a picked gallery image again deselects it; an uploaded reference is removed with its remove button. Every change is saved on the draft at once, so a reload, a web restart or an API restart shows the same Moodboard.

The Style Gallery is a fixed set of kitchen images committed to the repo, with clean licensing, served by the API with no network and no GPU at runtime.

## Non-Goals

- Prompt or dictation to images (PRD Phase 2 item 2): costly AI, needs the Login Gate. Out of this slice.
- Using the Moodboard in a Render (`controlnet-render`), the Login Gate and claiming (`login-gate-claim`), quotas.
- Admin management of the gallery, per-locale galleries, search, tags beyond one style per image.
- Reordering, captions or notes on references; more than one Moodboard per Kitchen Project.
- Any change to the photo pipeline rules, the draft identity model, the proxy or `GET /health`.

## Decisions (OQ-1..OQ-8 answered by the developer on 2026-11-14; OQ-9 is decided in the design step)

1. **Moodboard semantics (OQ-1).** The Moodboard is an ordered set of **Moodboard Items**. An item is either `gallery` (a reference to a Style Gallery image id) or `upload` (an own reference photo). "Selected" means "in the Moodboard": selecting a gallery image adds an item; deselecting removes it. An upload is in the Moodboard from the moment it is stored; removing it deletes its objects. No unselected items are stored.
2. **Style Gallery (OQ-2, OQ-3, OQ-7, OQ-8).** 8 styles x 3 images = 24 images: `modern`, `scandinavian`, `industrial`, `farmhouse`, `classic`, `mediterranean`, `minimalist`, `japandi` (developer chose 8 x 3; the two extra style ids are the orchestrator's default and may be renamed in the design step).
   - Source: generated once at development time with the local SDXL checkpoint (RealVisXL V5.0, txt2img in the `ai` profile ComfyUI), fixed prompts and seeds. The committed JPEGs are the source of truth; the script exists for provenance, not for byte-identical re-runs (ROCm is not bit-exact).
   - Licensing: record the RealVisXL V5.0 model-card licence and the SDXL base licence (CreativeML Open RAIL++-M expected) in `SOURCE.md`. **Stop and report** if the licence restricts the use of outputs in a public demo video. No third-party photos, no network images.
   - Files: `apps/api/assets/style-gallery/manifest.json` plus `<imageId>/{full,thumb}.jpg` (full: longest edge 1280, JPEG q82; thumb: longest edge 512, q80; sRGB; no metadata. ComfyUI PNGs embed the prompt/workflow in text chunks, so the build step must re-encode with sharp, which writes no metadata). About 3 MB total.
   - Manifest entry: `{ id, styleId, width, height, prompt, seed }`. `prompt`/`seed` are internal (for provenance and for `controlnet-render` later); the API never returns them. Ids match `^[a-z0-9-]{1,64}$` (e.g. `scandinavian-01`), are stable, and are never reused or removed once committed (a test guards the set).
   - The developer approves the generated set from a contact sheet before it is committed (OQ-8).
3. **Gallery served by the API (OQ-7).** `StyleGalleryService` loads and validates the manifest once at boot (path from `STYLE_GALLERY_DIR`, default resolved next to `dist`). Routes are `@Public()`: public, non-personal content. Image bytes are read from disk; lookup by manifest id only (no path built from input). Same-origin through the existing `/api` proxy; the future iOS client reuses them.
4. **Limits (OQ-4).**
   - At most **12 Moodboard Items** per draft, uploads and gallery picks together. 409 `moodboard_limit_reached`, re-checked under the draft row lock.
   - Uploads reuse `processPhoto` unchanged: JPEG/PNG/WebP/HEIC, 15 MB, shortest edge >= 480 px, <= 50 MP, same error codes and statuses. Stored as metadata-free `full` + `thumb` JPEGs; originals never stored.
   - Adding a gallery image that is already in the Moodboard returns 200 with the existing item (idempotent, unique constraint). An unknown gallery id gives 400 `gallery_image_unknown`.
5. **Storage.** Keys `kitchen-projects/<projectId>/moodboard/<itemId>/{full,thumb}.jpg` in the same private bucket. Two-phase write and delete order exactly as photos (objects first on delete; 503 `storage_unavailable` keeps the row). `findExpired` must return moodboard upload keys too, so the sweeper deletes them.
6. **Expiry.** Every successful Moodboard mutation slides `expires_at` like other draft mutations.
7. **Entry and Continue (OQ-5, OQ-6).**
   - The page works on the browser's live draft; with no draft it starts one lazily on the first mutation (same BFF start route and `ensureDraft` pattern as Capture), and the draft-expired notice behaves as on Capture.
   - Continue is enabled when the Moodboard has at least 1 item **and** Capture is complete (at least 1 photo, all three measurements). Otherwise a hint names what is missing; when Capture is incomplete the hint links back to Capture.
   - Continue goes to `/kitchen-projects/new/generate`, which returns 404 until `login-gate-claim` (same precedent as before).
8. **Offline.** Same rules as Capture: offline alert, all controls disabled, nothing queued; gallery and reference thumbnails that are not loaded show the neutral placeholder. `/api/*` stays uncached by the service worker.

## Job Story

When I have shown my kitchen and want to say what style I like,
I want to pick inspiring kitchens from a gallery and add my own reference photos,
so the Render later matches my taste, without creating an account and without losing my picks on reload.

## Users And Permissions

- Anonymous visitor and signed-in user: read and change only the Moodboard of the draft their `bm_draft` cookie resolves to (the session token is ignored by these `@Public()` routes).
- Anyone: read the Style Gallery list and images (public, no personal data).
- Other browsers/clients: 404 for any draft, Moodboard Item or item content they do not hold the token for.

## API Contract (additive)

Draft routes: `@Public()` + `DraftTokenGuard`, `@ApiSecurity('draftToken')`, error bodies = Nest generic body + `code`, 404 policy unchanged.

- `GET /kitchen-projects/drafts/current` and every route returning `KitchenDraftView`: new field `moodboard: MoodboardItemView[]` (by position) and `limits.maxMoodboardItems`. `MoodboardItemView` = `{ id, source: 'gallery'|'upload', galleryImageId: string|null, styleId: string|null, position, width, height, thumbUrl, fullUrl }`. Gallery items point their URLs at the gallery content route.
- `POST /kitchen-projects/drafts/current/moodboard/gallery-items` body `{ galleryImageId }`: 201 item; 200 existing item; 400 `gallery_image_unknown` or bad body; 404; 409 `moodboard_limit_reached`; 503.
- `POST /kitchen-projects/drafts/current/moodboard/uploads` (multipart `photo`, existing `PhotoUploadInterceptor`): 201 item; photo codes 400/413/415/422; 404; 409 `moodboard_limit_reached`; 503 `storage_unavailable`.
- `GET /kitchen-projects/drafts/current/moodboard/items/:itemId/content?variant=thumb|full`: upload items only, `image/jpeg`, `private, max-age=3600`; 400; 404 (also for gallery items); 503.
- `DELETE /kitchen-projects/drafts/current/moodboard/items/:itemId`: 204; positions compacted; upload objects deleted first; 400; 404; 503.
- `GET /style-gallery` (`@Public()`): 200 `{ styles: [{ id, images: [{ id, width, height, thumbUrl, fullUrl }] }] }` in manifest order; `cache-control: public, max-age=3600`.
- `GET /style-gallery/images/:imageId/content?variant=thumb|full` (`@Public()`): 200 `image/jpeg`, `public, max-age=86400`; 400 bad variant; 404 unknown id.
- Shared types: `MoodboardItemSource`, `MoodboardItemView`, `StyleGalleryView`, `StyleGalleryImageView`, new error codes `moodboard_limit_reached`, `gallery_image_unknown`.

## Acceptance Scenarios

### Scenario 1: Reach the Moodboard
Given a draft with 2 photos and saved measurements on Capture at 390x844
When the visitor taps Continue
Then `/kitchen-projects/new/moodboard` shows the designed Moodboard screen ("Step 2 of 2") in the current locale with the 24 gallery thumbnails and an empty Moodboard; Continue is disabled with the hint.

### Scenario 2: Build, deselect, reload (feature verification)
When the visitor uploads one reference JPEG, selects two gallery images, then taps one selected gallery image again
Then the Moodboard shows 2 items (the upload and the remaining gallery image), the deselected image shows its unselected state, and Continue is enabled. After a reload the same 2 items, order and selection states are shown; `GET /api/kitchen-projects/drafts/current` lists exactly these 2 items; MinIO holds 2 objects under `.../moodboard/`.

### Scenario 3: Moodboard belongs to the draft (feature verification)
- A second browser context sees an empty Moodboard.
- Through the API with another draft's token, or none: GET current 404; DELETE or content of a foreign item id 404; add to a foreign draft impossible (404 without a valid token).
- A forged client `X-Draft-Token` through `/api` is dropped; cross-origin or missing-Origin POST/DELETE with `bm_draft` gives 403.

### Scenario 4: Limits and validation
- The 13th item gives 409; the UI disables adding and shows the limit message.
- Unknown gallery id gives 400; the same gallery id twice gives one item (200 on the second call).
- Reference uploads: > 15 MB 413, GIF 415, 300x200 422; a HEIC upload gives 201 with a server thumbnail; stored objects have no EXIF/GPS/XMP/ICC.

### Scenario 5: Remove an upload and cleanup
Removing the uploaded reference deletes its row and both objects and compacts positions. A draft whose `expires_at` is set in the past loses its moodboard rows and objects on the next sweep (API restart).

### Scenario 6: Continue rules
With items but incomplete Capture, Continue is disabled and the hint links to Capture. With at least 1 item and complete Capture, Continue goes to `/kitchen-projects/new/generate` (404 for now). Back returns to Capture with its data intact.

### Scenario 7: Offline, failures, gallery
- Offline (`context.setOffline(true)`): reload shows the cached shell, the offline alert, all controls disabled.
- MinIO stopped: reference upload 503 with the tile error and Retry; gallery picks still work (no storage needed); the Moodboard still loads.
- `GET /api/style-gallery` works with MinIO down and with no network; gallery content has no metadata and matches the manifest dimensions.

### Scenario 8: Layout, i18n, gates
Designed states at 390x844 (en, es) and 360x780 (de, fi): no horizontal overflow, targets >= 44 px, Continue visible. `moodboard` namespace (including every style name and gallery alt text) in all 11 message files. `pnpm -r lint`, `pnpm -r test` (with OpenAPI drift), `./init.sh`, `pnpm test:e2e` pass.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `ARCHITECTURE.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`.
- `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md` (Moodboard row: anonymous yes), `docs/risks-and-open-questions.md`, `docs/technical-discovery.md` (grep), `docs/spikes/local-ai-gpu-spike.md` (RealVisXL pin, comfy-run).
- PRD sections 3 wireframes (line ~302) and Phase 2 Inspiration & Moodboard (line ~327).
- `docs/specs/kitchen-capture-draft.md` (incl. Implementation Notes), `docs/design/kitchen-capture-draft.md`, `docs/design/brand-logo-animation.md` (palette).
- API: `src/kitchen-projects/{kitchen-drafts.controller,kitchen-drafts.service,kitchen-drafts.repository,draft-token.guard,draft-cleanup.service,photo-processor}.ts`, `prisma/schema.prisma`.
- Web: `src/app/kitchen-projects/new/page.tsx`, `src/components/capture/CaptureScreen.tsx` (`MOODBOARD_PATH`, `ensureDraft`, marker), `src/lib/kitchen-draft/draft-client.ts`, `e2e/capture.spec.ts` (Continue test asserts 404 at line ~355).
- `infra/ai/samples/SOURCE.md` (licence note pattern).
- Not inspected: `apps/api/Dockerfile` / `pnpm deploy` file selection (check that `assets/` reaches the runtime image), `scripts/ai-spike/comfy-run.sh` internals, the RealVisXL model card (no network).

### Existing Patterns To Follow

- Draft routes under `drafts/current`, `DraftTokenGuard`, 404 policy, `draftError(status, code)`, `db()` wrapper, logs with class names only, injected clock/config.
- Two-phase object writes, objects-first deletes, `SELECT ... FOR UPDATE` limit re-check, compacted positions.
- Prisma `migrate diff` plus hand-written CHECKs; never touch the catalog HNSW index.
- OpenAPI export loop; web JSON calls through `@bricomission/api-client`; uploads via XHR with progress (`upload.ts`); pure reducers in `src/lib/`; 11 message files; E2E imports from `e2e/fixtures.ts`.

### Current Gaps

- No Moodboard table, routes, gallery assets, txt2img workflow, page or messages. No design for the screen (UI gate).

## Technical Approach

**Design input (blocking for UI).** `docs/design/moodboard-selection.md` with "Approved by developer on <date>" and exports in `design/openpencil/moodboard-selection/`. API, gallery and storage work may start before.

**API.**
- Prisma: enum `MoodboardItemSource { gallery upload }` (`moodboard_item_source`); model `MoodboardItem` (`moodboard_item`): `id uuid`, `kitchenProjectId` (cascade), `position`, `source`, `galleryImageId String?`, `fullKey`/`thumbKey String?`, `width`/`height Int`, `byteSize Int?`, `createdAt`; `@@unique([kitchenProjectId, galleryImageId])`, `@@index([kitchenProjectId, position])`. Migration `20261114xxxxxx_moodboard_selection` with a hand-written CHECK: gallery rows have `gallery_image_id` and no keys; upload rows have both keys, `byte_size` and no `gallery_image_id`.
- `src/kitchen-projects/moodboard/`: `moodboard.controller.ts`, `moodboard.service.ts`, `moodboard.ts` (limits, key builder, view mapping). Repository: extend `KitchenDraftRecord` with `moodboard`, add `addMoodboardItem` (lock, limit, unique gallery → existing item), `deleteMoodboardItem` (compact), and extend `findExpired` keys. Update the in-memory test repository.
- `src/style-gallery/`: `style-gallery.module.ts`, `style-gallery.service.ts` (manifest load and validation; missing or invalid manifest logs and serves an empty gallery, never crashes boot), `style-gallery.controller.ts`. The moodboard service validates ids through it.
- Gallery tooling: `infra/comfyui/workflows/sdxl-txt2img.json`; `scripts/style-gallery/generate.sh` (bash; requires the `ai` profile up, tells the user to stop `llama-server` first, posts the workflow per manifest entry to ComfyUI, collects PNGs in a git-ignored work dir); `apps/api/scripts/build-style-gallery.ts` (sharp: full/thumb JPEG, no metadata, writes dimensions to the manifest; also renders `contact-sheet.jpg` into the work dir for approval). `apps/api/assets/style-gallery/SOURCE.md`: model, commit, licence, workflow, sampler, steps, seeds, date.

**Web.**
- `src/app/kitchen-projects/new/moodboard/page.tsx` (`force-dynamic`, identical HTML; header with back to `/kitchen-projects/new`, `LanguageSelector`, `AccountEntry`).
- `src/components/moodboard/`: `MoodboardScreen`, gallery grid with style filter, item tiles, sticky bar (exact names follow the design). Reuse `CaptureAlert`, `precheckPhoto`, and generalize `uploadPhoto` to take the target URL (Capture behavior unchanged, tests updated).
- `src/lib/kitchen-draft/moodboard-state.ts` (pure reducer: items, pending picks, uploads, continue eligibility), `moodboard-client.ts` (gallery list, add/remove).
- Move the shared draft-start/marker logic out of `CaptureScreen` into `src/lib/kitchen-draft/` only if both screens need it (no behavior change).
- `capture.spec.ts`: the Continue test now expects the Moodboard page (200).
- Messages: `moodboard` namespace: copy, `styles.<styleId>`, `gallery.<imageId>` alt texts.
- Test ids: `moodboard-gallery-image` (`data-gallery-id`, `aria-pressed`), `moodboard-item` (`data-item-id`), `moodboard-add-reference`, `moodboard-item-remove`, `moodboard-style-filter`, `moodboard-continue`, `moodboard-offline`.

**init.sh (Web step).** Add `GET /kitchen-projects/new/moodboard -> 200` and `GET /api/style-gallery -> 200` with 24 images.

## Expected File Changes

- Create: `apps/api/src/kitchen-projects/moodboard/*`, `apps/api/src/style-gallery/*`, the migration, `apps/api/assets/style-gallery/{manifest.json,SOURCE.md,<id>/full.jpg,<id>/thumb.jpg}`, `apps/api/scripts/build-style-gallery.ts`, `scripts/style-gallery/generate.sh`, `infra/comfyui/workflows/sdxl-txt2img.json`.
- Modify: `apps/api/{prisma/schema.prisma, src/kitchen-projects/{kitchen-projects.module,kitchen-drafts.repository,kitchen-drafts.service,kitchen-drafts.dto,kitchen-draft.errors}.ts, src/app.module.ts}`, possibly `apps/api/Dockerfile`/`package.json` (assets in the image), `packages/shared-types/src/index.ts`, `packages/api-client/{openapi.json,src/schema.ts}`, `.gitignore` (gallery work dir), `compose.yaml`/`.env.example` only if `STYLE_GALLERY_DIR` needs an override.
- API tests: `test/kitchen-projects/{moodboard.http,moodboard-repository-or-cleanup,migration}.spec.ts` (extend), `test/style-gallery/{manifest,style-gallery.http}.spec.ts`, `test/support/memory-*.ts`.
- Web: page, components, libs above; `test/{moodboard-state,moodboard-client,style-gallery-messages}.test.ts`, `test/upload.test.ts`; `e2e/moodboard.spec.ts`, `e2e/capture.spec.ts`; `messages/*.json` (11).
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes. New page **Moodboard** in `design/openpencil/bricomission_B2C_app.fig`, designed with the developer through the `open-pencil` MCP by the orchestrator before UI code. English only. Read-back `docs/design/moodboard-selection.md`.
- Design brief: reuse Capture's header (back button, no logo), step indicator ("Step 2 of 2", both segments `primary`), title/helper, sticky bottom bar, 4:3 radius-20 tiles, upload tile states and alerts. Selected state must not rely on color alone (check badge plus stroke; `aria-pressed`). Gallery images in the design: placeholders or the public-domain `kitchen-sample.jpg` until the generated set exists.
- Frames: 1 empty Moodboard (gallery with style filter, "Your references" add tile, Continue disabled + hint); 2 filled (2-3 items, selected gallery tiles, counter "2 of 12", Continue enabled); 3 reference upload states (uploading, processing, error); 4 limit reached; 5 Capture incomplete hint with link; 6 offline and draft-expired alerts; 7 360x780 check in de/fi.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update (Moodboard routes and table, Style Gallery module and assets, key layout, cleanup includes moodboard keys, web Moodboard screen, tests).
- `AGENTS.md`: update the "Kitchen Drafts" section with one line on Moodboard keys and one on regenerating the Style Gallery (GPU, `ai` profile, LLM stopped).
- `DESIGN.md`: update asset list (page Moodboard) and approved non-token values.
- `CONTEXT.md`: add **Style Gallery** and **Moodboard Item** terms.
- `docs/domain-model.md`: Moodboard Item, limits, lifecycle with the draft.
- `docs/technical-discovery.md`: gallery generation and serving decision. `docs/risks-and-open-questions.md`: gallery licence note, AI-generated look, assets size.
- `docs/user-and-access-model.md`: not needed (row already says anonymous may build the Moodboard) unless the developer changes OQ-6.
- `CONSTRAINTS.md`: not needed (does not exist; rules live in AGENTS.md).

## Implementation Plan

1. Record developer decisions (OQ list). Orchestrator runs the design step in parallel with 2-4.
2. Generate the gallery (GPU, LLM stopped), build assets, contact sheet to the developer, commit after approval.
3. Prisma model and migration, repository and memory fake, moodboard service/controller, style-gallery module, tests, OpenAPI export.
4. Live curl checks against the stack (MinIO, psql, cleanup).
5. After design approval: web page, components, messages, unit tests, E2E, `init.sh`, docs, evidence; status `passing`.

## Implementation Tasks

- [ ] Developer decisions recorded; design read-back approved (UI tasks blocked until then).
- [ ] txt2img workflow, generate script, build script; licence checked; set approved and committed with `SOURCE.md`.
- [ ] `MoodboardItem` model + migration (CHECK, unique, HNSW untouched).
- [ ] Repository changes (record, add/delete with lock and compaction, expired keys) + memory fake.
- [ ] Moodboard service + controller (4 routes) + draft view fields; error codes; sliding expiry.
- [ ] Style Gallery service + controller + manifest tests; assets in the runtime image.
- [ ] OpenAPI export and api-client regeneration.
- [ ] Web page, components, reducer, client, generalized upload, 11 message files.
- [ ] `capture.spec.ts` update, `moodboard.spec.ts`, `init.sh`, docs, PROGRESS, evidence.

## Verification Plan

Use the orchestrator's env (`COMPOSE_PROJECT_NAME`, ports). No sudo; GPU only for gallery generation, with `llama-server` stopped; never read `.env`.

- Workspace gate: `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test` exit 0, also offline (`unshare -rn`, `ip link set lo up`).
  - API: item belongs to the draft; foreign/missing/expired token 404; foreign item id 404 for content and delete; unknown gallery id 400; duplicate gallery add 200 with one row; limit 409 across sources (incl. concurrent adds); upload codes; upload objects metadata-free; delete compaction and objects-first; storage down 503 keeps row; expiry slides; cleanup deletes moodboard keys; migration SQL has the CHECK and no `DROP INDEX`; manifest: 24 unique ids, 8 styles, files exist, dimensions match, no EXIF/XMP/ICC, thumb <= 512, full <= 1280, ids never removed (snapshot list); gallery routes public, 404 unknown, 400 bad variant, cache headers.
  - Web: reducer (select, deselect, pending, limit, continue rules), client error mapping, upload URL generalization, every manifest style/image id has `en` keys, message parity.
- OpenAPI drift: `pnpm --filter @bricomission/api openapi:export`; only additive changes.
- Stack: `docker compose up -d --build --wait` (6 healthy); `docker compose exec api ls` shows the gallery assets.
- curl: gallery list 200 with 24 images; content 200 `image/jpeg`; draft flows via API with token (add gallery 201, again 200, unknown 400, upload 201, foreign token 404, 13th 409, delete 204); through the web, CSRF 403 without Origin.
- MinIO and psql: 2 objects per upload under `.../moodboard/`; `\d moodboard_item` shows the CHECK and unique; catalog HNSW index present; expired draft swept with its moodboard objects after `docker compose restart api`.
- E2E: `pnpm test:e2e`, new `e2e/moodboard.spec.ts` (Scenarios 1-8: the add 1 upload + 2 gallery, deselect 1, reload test; second context; forged header; CSRF; limit via API-seeded items; HEIC thumbnail; tile errors; Continue rules and target; offline; 390/360 layouts in en/es/de/fi) plus the updated Capture Continue test. All existing specs stay green.
- `./init.sh` exit 0 with the two new Web lines; `bash -n init.sh scripts/style-gallery/generate.sh`.

## Evidence To Capture

- Model, licence text reference, workflow, seeds, generation time per image, contact sheet path, developer approval date; asset sizes.
- Test counts, OpenAPI diff summary, curl outputs, MinIO listing, psql checks, cleanup proof, E2E list, `./init.sh` tail.
- Design read-back path and approval date; deviations in this spec's Implementation Notes.

## Validator Checklist

- [ ] UI matches `docs/design/moodboard-selection.md`; selection not by color alone; one primary CTA; 11 locales; no sign-in forced.
- [ ] Moodboard routes use `DraftTokenGuard`; 404 policy and no IDOR for items; CSRF unchanged and effective; only the gallery routes are newly public.
- [ ] Gallery: 24 committed images, licence recorded, no metadata, served offline, no runtime GPU or network; `prompt`/`seed` not exposed.
- [ ] Uploads reuse the photo pipeline; originals never stored; bucket private; limits enforced server-side under a lock.
- [ ] Cleanup deletes moodboard objects; expiry slides; migration keeps the HNSW index; OpenAPI regenerated.
- [ ] No prompt-to-image, Login Gate, Render or ownership work. Gates pass. Docs updated. Status `passing`, not `accepted`.

## Risks

- Gallery generation needs the GPU and about 15 GB VRAM: run with `llama-server` stopped; if ComfyUI is unavailable, stop and report instead of using network images.
- RealVisXL licence terms unverified offline (see Decision 2 stop rule). AI-generated kitchens may look artificial; the developer approval step mitigates.
- `pnpm deploy` may drop `assets/` from the api runtime image; verify in the container.
- Size: one new aggregate child table, one gallery module, one screen. Near the upper bound; if the design step slips, ship API + gallery first under the same id (UI tasks blocked).

## Open Questions (developer decisions needed before implementation)

### Developer answers (2026-11-14)

- OQ-1: recommended (selected = in the Moodboard; uploads always in it, remove deletes them).
- OQ-2: recommended (generate once with the local SDXL RealVisXL V5.0, commit metadata-free JPEGs, record licence/prompts/seeds; stop and report if the licence restricts use in the public demo video).
- OQ-3: **8 styles x 3 images = 24 images** (not the recommended 6 x 2).
- OQ-4: recommended (max 12 items in total; uploads follow the photo rules).
- OQ-5: recommended (>= 1 item and a complete Capture; Continue goes to `/kitchen-projects/new/generate`, 404 until `login-gate-claim`).
- OQ-6: recommended (lazy draft creation on the first change, like Capture).
- OQ-7: recommended (API assets served by public API routes).
- OQ-8: recommended (contact sheet approved by the developer before the images are committed).
- OQ-9: decided in the OpenPencil design step.

Original questions:

1. OQ-1 Moodboard semantics. Recommended: selected = in the Moodboard; uploads are always in it and "remove" deletes them. Alternatives: (a) uploads stay in a "My references" pool with their own select toggle (unselected uploads kept); (b) a separate favorites step after collecting references.
2. OQ-2 Gallery image source. Recommended: generate once with the local SDXL (RealVisXL V5.0) at dev time, commit JPEGs, record licence/prompts/seeds. Alternatives: (a) CC0/public-domain photos from Wikimedia Commons with per-image attribution (needs network during implementation, uneven quality); (b) the developer supplies licensed images.
3. OQ-3 Gallery size and styles. Recommended: 6 styles x 2 images (modern, scandinavian, industrial, farmhouse, classic, mediterranean). Alternatives: 8 styles x 3 (24 images, more GPU time and repo size); 4 x 3.
4. OQ-4 Limits. Recommended: max 12 items in total, uploads with the photo rules. Alternatives: separate caps (e.g. 6 uploads + 12 gallery); 20 items.
5. OQ-5 Continue rule and target. Recommended: enabled with >= 1 item and a complete Capture; goes to `/kitchen-projects/new/generate` (404 until `login-gate-claim`). Alternatives: Moodboard optional (Continue always enabled, "Skip"); CTA labelled "Generate my kitchen" already, disabled until `login-gate-claim`.
6. OQ-6 Direct entry without a draft. Recommended: lazy start on the first mutation, like Capture. Alternative: show an info state that sends the visitor to Capture first (no draft created here).
7. OQ-7 Where the gallery lives. Recommended: API assets with public API routes (one source for web, iOS and the later Render). Alternative: static files in `apps/web/public/` (service-worker cacheable, but the API would still need the ids and files).
8. OQ-8 Gallery approval. Recommended: the developer approves a contact sheet before the images are committed (short pause during implementation). Alternative: approve at validation time and regenerate if needed.
9. OQ-9 Gallery browsing UI. Recommended: style filter chips ("All" + 8 styles) over one 2-column grid. Alternative: one section per style with a heading. Final choice is made in the OpenPencil design step.

## Implementation Notes (2026-11-14, implementer)

Design input: `docs/design/moodboard-selection.md` (approved by developer on 2026-11-14). Status after self-verification: `passing` (not `accepted`).

Style Gallery generation:
- Generated with ComfyUI 0.45.3 (`comfyui` only, `llama-server` not running), RealVisXL V5.0 fp16 (`SG161222/RealVisXL_V5.0@ac93e0dd`), workflow `infra/comfyui/workflows/sdxl-txt2img.json`: 1216x832, 30 steps, `dpmpp_2m` karras, cfg 5.5, fixed negative prompt; seeds 20261114-20261137 (one per image, in `manifest.json`). About 7.3 s per image warm (first image 14.4 s cold). ComfyUI stopped afterwards with `docker compose --profile ai stop comfyui`.
- Every image was inspected at full size: realistic kitchens of each style, no people, no text, no obvious distortions; nothing needed regeneration.
- Contact sheet: `design/openpencil/moodboard-selection/gallery-contact-sheet.png` (PNG, labelled ids; written there by the orchestrator's instruction instead of the work dir). **Pending developer approval** before commit (OQ-8).
- Licence: **not confirmed offline.** The safetensors header has no `__metadata__` and no model card is cached locally; recorded in `apps/api/assets/style-gallery/SOURCE.md` and `docs/risks-and-open-questions.md`. The developer must check the model card (expected CreativeML Open RAIL++-M) before using the images in the public demo video.
- Assets: 24 x (`full.jpg` 1216x832 q82 mozjpeg, `thumb.jpg` 512x350 q80), about 3.2 MB in total; sharp re-encode, no EXIF/XMP/ICC/IPTC/text (asserted by `test/style-gallery/manifest.spec.ts`).

Deviations and choices:
- Manifest shape: `{ version: 1, styles: [...ids in order], images: [{ id, styleId, width, height, prompt, seed }] }` (the top-level `styles` gives the style order and the empty-style check).
- Gallery accessible names: one ICU template `moodboard.gallery.alt` = `{style} kitchen {n}` plus `moodboard.styles.<styleId>` in all 11 locales, instead of 24 per-image `gallery.<imageId>` keys. The design defines the name as `{Style} kitchen {n}`, so a template keeps word order per locale and new images need no new keys. `style-gallery-messages.test.ts` checks every manifest style has a name in every locale.
- `POST .../gallery-items`: a non-object body or a non-string `galleryImageId` gives a plain 400 (no code); any string that is not a manifest id (including malformed ones) gives 400 `gallery_image_unknown`. An image already in the Moodboard returns 200 with its item even when the Moodboard is full (idempotency is checked before the limit) and does not slide the expiry (nothing changed).
- Extra migration CHECKs beyond the spec: gallery id format, position >= 0, positive width/height.
- Gallery content is read into a Buffer (`readFile`; files are 20-130 KB) rather than streamed.
- The counter `{count} of 12` and the limit count items plus gallery picks and uploads in flight (error tiles do not count), so the visitor cannot overshoot the limit.
- Reference upload tiles reuse Capture's `UploadingTile` (exported with a `testIdPrefix`), including its copy ("Remove photo {n}" on error tiles), as panel 3 says "same tile states and copy".
- Shared web code moved without behavior change: `draftMarker` (`src/lib/kitchen-draft/draft-marker.ts`), `CaptureAlert` `testIdPrefix`, exported `call`/`TIMEOUT_MS` in `draft-client.ts` (`call` accepts several OK statuses), generic `uploadPhoto<T>` with `MOODBOARD_UPLOAD_URL`.
- Offline: an offline reload shows the cached shell, the offline alert and disabled controls, but no gallery tiles, because `/api/*` (including `/api/style-gallery`) is never cached by the service worker. Tiles already loaded when the browser goes offline stay visible, disabled, and the style filter still filters them.
- E2E helper `horizontalOverflow` (`e2e/support.ts`) skips elements marked `data-scroll-x`; the style chip row is the only one (a designed horizontal scroller).
- `SOURCE.md` is copied into the api image too (`.dockerignore` `*.md` matches the root only); harmless.
