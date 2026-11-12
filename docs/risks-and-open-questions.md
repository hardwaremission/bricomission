# Risks and Open Questions

## Blocking Next Phase

None. Discovery is sufficient to derive the harness (`/harness-starter`).

## Implementation-Time Questions

- Exact MoE model and quantization (Qwen3-30B-A3B Q4 vs alternatives): decided by the Day-1 spike.
- llama.cpp backend: ROCm vs Vulkan on gfx1201, whichever is stable in Docker.
- SDXL base checkpoint and ControlNet models (Depth/Canny); fall back to SD 1.5 if SDXL is too slow.
- Embedding model for the RAG index.
- Job queue: BullMQ + Redis vs PostgreSQL-based queue.
- Which Catalog PDFs are ingested for the demo, and their licensing for a public video.
- Contract template legal wording (Spanish), VAT handling in totals.
- Platform rating shown on anonymous Bids: source of ratings in the MVP (seeded demo data).

## Resolved

- MinIO image/licensing (2026-11-12, `infra-compose-core`, developer decision): use `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, the Pigsty-maintained community fork (AGPLv3). Rationale: the official `minio/minio` image is no longer pullable (Docker Hub repository gone, `quay.io/minio/minio` denies anonymous pulls); the fork keeps the same S3 API and web console; it runs unmodified as a separate local service that BricoMission reaches only over the S3 protocol, so the AGPL obligations do not extend to our code. Swapping to another S3-compatible server later is an image change only.

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
- Unclaimed anonymous drafts are deleted after 7 days.
- Ratings for Companies are seeded demo data.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Full PRD scope in 10 days | Demo incomplete | Harness orders features by the demo path; breadth (locales, SSO, polish) last |
| ROCm on RDNA4 inside containers unstable | No local AI | Day-1 spike; Vulkan backend for llama.cpp; native exception documented if needed |
| SDXL + ControlNet too slow or VRAM-tight with the LLM | Slow Renders in video | GPU serialization; SD 1.5 fallback; pre-generate demo Renders |
| RAG returns wrong or no price | Wrong Budget | Cited-price verification; reject unverified Line Items |
| Local LLM produces invalid JSON | Broken budget flow | Schema-constrained decoding (llama.cpp JSON schema / grammar), retries |
| Keycloak + Google SSO setup time | Delay | Password login first; Google SSO late feature |
| Disk space for models | Stack fails | Optional: move Docker data-root and model weights to a data NVMe (see docs/technical-discovery.md); otherwise monitor free space on the 465 GB system disk |

## Research Tasks

1. Day-1 spike: llama-server MoE (experts in RAM) + ComfyUI SDXL/ControlNet in Docker on the RX 9070 XT; record VRAM, tokens/s, seconds/Render.
2. Verify llama.cpp structured output with the chosen model.
3. Confirm Catalog PDFs are parseable (text layer vs scanned).
