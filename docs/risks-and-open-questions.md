# Risks and Open Questions

## Blocking Next Phase

None. Discovery is sufficient to derive the harness (`/harness-starter`).

## Implementation-Time Questions

- Which Catalog PDFs are ingested for the demo, and their licensing for a public video.
- Contract template legal wording (Spanish), VAT handling in totals.
- Platform rating shown on anonymous Bids: source of ratings in the MVP (seeded demo data).

## Resolved

- Keycloak locale precedence (2026-11-13, `keycloak-login-theme`, developer decision: option a). A stored Keycloak account `locale` beats `ui_locales` and `kc_locale` on `/auth`, so the theme's register page stores no locale and new accounts never get one; `ui_locales` (the app language) decides every Keycloak page and the code email. The per-account preference lives in the app (`language-preference-account`), which must not write the Keycloak `locale` attribute. Rejected: syncing the attribute from the app (b), a custom `LocaleSelectorProvider` (c).
- Embedding model for the RAG index (2026-11-13, `catalog-rag-ingestion`): `Qwen/Qwen3-Embedding-0.6B-GGUF` Q8_0, 1024 dimensions, CPU-only in the llama.cpp `server-b12316` image (no VRAM use). bge-m3 Q8_0 is the same-dimension fallback. See ADR 0004.
- LLM model and quantization (2026-11-12, `local-ai-gpu-spike`): `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` Q4_K_M, all experts in RAM (`--n-cpu-moe 48`). 3.2 GB VRAM peak, 25.5 tok/s generation, 3/3 valid schema-constrained JSON. See `docs/spikes/local-ai-gpu-spike.md`.
- llama.cpp backend (2026-11-12, `local-ai-gpu-spike`): ROCm image `server-rocm-b12316`, native gfx1201. Vulkan works too, but prompt processing is half as fast (358 vs 771 tok/s).
- SDXL checkpoint and ControlNet models (2026-11-12, `local-ai-gpu-spike`): RealVisXL V5.0 fp16 with `diffusers/controlnet-{depth,canny}-sdxl-1.0` fp16, plus the Depth Anything V2 Small annotator. Warm render about 8.5-9 s at 1216x832 with 25 steps. No SD 1.5 fallback needed.
- Job queue (2026-11-13, `gpu-job-broker`): in-process, in-memory FIFO scheduler in `apps/api` (`GpuJobBrokerService`). One API instance and one GPU; jobs are short and tied to a live SSE client. No Redis container, no migration, works offline. Callers depend on the `GpuJobBroker` interface, so a durable backend can replace it. See `docs/technical-discovery.md` (GPU Serialization).
- MinIO image/licensing (2026-11-12, `infra-compose-core`, developer decision): use `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, the Pigsty-maintained community fork (AGPLv3). Rationale: the official `minio/minio` image is no longer pullable (Docker Hub repository gone, `quay.io/minio/minio` denies anonymous pulls); the fork keeps the same S3 API and web console; it runs unmodified as a separate local service that BricoMission reaches only over the S3 protocol, so the AGPL obligations do not extend to our code. Swapping to another S3-compatible server later is an image change only.

- Email OTP provider (2026-11-13, `keycloak-realm-roles`): Keycloak 26.8.2 core ships no email-code login authenticator (no matching `AuthenticatorFactory` in the image, and `authenticator-providers` lists only the provider's ids). `infra/keycloak/Dockerfile` adds `mesutpiskin/keycloak-2fa-email-authenticator` v26.7.2. Asset: `keycloak-2fa-email-authenticator-v26.7.2-KC26.8.2.jar`, Apache-2.0, sha256 `0e3dd714f0f20e7a1cd26cbe721fc12bef3be64c4c0abb221d9521d5331061fc`, from the GitHub release. It is fetched at build time and checked with `sha256sum -c`. Provider id `email-authenticator-no-enrollment`. Keycloak warns that the provider implements internal SPIs, so recheck it on every Keycloak upgrade, and pick the jar built for the new Keycloak version.

- Anonymous draft expiry and cleanup (2026-11-13, developer decision; built in `kitchen-capture-draft`): drafts expire 7 days after their last change (sliding), and an in-API sweeper deletes expired drafts and their MinIO objects on start and hourly.
- HEIC/HEIF decoder (2026-11-14, `kitchen-capture-draft`): the probe showed that `sharp` 0.35.5 (libvips 8.18.7, libheif 1.23.5) in the api image reads an iPhone HEIC header but cannot decode HEVC pixels (its prebuilt libheif has AVIF only). The API decodes HEIC with `heic-decode` 2.1.0 (ISC) over `libheif-js` 1.23.5 (WASM libheif + libde265, LGPL-3.0, used unmodified as npm dependencies; no native build, works offline). Measured in the api container: a 12 MP HEIC upload takes about 0.5 s end to end. HEVC is patent-encumbered: fine for the local demo, review before any distribution.
- Style Gallery source (2026-11-14, `moodboard-selection`): generated once with RealVisXL V5.0 (local SDXL) and committed as metadata-free JPEGs; never generated at runtime. Licence checked 2026-11-14 on the model page: `openrail++` (CreativeML Open RAIL++-M), no claim on outputs; use in the app and the public demo video is allowed (see `apps/api/assets/style-gallery/SOURCE.md`).
- Web proxy cookie parsing (L2 below): resolved in `kitchen-capture-draft`; `api-proxy.ts` now uses `readCookie` for both `bm_session` and `bm_draft`.

## Later / Not MVP

- Apple SSO, real SMS OTP, advanced e-signature providers.
- Zone-based Dossier distribution.
- Professional self-service Company membership changes.
- Native iOS app, LiDAR, native push.
- Renovation types beyond kitchens.

## Assumptions

- Developer curates Catalogs with NotebookLM offline and supplies the PDFs.
- Platform Commission default 5 %; minimum delay penalty 50 €/day; both editable by the Administrator.
- Bidding Window 15 days by default; the Administrator can shorten it for the demo.
- UI strings translated to 11 locales by the agent; English is canonical; chat answers in the user's locale.
- Ratings for Companies are seeded demo data.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Full PRD scope in 10 days | Demo incomplete | Harness orders features by the demo path; breadth (locales, SSO, polish) last |
| ROCm on RDNA4 inside containers unstable | No local AI | Retired by the 2026-11-12 spike: llama.cpp (ROCm b12316) and ComfyUI (rocm/pytorch ROCm 10.1, torch 2.14) both run natively on gfx1201 in Docker with no `HSA_OVERRIDE_GFX_VERSION`. Vulkan llama.cpp is a tested fallback |
| SDXL + ControlNet too slow or VRAM-tight with the LLM | Slow Renders in video | Speed is fine (about 8.5 s warm, 17-20 s cold). VRAM is tight: ComfyUI alone peaks at about 15 GB over the desktop baseline. Concurrent LLM + render did not OOM but slowed both by about 25 %, so serialization is required: the `gpu-job-broker` runs renders alone and holds chat in the queue meanwhile (no unload by default; `GpuResidencyHook` is the plug-in point for `POST /free` or an LLM stop if real renders need it). Pre-generate demo Renders as a backup |
| RAG returns wrong or no price | Wrong Budget | Cited-price verification; reject unverified Line Items |
| Local LLM produces invalid JSON | Broken budget flow | Schema-constrained decoding (llama.cpp JSON schema / grammar), retries |
| Keycloak + Google SSO setup time | Delay | Password login first; Google SSO late feature |
| In-memory GPU jobs lost on API restart (`gpu-job-broker`) | Queued/running Renders or chat answers vanish; clients get 404 | Accepted for the single-instance MVP: clients retry on 404; product features persist their own outputs. Swap the `GpuJobBroker` implementation for a durable queue if restarts become common |
| Keycloak theme overrides Keycloak and provider templates (`keycloak-login-theme`) | A Keycloak or email-OTP provider upgrade changes template variables or message keys; pages break or show English | Recheck `infra/keycloak/themes/bricomission` on every upgrade: run `pnpm test:e2e` (keycloak-theme spec) and `./scripts/keycloak-smoke.sh`. The theme also overrides the generic Keycloak key `expiredActionTokenSessionExistsMessage` with the expired-code copy (no action-token flows are enabled today) |
| Default role `user` on every self-registered account | When `professional-registration` adds Professional sign-up, those accounts would also get `user` | That feature must use its own registration path or remove `user` for Professionals; seeded accounts are unaffected (imports do not apply default roles) |
| The web container holds database credentials (`homeowner-password-login`) | A web compromise reaches every table, not only `web_session` | Accepted for local MVP use (same superuser as the api). Hardening: a dedicated PostgreSQL role limited to schema `web_session` |
| Dev default `WEB_SESSION_KEY` and `BM_WEB_CLIENT_SECRET` are public in the repo | Anyone with the database can decrypt session tokens; anyone can use the client secret | Local use only. Any shared or hosted deployment must set both from secrets (`openssl rand -base64 32` for the key); changing the key signs every web session out |
| Cookies ignore ports | Parallel worktrees on `localhost` share the `bm_session` cookie name, so signing in on one port replaces the other's cookie (and the other web treats it as unknown and clears it) | Sign in to one worktree at a time, or use separate browser profiles; a per-port cookie name can be added if it becomes a problem |
| Kitchen draft abuse limits are global only (`kitchen-capture-draft`) | Every browser reaches the API from the web container's IP, so there is no per-client limit; one client can use up the `DRAFT_MAX_OPEN` (2000) cap and block new drafts (429) | Accepted for the local MVP. Per-draft limits (8 photos, 15 MB, 50 MP) still apply. Hardening: a per-client limit in the web BFF (cookie or IP from a trusted proxy header) |
| The api uses the MinIO root credentials (`kitchen-capture-draft`) | An api compromise has full MinIO admin rights | Accepted for local MVP use; `admin-service-endpoints` moves to a dedicated access key with a bucket-scoped policy, editable by the Administrator |
| Code email logo is a data-URI PNG (`brand-logo-animation`) | Some clients (Gmail, Outlook) block data-URI images, and inline base64 can raise spam scores | Accepted: the `alt` text is styled 22/28 bold ink as the text fallback and the plain-text part carries the code; hosted images are not possible offline and CID needs a custom Keycloak SPI. Revisit before any real mail delivery |
| Welcome splash replays per tab (`brand-logo-animation`) | `sessionStorage` is per tab, so every new tab or window plays it again (up to ~3.2 s, skippable with a tap or key) | Accepted by the developer (2026-11-14); reloads, client navigation and Keycloak round trips in the same tab do not replay it |
| Style Gallery looks AI-generated (`moodboard-selection`) | Small artifacts (odd chair legs, repeated details) can look artificial in the demo | Developer approval of the contact sheet (`design/openpencil/moodboard-selection/gallery-contact-sheet.png`) before commit; regenerate single ids with `scripts/style-gallery/generate.sh <id>` |
| Style Gallery assets size | About 3.2 MB of JPEGs in git and in the api image | Accepted; full images capped at 1280 px (q82), thumbs 512 px (q80) |
| No "My Kitchen Projects" list (`login-gate-claim`) | A Homeowner finds a claimed project again only by its URL (`/kitchen-projects/<id>`) | Accepted for this slice (OQ-7); a later feature adds `GET /kitchen-projects` and a list |
| Orphaned claimed projects (`login-gate-claim`) | Deleting a Keycloak user leaves its Kitchen Projects (rows and MinIO objects) owned by a `sub` nobody holds | Accepted for the MVP; `admin-user-management` should delete or reassign them |
| Owner key is the Keycloak `sub` (`login-gate-claim`) | If `google-sso-login` links accounts in a way that yields a different `sub`, earlier projects are not visible to the linked account | `google-sso-login` must link the Google identity to the existing Keycloak user (same `sub`), or migrate `owner_sub` |
| Disk space for models | Stack fails | Optional: move Docker data-root and model weights to a data NVMe (see docs/technical-discovery.md); otherwise monitor free space on the 465 GB system disk |

## Research Tasks

1. Done 2026-11-12: Day-1 spike (`docs/spikes/local-ai-gpu-spike.md`).
2. Done 2026-11-12: llama.cpp structured output verified (json_schema, 3/3 valid).
3. Confirm Catalog PDFs are parseable (text layer vs scanned): detection implemented in `catalog-rag-ingestion` (pages with fewer than 20 non-whitespace characters are skipped with a warning); checking the real partner PDFs is pending until the developer supplies them.

### Web auth hardening follow-ups (validator notes, homeowner-password-login, 2026-11-13; optional)

- L2: resolved in `kitchen-capture-draft` (`api-proxy.ts` uses `readCookie`).
- L3: a callback that replaces an older session in the same browser deletes the old row but does not end that Keycloak SSO session over the backchannel.
- L4: single-flight refresh is per process; revisit if the realm enables refresh-token rotation (`revokeRefreshToken`).

### Upload hardening follow-up (validator note, kitchen-capture-draft, 2026-11-14; optional)

- L1: HEIC decodes are serialized, but JPEG/PNG/WebP decodes have no per-process concurrency limit and multer buffers up to 15 MB per request in memory. Many parallel near-50 MP uploads could raise API memory; add a small sharp concurrency limit before any shared deployment.
