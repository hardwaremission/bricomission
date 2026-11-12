# Progress Log

## Current Verified State

- Repository root: `/home/juanmi/Proyectos/hardwaremission.bricomission`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` checks host prerequisites, validates `feature_list.json`, then runs the compose gate (`docker compose up -d --wait`; postgres, minio, mailpit healthy). Without Docker it skips the gate and exits 0; with an unreachable daemon it exits 1. `pnpm -r lint && pnpm -r test` joins after `api-skeleton`.
- Last accepted feature: `local-ai-gpu-spike` (validator ACCEPT, 2026-11-12); before it `infra-compose-core`
- Current next ready feature: `api-skeleton`
- Local AI stack: opt-in compose profiles `ai` (`llama-server`, `comfyui`) and `ai-fetch` (weights). Both run on the RX 9070 XT with ROCm in Docker. GPU jobs must be serialized (see `docs/spikes/local-ai-gpu-spike.md`).
- Current blockers: none for infra. pnpm not installed (enable with `corepack enable` during `api-skeleton`). Agent shells started before the docker group was added must run docker through `newgrp docker` (no `sg` on this host).
- Last verified at: 2026-11-12 (`./init.sh` exit 0 with the stack healthy; feature list valid)

## Session Log

### Session 001

- Date: 2026-11-12
- Goal: Create the minimal startup harness (Phase 2, `/harness-starter`).
- Completed: `AGENTS.md`, `init.sh` (pre-bootstrap variant, bash), `PROGRESS.md`, `feature_list.json` (34 features ordered by the demo path: infrastructure -> capture -> AI -> outcomes -> marketplace -> admin -> breadth).
- Verification run: JSON validation script (required fields, unique ids, existing non-self dependencies, no forward references), `chmod +x init.sh`, `./init.sh`.
- Evidence captured: `features: 34 OK, deps acyclic and ordered`; `./init.sh` reported git, node 26, python3, ffmpeg, GPU devices OK; pnpm, docker, docker compose missing.
- Files or artifacts updated: `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`, `CLAUDE.md` (imports `AGENTS.md`), project doc phase status.
- Known risk or unresolved issue: full PRD scope (34 features) by 2026-11-22; GPU stack on RDNA4 unproven until `local-ai-gpu-spike`.
- Next best step: install Docker, then `/feature-flow infra-compose-core`, followed immediately by `local-ai-gpu-spike`.

### Session 002

- Date: 2026-11-12
- Goal: implement `infra-compose-core` (spec `docs/specs/infra-compose-core.md`) up to the developer hand-off.
- Completed: `compose.yaml` (postgres pgvector, minio, mailpit; pinned tags, named volumes, healthchecks, 127.0.0.1 overridable ports, env defaults), `.env.example`, `infra/postgres/initdb/01-extensions.sql`, `scripts/install-host-prereqs.sh` (mode 755; `--check`, `--help`, install mode), `init.sh` compose gate, `AGENTS.md` startup step, `docs/technical-discovery.md` optional data-root note, `docs/risks-and-open-questions.md` MinIO finding.
- Verification run: `bash -n` on both scripts (exit 0); helper `--help` (exit 0) and `--check` (8 items missing, exit 1, no sudo); `./init.sh` (Scenario 6 message, exit 0); `git check-ignore` (`.env` ignored, `.env.example` not); corrected pin check (all tagged, no `latest`); registry manifest checks for the image tags.
- Failed / not run: spec grep for unpinned images is faulty (matches pinned lines); replaced by an awk check documented in the spec. The planned MinIO tags (primary and fallback) return 401: `minio/minio` no longer exists on Docker Hub. No Docker runtime checks ran (Docker not installed). `.env` was not read or modified. No sudo was run.
- MinIO follow-up: developer chose `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`; `compose.yaml` updated, healthcheck switched to curl on `/minio/health/live` (curl present per image config, to confirm at runtime); MinIO item moved to Resolved.
- Runtime verification (after the developer installed Docker; agent used `newgrp docker`, no sudo): `--check` all 9 ok; `docker compose config -q` and `up -d --wait` exit 0, 3 services healthy; pgvector 0.8.1; ports 9001/8025/9000-live return 200; data survived `down`/`up`; `./init.sh` exit 0 (Scenario 5), exit 1 on unreachable daemon (Scenario 7), recovers a stopped minio (Scenario 8). MinIO curl healthcheck confirmed (`/usr/bin/curl` in image). Digests recorded in `feature_list.json`. Status `passing`. Stack left running.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran scenarios 1-9 itself, confirmed 127.0.0.1-only bindings and digests; minor doc findings (data NVMe wording) fixed by the orchestrator. Status `accepted`.
- Next best step: `/feature-flow local-ai-gpu-spike`.

### Session 003

- Date: 2026-11-12
- Goal: implement `local-ai-gpu-spike` (spec `docs/specs/local-ai-gpu-spike.md`), headless, in worktree `../hardwaremission.bricomission-worktrees/local-ai-gpu-spike`.
- Completed:
  - `compose.yaml`: `llama-server` and `comfyui` in profile `ai`, `ai-fetch` in profile `ai-fetch`, 4 new volumes, ports on 127.0.0.1 with env overrides.
  - `infra/comfyui/Dockerfile`: ROCm 10.1 / torch 2.14 base, ComfyUI v0.45.3, controlnet_aux pinned.
  - `infra/comfyui/workflows/sdxl-controlnet-{depth,canny}.json`.
  - `infra/ai/fetch-models.sh`: pinned HF commits, resumable, idempotent.
  - Public-domain sample photo with `SOURCE.md`.
  - `scripts/ai-spike/{vram-sample,llm-bench,comfy-run}.sh`.
  - Report `docs/spikes/local-ai-gpu-spike.md` with renders.
  - Doc updates: ADR 0001 (validated plus a Validation section), risks, technical-discovery, AGENTS.md (AI Services), `.env.example`, `init.sh` hints.
- Verification run:
  - `bash -n` on all scripts; `docker compose config -q`, with and without the profiles; awk pin check; Dockerfile `FROM` pinned.
  - Scenarios 1-8 as written, plus `--profile ai down` then `up -d --wait` (16 s, no re-download).
  - `./init.sh` exit 0, 3 services.
- Results:
  - LLM: ROCm `server-rocm-b12316` with Qwen3-30B-A3B-Instruct-2507 Q4_K_M. Prompt 771 tok/s, generation 25.5 tok/s, TTFT 2.6 s on a 2k-token prompt. JSON valid in 12/12 runs. VRAM 3.2 GB peak. Vulkan reaches 358 / 24.1 tok/s.
  - ComfyUI: SDXL RealVisXL V5 + ControlNet at 1216x832 with 25 steps. Depth: 16.9 s cold, 8.5 s warm. Canny: 16.8 s cold, 9.0 s warm.
  - Co-residency: serialization required. ComfyUI peaks at about 15 GB over the desktop baseline. Running both at once did not OOM but slowed each by about 25 %.
  - `POST /free` releases VRAM within 3 s. Stopping llama takes 0.6 s and starting it about 5.5 s.
  - No fallbacks were needed (no SD 1.5, no Vulkan, no `HSA_OVERRIDE_GFX_VERSION`).
- Failed / not run: a cold-page-cache llama load time was not measured (needs root to drop caches). No sudo was run and `.env` was not read.
- State left: GPU stack stopped (volumes kept: about 30.6 GB of weights). Core stack healthy.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran scenarios 1-6 on the GPU with matching numbers (25.8 tok/s gen, depth render warm 8.48 s, VRAM +3.2 GB LLM / +15 GB ComfyUI: serialization required). Low findings fixed by the orchestrator: stop hints now name `llama-server comfyui` (a bare `--profile ai stop/down` also stops the core stack); bench comment says ~2k tokens. Deferred: pip lock for the ComfyUI image, `pull_policy: build` for fresh hosts, host-specific `RENDER_GID` default. Status `accepted`.
- Next best step: `/feature-flow api-skeleton`.
- Known risk: ComfyUI takes all free VRAM during renders. The `gpu-job-broker` must free or stop the LLM, or pause chat, around image jobs. `RENDER_GID` default 987 is host-specific.
- Next best step: independent validation (`feature-validator`) of `local-ai-gpu-spike`.
