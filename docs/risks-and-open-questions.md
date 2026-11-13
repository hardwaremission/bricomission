# Risks and Open Questions

## Blocking Next Phase

None. Discovery is sufficient to derive the harness (`/harness-starter`).

## Implementation-Time Questions

- Embedding model for the RAG index.
- Which Catalog PDFs are ingested for the demo, and their licensing for a public video.
- Contract template legal wording (Spanish), VAT handling in totals.
- Platform rating shown on anonymous Bids: source of ratings in the MVP (seeded demo data).

## Resolved

- LLM model and quantization (2026-11-12, `local-ai-gpu-spike`): `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` Q4_K_M, all experts in RAM (`--n-cpu-moe 48`). 3.2 GB VRAM peak, 25.5 tok/s generation, 3/3 valid schema-constrained JSON. See `docs/spikes/local-ai-gpu-spike.md`.
- llama.cpp backend (2026-11-12, `local-ai-gpu-spike`): ROCm image `server-rocm-b12316`, native gfx1201. Vulkan works too, but prompt processing is half as fast (358 vs 771 tok/s).
- SDXL checkpoint and ControlNet models (2026-11-12, `local-ai-gpu-spike`): RealVisXL V5.0 fp16 with `diffusers/controlnet-{depth,canny}-sdxl-1.0` fp16, plus the Depth Anything V2 Small annotator. Warm render about 8.5-9 s at 1216x832 with 25 steps. No SD 1.5 fallback needed.
- Job queue (2026-11-13, `gpu-job-broker`): in-process, in-memory FIFO scheduler in `apps/api` (`GpuJobBrokerService`). One API instance and one GPU; jobs are short and tied to a live SSE client. No Redis container, no migration, works offline. Callers depend on the `GpuJobBroker` interface, so a durable backend can replace it. See `docs/technical-discovery.md` (GPU Serialization).
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
| ROCm on RDNA4 inside containers unstable | No local AI | Retired by the 2026-11-12 spike: llama.cpp (ROCm b12316) and ComfyUI (rocm/pytorch ROCm 10.1, torch 2.14) both run natively on gfx1201 in Docker with no `HSA_OVERRIDE_GFX_VERSION`. Vulkan llama.cpp is a tested fallback |
| SDXL + ControlNet too slow or VRAM-tight with the LLM | Slow Renders in video | Speed is fine (about 8.5 s warm, 17-20 s cold). VRAM is tight: ComfyUI alone peaks at about 15 GB over the desktop baseline. Concurrent LLM + render did not OOM but slowed both by about 25 %, so serialization is required: the `gpu-job-broker` runs renders alone and holds chat in the queue meanwhile (no unload by default; `GpuResidencyHook` is the plug-in point for `POST /free` or an LLM stop if real renders need it). Pre-generate demo Renders as a backup |
| RAG returns wrong or no price | Wrong Budget | Cited-price verification; reject unverified Line Items |
| Local LLM produces invalid JSON | Broken budget flow | Schema-constrained decoding (llama.cpp JSON schema / grammar), retries |
| Keycloak + Google SSO setup time | Delay | Password login first; Google SSO late feature |
| In-memory GPU jobs lost on API restart (`gpu-job-broker`) | Queued/running Renders or chat answers vanish; clients get 404 | Accepted for the single-instance MVP: clients retry on 404; product features persist their own outputs. Swap the `GpuJobBroker` implementation for a durable queue if restarts become common |
| Disk space for models | Stack fails | Optional: move Docker data-root and model weights to a data NVMe (see docs/technical-discovery.md); otherwise monitor free space on the 465 GB system disk |

## Research Tasks

1. Done 2026-11-12: Day-1 spike (`docs/spikes/local-ai-gpu-spike.md`).
2. Done 2026-11-12: llama.cpp structured output verified (json_schema, 3/3 valid).
3. Confirm Catalog PDFs are parseable (text layer vs scanned).
