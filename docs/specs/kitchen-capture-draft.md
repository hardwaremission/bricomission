# Feature Implementation Spec: Anonymous visitor uploads kitchen photos and measurements

## Source Feature

- `id`: kitchen-capture-draft
- `area`: homeowner-capture
- `depends_on`: web-pwa-shell (accepted). Built on top of `homeowner-password-login` (accepted, merged in base `82ca50d`) because it changes the same `/api` proxy.
- `status`: not_started at planning time (2026-11-13)
- `source`: `feature_list.json`

## Goal

The Home CTA "Start your Kitchen Project" (`/kitchen-projects/new`, 404 today) opens the **Capture** screen (PRD wireframe 2, "Data Input / Photo Upload"). A visitor, with no account, adds photos of the kitchen and enters Length x Width x Height. The first save creates a `draft` Kitchen Project bound to the browser through an opaque HttpOnly cookie. Photos are normalized (orientation applied, all metadata removed, re-encoded) and stored in MinIO. Measurements are stored in whole centimetres. A reload, a web restart or an API restart shows the same photos and measurements. "Continue" leads to the Moodboard step (a later feature).

Unclaimed drafts expire 7 days after their last change. An in-process sweeper in the API deletes them, with their objects.

## Non-Goals

- The Login Gate, claiming a draft, account ownership, or listing a user's Kitchen Projects (`login-gate-claim`). Signed-in visitors use the same anonymous draft.
- The Moodboard screen (`moodboard-selection`). Continue goes to a route that returns 404 until that feature.
- Renders, Budget, quotas, Admin-editable MinIO credentials (`admin-service-endpoints`), and a storage line in `GET /health` (its contract stays unchanged).
- Presigned browser-to-MinIO uploads, AVIF/GIF/TIFF input, client-side resizing or client-side HEIC preview, 3D scans, room shape beyond L x W x H.
- More than one open draft per browser.

## Decisions

Planner decisions with reasons. The developer answered the open questions on 2026-11-13: ranges, units, expiry and the Continue target are confirmed as planned. Photos changed: HEIC/HEIF is accepted (Decision 4a). See "Developer Decisions" at the end of this spec.

1. **Draft identity: an opaque cookie held by the web, a token hash in the API.**
   - The API generates a draft token: 32 random bytes, base64url, 43 characters. It stores only `sha256(token)` (`draft_token_hash`, unique) and returns the token once, in the 201 body of `POST /kitchen-projects/drafts` (field `draftToken`). The future iOS client keeps it and sends it itself.
   - The web BFF route `POST /api/kitchen-projects/drafts` (a static route that wins over `api/[...path]`) does three things: it calls the API, moves `draftToken` into the cookie `bm_draft` (`HttpOnly; SameSite=Lax; Path=/`, `Secure` on https, Max-Age 30 days), and returns the body without the token. If the request already carries a `bm_draft` cookie that resolves to a live draft, it returns that draft with 200 and creates nothing (idempotent, so a double tap does not create two drafts).
   - The generic `/api` proxy reads `bm_draft` and sends it upstream as `X-Draft-Token`. A client-sent `x-draft-token` is never forwarded: it is not in the header allowlist, and a test proves it.
   - API draft routes are `@Public()`, which is the explicit opt-out of the default-deny `AuthGuard`. A `DraftTokenGuard` authorizes them instead. It checks the token format, hashes it, and loads the draft where `status = draft` and `expires_at > now()`. A missing, malformed, unknown or expired token gives **404** with a generic body, so nobody can probe which drafts exist.
   - URLs carry no project id: the routes act on `drafts/current`. Photo ids are checked against the resolved draft. This is the IDOR guard: another browser's photo id gives 404.
   - Rejected:
     - Token in `localStorage`: it is readable by any script on the page (XSS) and is not sent with `<img>` requests.
     - Web-only draft storage: the API is the system of record, and the iOS client needs the same API.
     - Id in the URL plus a token: a second secret to leak through history and logs.
2. **CSRF.** The proxy's Origin rule is extended: an unsafe method that carries `bm_session` **or `bm_draft`** needs an `Origin` whose host equals `Host`, or it gets 403 before any upstream call. The BFF start route always requires that same-origin `Origin`. Without it, a cross-site form could swap the victim's draft cookie.
3. **Upload path: multipart through the web proxy to the API.** It is not a presigned PUT.
   - The proxy already streams bodies. The API validates and normalizes every image before it is stored.
   - Rejected: presigned PUT. MinIO would need CORS and a second browser-visible origin. The signature host (`minio:9000` inside compose, `localhost:9000` in the browser) would need a separate endpoint per worktree. And unprocessed originals, GPS data included, would land in storage.
   - Keep `/api/` excluded from the `src/proxy.ts` matcher. Next's proxy/middleware body limit would otherwise cut uploads.
4. **Photo processing and privacy (`sharp`, exact pin).**
   - Accepted input: JPEG, PNG, WebP or HEIC/HEIF (Decision 4a). The type is detected from the file's magic bytes. The client-declared MIME type and the file extension are ignored on the server. Size: at most **15 MB**. Shortest edge: at least **480 px**. Pixel count: at most 50 MP (`limitInputPixels`). Count: at most **8 photos** per draft. One file per request, multipart field `photo`.
   - Stored copies:
     - `full`: EXIF orientation applied (`rotate()`), sRGB, longest edge at most 2560 px, JPEG quality 85, **no metadata at all** (EXIF/GPS, XMP, IPTC and ICC are all dropped).
     - `thumb`: longest edge at most 512 px, JPEG quality 80.
   - The original bytes and the original file name are never stored.
   - Error codes:
     - 413 `photo_too_large`;
     - 415 `photo_unsupported_type`, also for a file that does not decode;
     - 422 `photo_too_small`;
     - 409 `photo_limit_reached`;
     - 503 `storage_unavailable`.
4a. **HEIC/HEIF (iPhone photos), developer decision 2026-11-13.**
   - Why `sharp` alone is not enough: its prebuilt libvips includes libheif for AVIF only, with no HEVC decoder (patent reasons). `sharp.format.heif.input` can be `true` and an iPhone HEIC still fails to decode.
   - Step 1, probe first. With the pinned sharp, decode the HEIC fixture inside the api container. If it decodes, use sharp directly and record that.
   - Step 2, the expected path when the probe fails: `heic-decode` (MIT wrapper over `libheif-js`, a WASM/JS build of libheif + libde265, both LGPL-3.0, used unmodified as an npm dependency).
     - Everything is pinned exactly. No native build, no network at runtime, works offline in `node:26.13.1-bookworm-slim`.
     - Flow: decode the primary image to RGBA, then `sharp(raw, { raw: { width, height, channels: 4 } })`, then the same full/thumb pipeline as the other formats.
   - Detection: the ISO-BMFF `ftyp` box with brand `heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`, or `mif1`/`msf1` with an HEVC item. An AVIF brand gives 415.
   - Pixel limit: check width x height from the decoder's header (`heic-decode` `all()` exposes the dimensions before `decode()`) against 50 MP and the 480 px shortest edge, before decoding the pixels.
   - Orientation: libheif applies the container transforms (`irot`/`imir`) on decode. Do not also apply EXIF orientation to decoded HEIC pixels (no double rotation). The test fixture covers this.
   - Metadata: decoding to raw pixels drops EXIF/GPS/XMP. The stored output is the same metadata-free JPEG `full` + `thumb`. The original HEIC is never stored.
   - Decode errors (corrupt files, unsupported codec) give 415 `photo_unsupported_type`.
   - Cost: WASM decode of a 12 MP photo may take a few seconds. Decode one photo at a time per process (a simple in-process mutex). Record the measured time.
   - Fallback when `heic-decode` is not usable: a pinned api base image with libvips + libheif + libde265 (for example Debian `libheif1` with the `libde265` plugin) and sharp built against that global libvips. Record the image and the build steps.
   - **Stop and report:** if neither a license-clean (MIT/BSD/Apache/LGPL used unmodified), offline-capable decoder works in the container, or a GPL-only path would be needed, stop, set the feature `blocked`, and report. Do not drop HEIC silently and do not store unprocessed files.
   - Client:
     - the file input `accept` is `image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif`;
     - the size pre-check runs on every file;
     - the type pre-check accepts the MIME types `image/heic`/`image/heif`, or an empty/`application/octet-stream` type with a `.heic`/`.heif` extension (some browsers report no type for HEIC);
     - browsers cannot preview HEIC, so tiles show no local preview for any format: a neutral placeholder plus progress, then the server thumbnail after upload.
5. **MinIO layout.**
   - One private bucket, `S3_BUCKET` (default `bricomission-media`). It has no anonymous policy.
   - The API creates the bucket lazily and idempotently on first use (`HeadBucket`, then `CreateBucket`), cached per process, so no init container is needed.
   - Keys: `kitchen-projects/<projectId>/photos/<photoId>/{full,thumb}.jpg`.
   - Client: `@aws-sdk/client-s3`, newest 3.x pinned exactly, `forcePathStyle: true`, endpoint `S3_ENDPOINT`, behind an `ObjectStorage` interface with an in-memory fake for tests.
   - Credentials: for now `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` are passed as `S3_ACCESS_KEY`/`S3_SECRET_KEY`. A dedicated key and Admin-edited settings come later.
   - Photos are served only through the API (`GET .../content?variant=thumb|full`, draft-guarded, `cache-control: private, max-age=3600`). The browser loads them as same-origin `<img src="/api/...">`, so the cookie is sent.
6. **Measurements.**
   - The API stores integer centimetres: `length_cm`, `width_cm`, `height_cm`, each nullable, so an unset field is null.
   - Ranges (confirmed): length and width **100-2000 cm** (1.00-20.00 m), height **180-600 cm** (1.80-6.00 m). The API enforces them, and so does a DB `CHECK` written by hand in the migration.
   - UI: the unit is metres by default, with an m/cm toggle (confirmed). `inputmode="decimal"`.
   - Parser (pure, unit-tested):
     - accepts `,` or `.` as the single decimal separator in any locale;
     - rejects thousands grouping, signs, exponents and more than 2 decimals in m (or any decimals in cm);
     - rounds nothing, so `3,205` m is invalid.
   - Display uses `Intl.NumberFormat(locale)` with 2 decimals in m and tabular numerals (DESIGN.md), for example `3,20 m` in es and `3.20 m` in en.
   - Saving: each field auto-saves on blur when it is valid or empty, through `PUT .../measurements` with all three values (null allowed). A live "Saving…"/"Saved" status confirms it.
7. **Continue.** It is enabled only with at least 1 photo, no upload in progress and all three measurements valid and saved. It navigates to `/kitchen-projects/new/moodboard`, which returns 404 until `moodboard-selection` (the same precedent as the Home CTA before this feature) (confirmed).
8. **Expiry and cleanup are in scope.**
   - `expires_at = now() + DRAFT_TTL_DAYS` (7) at creation and on every successful mutation: sliding expiry, 7 days from the last change (confirmed).
   - `DraftCleanupService` runs on API start and then every `DRAFT_CLEANUP_INTERVAL_MS` (default 3600000, `unref`'d timer). It deletes expired drafts in batches of 50: storage objects first, then the rows (cascade to photos). If storage is down, it keeps the rows and retries on the next run.
   - The cookie's Max-Age (30 days) is not authoritative; the row's expiry decides.
9. **Abuse limits (local MVP).**
   - All browsers reach the API from the web container's IP, so per-IP limits are meaningless. Instead:
     - a global cap of `DRAFT_MAX_OPEN` (2000) unexpired drafts: above it, create gives 429 `draft_capacity`;
     - the per-draft photo and size limits above;
     - Express JSON body at its 100 kB default;
     - Multer limits `files: 1`, `fields: 0`, `fileSize: 15 MB`.
   - Recorded as a risk.
10. **Offline (PWA).**
    - The capture page HTML is identical for every visitor. Draft data loads on the client from `/api/...`, so the service worker's network-first navigation cache never holds private data.
    - `sw.js` keeps skipping `/api/*`, `/auth/*` and non-GET requests (uploads are POSTs). No version bump is needed unless `sw.js` changes.
    - Offline (`navigator.onLine === false`, a network error or proxy 502), the screen shows the designed offline alert. Add-photo, edits and Continue are disabled, nothing is queued for later, and work already saved stays on the server.
11. **Model.** Two Prisma models, one aggregate:
    - `KitchenProject`:
      - `id uuid`;
      - `status` as Prisma enum `KitchenProjectStatus { draft }` (later features add values);
      - `draftTokenHash Bytes? @unique`;
      - `lengthCm`/`widthCm`/`heightCm Int?`;
      - `expiresAt` (indexed), `createdAt`, `updatedAt`.
    - `KitchenPhoto`:
      - `id uuid`;
      - `kitchenProjectId` (cascade);
      - `position Int`;
      - `fullKey`, `thumbKey`;
      - `width`, `height`, `byteSize` (of `full`);
      - `createdAt`.
    - Tables `kitchen_project`, `kitchen_photo`. No owner column: `login-gate-claim` adds it.

## Job Story

When I want to see what my kitchen could look like and what it would cost,
I want to add photos and the room's measurements without creating an account,
so I can start right away and never lose what I entered if I reload.

## Users And Permissions

- **Anonymous visitor and signed-in user:** create one draft per browser, then read and change only the draft their `bm_draft` cookie resolves to. The session token the proxy injects for signed-in users is ignored by these `@Public()` routes.
- **Other browsers and clients:** 404 for any draft or photo they do not hold the token for. They have no listing and no id-based access.

## API Contract (new, `src/kitchen-projects/`)

All routes are `@Public()` and `@ApiTags('kitchen-projects')`. Every route except create uses `DraftTokenGuard` (header `X-Draft-Token`, documented as an `apiKey` security scheme `draftToken`). Error bodies are Nest's generic bodies plus a `code` field, and they never contain internals.

- `POST /kitchen-projects/drafts`: 201 `{ draft: KitchenDraftView, draftToken }`, or 429 `draft_capacity`, or 503 when the database is down.
- `GET /kitchen-projects/drafts/current`: 200 `KitchenDraftView` `{ id, status: 'draft', measurements: { lengthCm, widthCm, heightCm } (nullable), photos: KitchenPhotoView[] by position, limits: { maxPhotos, maxPhotoBytes }, expiresAt }`, or 404.
- `PUT /kitchen-projects/drafts/current/measurements`: body `{ lengthCm, widthCm, heightCm }`, each an integer or null. 200 `KitchenDraftView`; 400 `{ code: 'invalid_measurements', fields: { <name>: 'not_integer' | 'out_of_range' } }`; 404.
- `POST /kitchen-projects/drafts/current/photos` (multipart `photo`): 201 `KitchenPhotoView` `{ id, position, width, height, thumbUrl, fullUrl }`. The URLs are API-relative paths. Errors as in Decision 4, and 404.
- `GET /kitchen-projects/drafts/current/photos/:photoId/content?variant=thumb|full`: 200 `image/jpeg` stream; 400 for a malformed uuid or variant; 404.
- `DELETE /kitchen-projects/drafts/current/photos/:photoId`: 204. The objects are deleted and the positions compacted. 404.

Shared types in `packages/shared-types`: `KitchenProjectStatus`, `KitchenMeasurements`, `KitchenPhotoView`, `KitchenDraftView`, `StartKitchenDraftResponse`, `KitchenDraftErrorCode`.

## Acceptance Scenarios

Ports come from the run's env. Browser URLs use `localhost`.

### Scenario 1: Start the capture flow anonymously
Given anonymous Home at 390x844
When the visitor taps "Start your Kitchen Project"
Then `/kitchen-projects/new` shows the designed empty Capture screen in the current locale. No draft exists yet, and no request creates one until the first photo or measurement is saved.

### Scenario 2: Upload two photos, enter measurements, reload
When the visitor adds two JPEGs and enters 4,20 / 3,10 / 2,60 m in `es`
Then the visitor sees:
- each tile shows upload progress, then its thumbnail (served from `/api/.../content?variant=thumb`);
- each measurement shows "Saved";
- Continue becomes enabled.

After a reload, the same two thumbnails (same order) and `4,20` / `3,10` / `2,60` are shown. The database holds one `kitchen_project` (`status draft`, 420/310/260) and two `kitchen_photo` rows. MinIO holds 4 objects under `kitchen-projects/<id>/photos/`.

### Scenario 3: Draft identity is private and unforgeable
- `document.cookie` has no `bm_draft`; the cookie is HttpOnly. The page HTML contains no token.
- A second browser context sees an empty Capture screen.
- `X-Draft-Token` sent by the client through `/api` is dropped. Sent directly to the API with a wrong or expired token, it gets 404.
- A photo id of another draft gives 404 for content and DELETE.
- The DB holds only a 32-byte hash and no token text.
- A cross-origin or missing-Origin POST/PUT/DELETE with `bm_draft`, and the start route without a same-origin Origin, give 403.

### Scenario 4: Photo validation and privacy
- A file over 15 MB gives 413 `photo_too_large`. A GIF or a renamed text file gives 415. A 300x200 image gives 422. A 9th photo gives 409.
- The UI shows the designed per-tile error with retry or remove. The client pre-checks type and size before uploading.
- Given a JPEG with EXIF GPS tags and orientation 6, the stored `full` object has no EXIF/XMP/ICC (sharp `metadata()`) and is rotated (width and height swapped). Its longest edge is at most 2560 and `thumb`'s at most 512.
- Given an HEIC with EXIF GPS (and a fixture with an `irot` rotation), the upload gives 201. The stored `full` and `thumb` are JPEGs with no metadata, rotated exactly once, with the expected dimensions. The tile shows the server thumbnail.
- An AVIF or a corrupt `.heic` gives 415. An HEIC whose shortest edge is under 480 px gives 422.

### Scenario 5: Measurement validation
In the UI:
- `abc` is invalid.
- `0,5` m and `25` m are out of range, with a message that shows the localized range.
- `1.234,5` is rejected (grouping).
- The cm unit accepts `320` and rejects `320,5`.
- Empty fields are allowed while editing. Continue with any field empty shows the "required" errors.

The API rejects non-integers, out-of-range values and wrong types with 400 and `fields`. The DB `CHECK` rejects out-of-range values written directly.

### Scenario 6: Remove a photo
When the visitor removes photo 1 of 2
Then the tile disappears, the row and both objects are gone, the other photo becomes position 0, and a reload confirms it. Removing the last photo disables Continue.

### Scenario 7: Continue
With at least 1 photo and three saved measurements, Continue navigates to `/kitchen-projects/new/moodboard` (404 page for now). Otherwise it is disabled, and the designed hint says what is missing.

### Scenario 8: Offline and failures
- With the browser offline (`context.setOffline(true)`), a reload serves the cached page shell and shows the offline alert. Add-photo, inputs and Continue are disabled. Back online, the draft reloads.
- With MinIO stopped, an upload gives 503 `storage_unavailable` and the tile error. The draft and its measurements still load (thumbnails show a placeholder).
- With the API down, the proxy returns 502 and the page shows the offline/unavailable state.

### Scenario 9: Expiry and cleanup
Given a draft whose `expires_at` is set in the past (psql)
When the API restarts (the sweeper runs on start)
Then the rows and its MinIO objects are deleted. The browser's next GET gives 404 and the page shows the empty state; the next save creates a new draft and replaces the cookie. Every successful mutation moves `expires_at` 7 days ahead.

### Scenario 10: Layout, i18n, gates
- Every designed state at 390x844, and the key states at 360x780 in `de` and `fi`, show no horizontal overflow, targets of at least 44 px, and a visible sticky Continue.
- The `capture` namespace exists in all 11 message files (parity test).
- `pnpm -r lint`, `pnpm -r test` (including OpenAPI drift), `./init.sh` and `pnpm test:e2e` pass.

## Repository Research

### Files Inspected

- `AGENTS.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`.
- `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`.
- PRD §1.2 (lazy login, line 77), §3 Phase 1 and Wireframes Scope (lines 299-325).
- `docs/specs/homeowner-password-login.md` (incl. Implementation Notes), `docs/design/{web-pwa-shell,homeowner-password-login}.md`.
- `apps/web/src/lib/api-proxy.ts`: header allowlist; the CSRF rule fires only with `bm_session`; streamed body; `cache-control` passthrough.
- `apps/web/src/app/api/[...path]/route.ts`, `src/lib/auth/{session,origin}.ts` (reusable `readCookie`, `setCookie`, `hasSameOrigin`).
- `apps/web/src/proxy.ts`: its matcher excludes `api/`, and page routes get the locale header.
- `apps/web/public/sw.js` (v2: skips `/api`, `/auth`, non-GET), `src/app/page.tsx` (CTA `home-cta-start` links to `/kitchen-projects/new`), `messages/en.json`, `package.json`, `e2e/support.ts` (overflow, targets, guard helpers).
- `apps/api/src/app.module.ts`, `src/auth/auth.guard.ts` (`@Public()` short-circuits), `src/catalog/catalog.controller.ts` (manual validation pattern; no class-validator in deps), `package.json` (Nest 12.5.0, Prisma 7.10.1), `prisma/schema.prisma` (catalog models; the HNSW index is hand-written).
- `compose.yaml` (minio `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, the api has no S3 env), `.env.example`, `init.sh` (API/Keycloak/Web steps), `pnpm-workspace.yaml` (`onlyBuiltDependencies`).
- `infra/ai/samples/kitchen-sample.jpg` + `SOURCE.md` (public-domain photo for fixtures).
- Not inspected: the `sharp` and `@aws-sdk/client-s3` releases (no network). Pin the newest stable at implementation and record them. Check sharp's prebuilt `linux-x64` binary on Node 26 in `node:26.13.1-bookworm-slim`, and whether pnpm needs it in `onlyBuiltDependencies`.

### Existing Patterns To Follow

- One Nest module per feature with thin controllers and pure, unit-tested services. Manual input validation with `BadRequestException`. Logs carry error class names only.
- Prisma migration via `prisma migrate diff`, then hand-edited. Remove any `DROP INDEX` of the catalog HNSW index from the generated SQL (ARCHITECTURE.md).
- OpenAPI regeneration loop (`openapi:export`, commit `openapi.json` + `schema.ts`). Web calls go through `@bricomission/api-client` where JSON is involved. Uploads use `XMLHttpRequest` for progress.
- Web: pure helpers in `src/lib/`; every string in 11 message files; DESIGN.md tokens via Tailwind `@theme`; `lucide-react` icons; E2E under the localhost guard.
- Env defaults in compose equal `.env.example`; 127.0.0.1-only ports; exact versions.

### Current Gaps

- No Kitchen Project tables, no S3 client, no image library, no multipart handling (multer ships with `@nestjs/platform-express`; add `@types/multer` as a dev dependency).
- The proxy does not know `bm_draft`. There is no page at `/kitchen-projects/new`, and the `capture` message namespace is missing.
- No design for the Capture screen yet (UI gate, below).

## Technical Approach

**Design input (blocking).** Before any UI code, `docs/design/kitchen-capture-draft.md` must exist with "approved by developer on <date>", and JSX/PNG exports must be in `design/openpencil/kitchen-capture-draft/`. If either is missing, set the feature `blocked`. The API and storage work (steps 2-3 of the plan) may start before approval.

**API (`apps/api/src/kitchen-projects/`).**
- `kitchen-projects.module.ts`, `kitchen-drafts.controller.ts`, `kitchen-drafts.service.ts`, `draft-token.guard.ts` (with a `@CurrentDraft()` decorator), `draft-token.ts` (generate, hash, format check), `measurements.ts` (pure range validation; exported constants `MEASUREMENT_LIMITS_CM`), `photo-processor.ts` (`sharp`; returns `{full, thumb, width, height}` or a typed error), `draft-cleanup.service.ts` (`OnApplicationBootstrap` + interval; injected clock), `kitchen-projects.config.ts` (env), `kitchen-drafts.dto.ts`.
- `src/storage/`: `object-storage.ts` (interface: `put`, `getStream`, `deleteMany`, `ensureBucket`), `s3-object-storage.ts`, `storage.module.ts`. The test fake lives in `test/support/`.
- Photo upload is a two-phase write: process, then put both objects, then insert the row in a transaction that re-checks the photo count. If the insert fails, delete the objects. Positions are `max+1` and are compacted on delete.
- Swagger: `addApiKey({type:'apiKey', in:'header', name:'X-Draft-Token'}, 'draftToken')` in `configureApp`. Multipart body via `@ApiConsumes('multipart/form-data')`.

**Web.**
- `src/lib/kitchen-draft/`:
  - `draft-cookie.ts`: `DRAFT_COOKIE='bm_draft'`, Max-Age 2592000.
  - `start-draft.ts`: BFF start logic: Origin check, resume or create, cookie, token stripped.
  - `measurements.ts`: locale-aware parse and format, plus limits mirrored from the API; a unit test compares them with the min/max in the committed `openapi.json`.
  - `upload.ts`: XHR with progress and abort, error-code mapping.
  - `capture-state.ts`: a pure reducer for tiles, measurements and continue-eligibility.
- `src/app/api/kitchen-projects/drafts/route.ts` (POST only) calls the start logic.
- `api-proxy.ts`:
  - `bm_draft` becomes `x-draft-token` upstream;
  - the CSRF rule covers `bm_draft`;
  - reuse `readCookie` (also resolves risk note L2).
- `src/app/kitchen-projects/new/page.tsx` (`force-dynamic`, identical HTML) plus client components under `src/components/capture/` (exact names follow the design: e.g. `CaptureScreen`, `PhotoGrid`, `PhotoTile`, `MeasurementsForm`, `OfflineAlert`).
- Test ids: `capture-add-photo`, `capture-photo-tile`, `capture-photo-remove`, `capture-length`, `capture-width`, `capture-height`, `capture-unit-toggle`, `capture-save-status`, `capture-continue`, `capture-offline`.
- `messages/*.json`: a `capture` namespace in all 11 files (10 agent-translated).

**Compose and env.** api env:
- `S3_ENDPOINT: http://minio:9000`, `S3_REGION: us-east-1`;
- `S3_ACCESS_KEY: ${MINIO_ROOT_USER:-bricomission}`, `S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-bricomission-dev-secret}`;
- `S3_BUCKET: ${S3_BUCKET:-bricomission-media}`;
- `DRAFT_TTL_DAYS: ${DRAFT_TTL_DAYS:-7}`, `DRAFT_CLEANUP_INTERVAL_MS: ${DRAFT_CLEANUP_INTERVAL_MS:-3600000}`, `DRAFT_MAX_OPEN: ${DRAFT_MAX_OPEN:-2000}`.

The api gets no `depends_on` on minio: it boots without MinIO, and uploads return 503. Matching `.env.example` entries.

**init.sh (Web step).** Add two checks:
- `GET /kitchen-projects/new` returns 200;
- `GET /api/kitchen-projects/drafts/current` with no cookie returns 404 (route mounted, guard active).

No Playwright run and no upload.

## Expected File Changes

- Create:
  - `apps/api/src/kitchen-projects/*` and `apps/api/src/storage/*` (above);
  - `apps/api/prisma/migrations/2026111312xxxx_kitchen_capture_draft/migration.sql`.
- Modify: `apps/api/{src/app.module.ts, src/app.setup.ts, prisma/schema.prisma, package.json}`, `pnpm-lock.yaml`, possibly `pnpm-workspace.yaml` (sharp build approval).
- API tests (create):
  - `apps/api/test/kitchen-projects/{draft-token,measurements,photo-processor,kitchen-drafts.http,draft-cleanup,migration}.spec.ts`;
  - `test/support/memory-object-storage.ts`;
  - `s3-object-storage.spec.ts` against a local `node:http` stub, or skip it with a reason.
- Shared and generated: `packages/shared-types` (new types), `packages/api-client/{openapi.json,src/schema.ts}` (regenerated).
- Web, create:
  - `apps/web/src/app/kitchen-projects/new/page.tsx`;
  - `src/app/api/kitchen-projects/drafts/route.ts`;
  - `src/lib/kitchen-draft/*`, `src/components/capture/*`;
  - `test/{start-draft,measurements-input,capture-state,upload}.test.ts`;
  - `e2e/capture.spec.ts`;
  - `e2e/fixtures/kitchen-{1,2}.jpg` and `kitchen-3.heic` (derived from `infra/ai/samples/kitchen-sample.jpg`, at most 300 kB each, plus a `SOURCE.md` note).
- HEIC fixtures:
  - `apps/api/test/fixtures/heic/{kitchen-gps.heic,kitchen-irot90.heic,kitchen-small.heic,not-heic.heic}` plus `SOURCE.md`;
  - all generated from the public-domain `kitchen-sample.jpg` with `heif-enc` (libheif) in a pinned throwaway container (for example `debian:bookworm-slim` + `libheif-examples`, version recorded);
  - EXIF GPS is injected before encoding; `irot` via `heif-enc` options, or `exiftool` if needed;
  - the exact commands go in `SOURCE.md`, and each file is at most 200 kB;
  - `apps/api/scripts/generate-heic-fixtures.sh` (bash) re-creates them.
- Web, modify: `src/lib/api-proxy.ts`, `test/api-proxy.test.ts`, `messages/*.json` (11).
- Infra: `compose.yaml`, `.env.example`, `init.sh`.
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes. A new screen family on `design/openpencil/bricomission_B2C_app.fig`, new page **Capture**, designed with the developer through the `open-pencil` MCP (UI gate). The orchestrator runs this step before the implementer.
- Read-back: `docs/design/kitchen-capture-draft.md`, which lists every element with layout, sizes, tokens, text styles and final English copy, plus "approved by developer on <date>". Exports go in `design/openpencil/kitchen-capture-draft/`.

### Design Brief For The OpenPencil Step

Rules: English only; 390x844 frames; text wraps for de/fi (~30 % longer); DESIGN.md tokens; touch targets ≥ 44; focus ring `focus`; never color alone; one primary CTA; reuse approved patterns. Those patterns are: the Home header (Wordmark, `LanguageSelector`, `AccountEntry`; < 375 px compact selector rule), the sticky bottom action bar with the 52 px pill CTA, form-level alerts and field-error rows from the Keycloak theme design (inputs 52 high, 2 px focus/error stroke, error row gap 6 + 16 px icon), and the `surfaceMuted` inputs and chips.

Frames:
1. **Capture – empty.**
   - Header with a back affordance to Home (designer's choice: back icon button or wordmark link) and the header actions.
   - Step indicator (e.g. "Step 1 of 2").
   - Title "Your kitchen" and a helper line.
   - **Photos** section: an add-photo tile/button ("Add photos"), the rule text (JPG, PNG, WebP or HEIC · up to 15 MB · up to 8 photos) and a shooting tip (e.g. "Shoot from the corners so the whole room is visible").
   - **Measurements** section: Length, Width and Height fields with a unit suffix, the m/cm toggle and a range hint.
   - Bottom bar: Continue disabled plus a hint naming what is missing.
2. **With photos and measurements.** Two thumbnails in a grid (radius 20, alt text), a remove button per tile, the add tile still present, filled fields, the "Saved" status, and Continue enabled.
3. **Uploading.** One tile with progress (bar or ring plus %, `role=progressbar`) on a neutral placeholder (no local preview, because HEIC cannot be previewed), a "Processing…" sub-state after 100 % while the server converts, one queued tile, and a "Saving…" status.
4. **Upload errors.** Tile error variants (too large, unsupported type, too small, failed or storage unavailable) with Retry and Remove. Limit reached: add tile disabled plus a message.
5. **Measurement validation.** Invalid number, out of range with the localized range ("Between 1.00 m and 20.00 m"), and required-on-Continue on all three. Show both units.
6. **Offline.** Alert ("You're offline. What you've saved is safe; reconnect to keep going."), controls disabled, thumbnail placeholders.
7. **Draft expired notice.** Info alert when a stored draft is gone (e.g. "Your previous draft expired after 7 days. Start again.").
8. **360x780 check** in `de` and `fi` for frames 1, 2 and 5 (longest labels, compact selector with `Nederlands`).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update.
  - New `kitchen-projects` and `storage` API modules.
  - The draft-token model (cookie, header, hash, guard, 404 policy).
  - Proxy rules (`bm_draft`, extended CSRF), the BFF start route.
  - MinIO bucket and keys, photo processing, the cleanup sweeper, API endpoints, runtime env, test layering.
- `AGENTS.md`: update with one short "Kitchen drafts" note: the `bm_draft` cookie, the bucket name, how to inspect objects (MinIO console on `MINIO_CONSOLE_PORT`), and the cleanup env.
- `DESIGN.md`: update the asset list (page Capture) and the approved non-token values.
- `docs/user-and-access-model.md`: update.
  - Anonymous drafts are bound to an HttpOnly browser cookie.
  - Expiry is 7 days, sliding (an assumption until now).
  - A signed-in browser still uses the anonymous draft until `login-gate-claim`.
- `docs/technical-discovery.md`: update with the upload-path decision (through the API, presigned rejected), the image pipeline and privacy (including the HEIC decoder and why sharp alone is not enough), and the S3 client.
- `docs/domain-model.md`: update. The Photo metadata fields; Measurements stored in cm.
- `docs/risks-and-open-questions.md`:
  - move "7-day cleanup" from Assumptions to Resolved;
  - add the global-cap-only abuse limits (no per-client limit behind the BFF);
  - add root MinIO credentials in the api;
  - add the HEIC decoder choice and its LGPL/HEVC-patent note;
  - add that L2 is resolved if the proxy reuses `readCookie`.
- `CONSTRAINTS.md`: not needed (does not exist; the rules live in AGENTS.md).

## Implementation Plan

1. Confirm the developer decisions (end of this spec). The orchestrator runs the OpenPencil step in parallel with steps 2-3.
2. Prisma models plus migration, shared types, storage interface, S3 adapter and memory fake, `sharp` processor, token, guard and service, controller, cleanup, with unit and HTTP tests. Then OpenAPI regeneration.
3. Compose/env; a live check of the API with curl against MinIO.
4. After design approval: proxy changes, BFF start route, capture page and components, messages, web unit tests.
5. E2E `capture.spec.ts`, `init.sh` checks, docs, evidence; status `passing`.

## Implementation Tasks

- [x] Developer decisions recorded; design read-back approved (UI tasks blocked until then).
- [x] Prisma `KitchenProject`/`KitchenPhoto` + hand-checked migration (CHECK constraints; HNSW index untouched).
- [x] `ObjectStorage` + S3 adapter (lazy bucket) + memory fake.
- [x] `photo-processor.ts` (sharp: limits, orient, strip, full/thumb) with EXIF/GPS tests.
- [x] HEIC: probe sharp in the api container; else `heic-decode` path (ftyp sniff, header dimension check, raw-to-sharp, single-flight decode); fixtures + generator script; stop-and-report rule (Decision 4a).
- [x] Draft token, guard (404 policy), service, controller (6 routes), measurement validation, capacity cap.
- [x] `DraftCleanupService` (start + interval, storage-first delete, injected clock).
- [x] OpenAPI export; `api-client` regenerated; drift tests green.
- [x] Proxy: `bm_draft` to `x-draft-token`, client header dropped, CSRF extended; BFF start route (idempotent, token stripped).
- [x] Capture page + components from the design; locale-aware measurement parser; XHR upload with progress; offline state; 11 message files.
- [x] Compose/env/init.sh; E2E; docs; PROGRESS; evidence.

## Verification Plan

Use the orchestrator's exported env (`COMPOSE_PROJECT_NAME`, ports). No sudo, no GPU, never read `.env`.

- **Workspace gate:** `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`: exit 0, also offline (`unshare -rn`, `ip link set lo up`). The API tests use the memory storage and a stubbed Prisma, as today.
  - Required API tests:
    - token hash/format;
    - guard 404 for missing, malformed, unknown and expired tokens;
    - foreign photo id 404;
    - measurement boundaries (99/100/2000/2001, 179/180/600/601, null, 3.5, "300");
    - upload 201 and the limit/type/size/small errors with codes;
    - EXIF GPS + orientation stripped and rotated;
    - HEIC: GPS fixture gives a metadata-free JPEG full/thumb; the `irot` fixture is rotated once; the small fixture gives 422; the corrupt fixture and an AVIF give 415; a JPEG renamed to `.heic` is processed as JPEG (sniffing, not the extension);
    - delete compacts positions;
    - capacity 429;
    - cleanup deletes objects, then rows, and keeps rows when storage fails;
    - `expires_at` slides on mutation;
    - the migration SQL contains the CHECKs and no `DROP INDEX`.
  - Required web tests:
    - parser per locale (`3,20`, `3.20`, `1.234,5`, `abc`, cm integers) and the formatter;
    - limits equal the `openapi.json` min/max;
    - proxy (`bm_draft` becomes `x-draft-token`, client `x-draft-token` dropped, CSRF 403 with `bm_draft`);
    - start route (no Origin 403, resume 200 without a create call, create 201 sets an HttpOnly cookie and strips `draftToken`);
    - capture-state reducer;
    - message parity.
- **OpenAPI drift:** `pnpm --filter @bricomission/api openapi:export`, then `git diff --stat packages/api-client`. Only the intended additions appear, and the committed files are regenerated.
- **Stack:** `docker compose up -d --build --wait` (6 healthy); pin check; `ss -ltn` shows 127.0.0.1 only.
- **curl:**
  - create via the API, keeping the token;
  - `GET current` with the token returns 200, and 404 without it or with another token;
  - PUT out-of-range gives 400 `fields`;
  - upload `kitchen-sample.jpg` gives 201; GIF 415; 16 MB 413;
  - upload `kitchen-gps.heic` to the **running api container** gives 201 (proves the decoder works in the runtime image, not only in Vitest); record the decode time;
  - content `thumb` returns `image/jpeg`;
  - through the web, the start route without Origin gives 403, and with `Origin: http://localhost:$WEB_PORT` gives 201 + `Set-Cookie: bm_draft=...; HttpOnly`, with no `draftToken` in the body.
- **MinIO:** `docker compose exec minio mc ...` (or the console). The bucket exists, has no anonymous policy (anonymous GET of an object returns 403), and the expected 2 keys per photo exist. Run `exiftool` or `sharp` metadata on the downloaded `full`: no GPS/EXIF.
- **psql:**
  - `\d kitchen_project` shows the CHECKs and the unique hash;
  - the hash is 32 bytes;
  - no text column holds the token;
  - `catalog_chunk` HNSW index still present.
- **Cleanup:** set `expires_at` in the past for one draft, then `docker compose restart api` (wait for healthy). The rows and objects are gone; the logs show the count only.
- **Failure paths:** `docker compose stop minio` gives upload 503 and the page tile error, while GET current still returns 200; then start it again.
- **E2E:** `pnpm test:e2e`. The new `e2e/capture.spec.ts` (localhost guard) covers Scenarios 1-8 and 10:
  - two uploads + es measurements + reload;
  - one HEIC upload (`kitchen-3.heic`) shows the server thumbnail;
  - HttpOnly / no token in HTML;
  - second context empty;
  - forged header ignored;
  - validation messages;
  - remove;
  - Continue target URL;
  - `setOffline` state;
  - 413/415 tile errors (via a generated oversized buffer and a `.gif`);
  - 390x844 and 360x780 `de`/`fi` overflow and targets.

  All existing specs stay green.
- **init.sh:** exit 0 with the two new Web lines. `bash -n init.sh`.

## Evidence To Capture

- Pinned versions (`sharp`, `@aws-sdk/client-s3`, `@types/multer`) and whether sharp needed `onlyBuiltDependencies`.
- HEIC: the sharp probe result, the chosen decoder with version and license, the decode time in the container, and the fixture generator image version and commands.
- Test names/counts, the OpenAPI diff summary, curl outputs, the MinIO listing and policy check, the psql checks, the metadata check of the stored image, the cleanup proof, the E2E list, and the `./init.sh` tail with exit code.
- Design artifact path and approval date. Deviations go in this spec's Implementation Notes.

## Validator Checklist

- [ ] UI matches `docs/design/kitchen-capture-draft.md`; one primary CTA; no sign-in forced; 11 locales.
- [ ] No draft token in HTML, JS-readable cookies, logs or the DB (hash only). The proxy never forwards a client `x-draft-token`. 404 policy holds for foreign drafts and photos (no IDOR).
- [ ] `@Public()` is used only on the kitchen-draft routes, each guarded by `DraftTokenGuard` (except create). Default-deny is unchanged elsewhere.
- [ ] CSRF: unsafe calls with `bm_draft` and the start route require a same-origin Origin.
- [ ] HEIC/HEIF accepted, decoded server-side by a license-clean offline decoder, rotated once, stored as metadata-free JPEG; type detected by magic bytes.
- [ ] Stored photos are normalized and metadata-free; the original is never stored; the bucket is private; size, type, count and pixel limits are enforced server-side.
- [ ] Measurements are integers in cm with the confirmed ranges in the API, DB and UI; locale-aware input.
- [ ] Draft survives a reload and API/web restarts; the sweeper deletes expired drafts with their objects.
- [ ] Migration keeps the catalog HNSW index; OpenAPI and api-client regenerated, no drift.
- [ ] SW does not cache `/api` or uploads; offline state shown.
- [ ] No Login Gate, ownership, Moodboard or `/health` change. Gates pass. Docs updated. Status `passing`, not `accepted`.

## Risks

- `sharp` native binary on Node 26 / bookworm-slim and under pnpm 10's build-script policy. Fallback: stop and report. Do not ship unprocessed photos.
- HEIC decoding:
  - sharp's prebuilt binary has no HEVC decoder;
  - `heic-decode`/`libheif-js` WASM is slower and memory-heavy (50 MP RGBA is about 200 MB; mitigated by the header check and one decode at a time);
  - libheif and libde265 are LGPL-3.0, used unmodified;
  - HEVC patents are not a concern for a local demo, but must be reviewed before any distribution.
  - If no decoder works, Decision 4a's stop-and-report rule applies.
- The pgsty MinIO fork with AWS SDK v3's default flexible checksums: if PUTs fail, set `requestChecksumCalculation: 'WHEN_REQUIRED'` and record it.
- Upload streaming through the Next route handler: a 413 mid-stream can surface as a network error in the browser. The client pre-check covers the normal case; E2E asserts the designed error either way.
- Abuse limits are global only (one upstream IP behind the BFF). Root MinIO credentials in the api. Both accepted for local MVP use and recorded.
- Prisma `migrate diff` may try to drop the hand-written HNSW index. Remove that statement and test it.
- Feature size: one aggregate, one flow, but API, storage, image pipeline and UI together. If the design step slips, ship the API and storage first behind the same id (UI tasks `blocked`) rather than guessing UI.

## Developer Decisions (2026-11-13)

1. Confirmed: length/width 1.00-20.00 m, height 1.80-6.00 m, whole centimetres.
2. Confirmed: metres by default with an m/cm toggle.
3. Changed: at most 8 photos, 15 MB each, JPEG/PNG/WebP **and HEIC/HEIF**, shortest edge at least 480 px, at most 50 MP. HEIC is decoded server-side and stored as JPEG full + thumbnail; originals are never stored (Decision 4a).
4. Confirmed: expiry 7 days from the last change; the cleanup sweeper is in this feature.
5. Confirmed: Continue goes to `/kitchen-projects/new/moodboard` (404 until `moodboard-selection`).
6. Confirmed: design page "Capture" in `bricomission_B2C_app.fig` with the frames above; the photo rules copy mentions HEIC.

## Design Step Outcome (orchestrator, 2026-11-14)

The developer approved the Capture design (`docs/design/kitchen-capture-draft.md`) with two changes that supersede this spec where they differ:

1. **Measurement keypad.** Length, Width and Height are entered with a custom numeric keypad in a bottom sheet (tabs per field, large display with −/+ 1 cm steps, 12-key pad with the locale decimal separator and backspace, Clear, Next/Done). The phone's on-screen keyboard must never open for these fields. Physical keyboards still work.
2. **The keypad is the only client-side validator.** It accepts only digits and one separator, enforces ranges live and commits only valid values, so the page has no measurement error state. Drop the page-level measurement error UI (invalid / out of range / required-on-Continue) from the scenarios and E2E; keep API validation (400 per-field codes + DB CHECK) as the safety net, shown on the page only as the generic "Not saved: try again in a moment." status.
3. **Photo grid:** 2 flexible columns, 4:3 tiles, gap 16 both axes.

Adjust Scenario 5, the E2E and the unit tests accordingly: test the keypad (digits, separator once, max decimals, backspace/long press, −/+ clamp, tabs keep values, Next/Done disabled while invalid, Close discards an invalid edit, cm mode disables the separator, keyboard input), and assert that no measurement input ever receives focus as a text field (no system keyboard).

## Implementation Notes (implementer, 2026-11-14)

### HEIC decoder outcome (Decision 4a)

- Probe (step 1): in the running api container, `sharp` 0.35.5 (libvips 8.18.7, libheif 1.23.5, `sharp.format.heif.input.fileSuffix` = `['.avif']`) reads the header of `kitchen-gps.heic` (`format heif, compression hevc, 1024x768`) but decoding fails (`source: bad seek ...`). sharp alone is not enough, as expected.
- Chosen path (step 2): `heic-decode` 2.1.0 over `libheif-js` 1.23.5 (WASM bundle with libheif + libde265). License: `heic-decode` is **ISC** (the spec said MIT; ISC is equally permissive), `libheif-js` LGPL-3.0, used unmodified as npm dependencies. No native build, no runtime network; it runs in `node:26.13.1-bookworm-slim`. The WASM bundle is imported lazily on the first HEIC; decodes run one at a time per process (`SerialQueue`). The pinned libvips/libheif fallback image was not needed.
- Measured in the api container (`curl` upload through the API, including decode, encode and two MinIO PUTs): 1024x768 HEIC 0.11 s (first call, includes the WASM load); 12 MP (4032x3024) HEIC 0.49 s, twice. API memory after the 12 MP uploads: 382 MiB.
- Orientation: `kitchen-irot90.heic` (coded 720x960 with `irot`, EXIF orientation 6 still inside) decodes upright to 960x720 and is stored 960x720: rotated exactly once.

### Versions and dependencies

- `sharp` 0.35.5 (Apache-2.0; prebuilt `@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64` 1.3.4). It has no install script, so `pnpm-workspace.yaml` `onlyBuiltDependencies` is unchanged.
- `@aws-sdk/client-s3` 3.1169.0. The pgsty MinIO fork accepted PUT, GET and DeleteObjects; `requestChecksumCalculation`/`responseChecksumValidation` are set to `WHEN_REQUIRED` up front (spec risk), so no checksum issue was observed.
- `multer` 2.5.0 (same version `@nestjs/platform-express` 12.5.0 uses; declared because the api now imports it), `@types/multer` 2.3.0 and `@types/express` 5.0.6 (dev).
- Fixture generator: `debian:trixie-20261104-slim` (not bookworm: trixie has libheif 1.23.6 with the x265 plugin, and `heif-enc` turns EXIF orientation into `irot`), `libheif-examples`/`libheif-plugin-x265` 1.23.6-2~deb13u1, x265 4.1-2, exiftool 13.25; resizing uses the host Node with the api's pinned sharp. Commands in `apps/api/scripts/generate-heic-fixtures.sh` and `apps/api/test/fixtures/heic/SOURCE.md`.

### Deviations and decisions within the spec

1. Error codes: added `photo_missing` (400, no file in the multipart body) to `KitchenDraftErrorCode`. More than 50 MP gives 413 `photo_too_large` (the spec set the limit, not its code). `variant` is required on the content route (400 when missing).
2. Photo delete removes the two objects first, then the row (positions compacted in the same transaction). With MinIO down it answers 503 `storage_unavailable` and keeps the row, so a retry can finish. On upload, only objects already written are cleaned up after a storage failure.
3. Generic HEIF brands `mif1`/`msf1` without an HEVC/AVIF brand are passed to the HEVC decoder and accepted only if it decodes the primary image (else 415).
4. Measurement fields are `<button>` elements (not read-only inputs): no text input exists on the page at all, so the system keyboard can never open. The E2E asserts zero `input`/`textarea`/`contenteditable` (except the hidden file input) and that the active element is never an `INPUT`.
5. Keypad: Close (button, Escape, backdrop) commits every valid edited tab and discards invalid ones; an empty field counts as invalid (Next/Done disabled, per panel 5), so a committed value cannot be cleared back to empty from the keypad. Long press on backspace = 600 ms; hold-to-repeat on −/+ starts after 400 ms and repeats every 80 ms.
6. Save status: the bottom bar shows the save status while saving, after a failure or offline, and "Saved" when Continue is enabled; otherwise it shows the Continue hint (design frame 1: the hint replaces the status). Measurements saved without photos therefore show the hint, not "Saved".
7. Draft-expired notice: the client keeps a non-secret `localStorage` marker (`bm_draft_started`) set when a draft loads or starts; a later 404 with the marker shows the dismissible notice and clears the marker. The token itself stays HttpOnly.
8. Files selected beyond the free photo slots are ignored; the limit message shows once no slot is left. The Retry button's accessible name is "Retry upload" (the design leaves it unnamed).
9. Continue uses `aria-disabled` (not `disabled`) as designed, so the hint stays reachable; Playwright treats `aria-disabled` as disabled, so the E2E uses a dispatched click to prove nothing happens.

### Verification notes

- Scenario 2 DB/MinIO assertions are checked in the E2E through `GET /api/kitchen-projects/drafts/current` (measurements 420/310/260, positions [0,1]) and manually with psql and the S3 API (below); the Playwright container has no psql or MinIO access.
- Scenario 9 (real expiry) is verified manually (psql `expires_at` in the past, `docker compose restart api`, rows and objects gone, GET 404). The E2E simulates the client side (marker present, no live draft) and checks the notice and the new draft on the next save.
- Scenario 8 MinIO stopped: verified with curl (API 503 `storage_unavailable`, 8.0 s before and 3.8 s after limiting the cleanup to objects already written; GET current 200) and in the browser with a temporary two-phase Playwright spec (seed with MinIO up, then with MinIO stopped: draft loads, thumbnail shows the placeholder, a new upload shows the `storage_unavailable` tile with Retry; spec file deleted afterwards). The persistent E2E covers the tile with a routed 503.
