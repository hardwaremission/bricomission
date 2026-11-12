# Feature Implementation Spec: Local MoE LLM and SDXL ControlNet run on the GPU in containers

## Source Feature

- `id`: local-ai-gpu-spike
- `area`: ai-infrastructure
- `depends_on`: infra-compose-core (accepted)
- `status`: not_started at planning time (2026-11-12). The planner sets it to `in_progress`.
- `source`: `feature_list.json`

## Goal

Prove that the local AI stack runs in Docker on the RX 9070 XT (gfx1201, RDNA4), and measure it. Two GPU services join `compose.yaml` behind an opt-in profile:

- `llama-server`: llama.cpp serving a MoE model, with the experts in system RAM (ADR 0001).
- `comfyui`: ComfyUI running SDXL + ControlNet Depth/Canny.

A measurement report records VRAM, tokens/s and seconds per image, plus whether both services fit in VRAM at the same time. ADR 0001 gets its validation result. This is a spike: the output is compose services, small measurement scripts, workflow JSON and a report. There is no application code.

## Non-Goals

- API code, AI adapters, the GPU job broker, queueing and SSE (feature `gpu-job-broker`).
- Embedding model and RAG (feature `catalog-rag-ingestion`). Prompt engineering for Budgets.
- Running GPU services from the `./init.sh` default gate. Model downloads in `init.sh`.
- Installing ROCm or anything else on the host, and running `sudo`.
- A native (non-Docker) inference path. If containers fail, report a block; do not install natively.
- Avalon, Ollama, cloud endpoints, Whisper.
- Tuning image quality beyond "the geometry is recognisable and the room looks like a kitchen".

## Headless Run Context (binding for the implementer)

- No human is available. Never run `sudo`. If a step needs a human (host package, driver, group membership, a gated model licence), STOP. Set the feature to `blocked`, then report the exact commands and the reason.
- Docker is reachable. The environment already exports `COMPOSE_PROJECT_NAME=local-ai-gpu-spike`, `POSTGRES_PORT=5533`, `MINIO_API_PORT=9100`, `MINIO_CONSOLE_PORT=9101`, `MAILPIT_UI_PORT=8125`, `MAILPIT_SMTP_PORT=1125`. Do not unset or override them.
- This is the only GPU feature running now, so the GPU is yours. Nothing else should hold VRAM except the desktop (~1.3 GB).
- Never read, print or modify `.env`.
- Expect large downloads (~35-45 GB of weights, plus 10-25 GB of images). Before the first pull, check `df -h "$(docker info -f '{{.DockerRootDir}}')"`. If less than 100 GB is free, STOP and report.

## Job Story

When I build the Render and Budget features,
I want proof that the chosen local models run on this GPU inside containers, with measured VRAM and speed,
so the job broker and the demo plan rest on real numbers, not guesses.

## Acceptance Scenarios

### Scenario 1: Default gate unchanged
Given the repo after this feature
When `./init.sh` runs
Then it starts and checks only postgres, minio and mailpit, and exits 0. No model download or GPU load happens. It prints the hint `docker compose --profile ai up -d --wait`.

### Scenario 2: Models fetched into named volumes
When `docker compose --profile ai-fetch run --rm ai-fetch` runs
Then every required file from the Model Matrix is in its volume with the expected size. Running it a second time downloads nothing (it prints "present, skipping" for each file).

### Scenario 3: AI profile healthy
When `docker compose --profile ai up -d --wait --wait-timeout 900` runs
Then it exits 0. `llama-server` and `comfyui` report `healthy`. Both publish ports only on `127.0.0.1` (`LLAMA_PORT`, default 8080; `COMFYUI_PORT`, default 8188).

### Scenario 4: GPU is really used
Given the AI profile is healthy
Then the `llama-server` logs name the GPU device: ROCm `gfx1201`, or the Vulkan `AMD Radeon RX 9070 XT (RADV ...)`. They also show the non-expert layers offloaded to it. `curl -s 127.0.0.1:${COMFYUI_PORT:-8188}/system_stats` lists a ROCm/HIP device, not `cpu`.

### Scenario 5: Chat completion with schema-constrained JSON
When `scripts/ai-spike/llm-bench.sh` sends `/v1/chat/completions` with `response_format: {"type":"json_schema", ...}` using the sample Line Item extraction schema
Then the response content parses with `json.loads` and passes the stdlib checks: required keys, types, `quantity > 0`, no extra top-level keys. It does this in 3 of 3 runs. The script also prints prompt and generation tokens/s from `timings`.

### Scenario 6: SDXL + ControlNet Depth render
When `scripts/ai-spike/comfy-run.sh depth infra/ai/samples/kitchen-sample.jpg` runs
Then ComfyUI returns an image, saved as `docs/spikes/assets/render-depth.jpg`. The walls, window and countertop line of the sample photo are visibly preserved (a side-by-side check by the implementer, written in the report). The script prints the cold and warm seconds per image.

### Scenario 7: ControlNet Canny render
Same as Scenario 6, using `canny` (core `Canny` node), saved as `docs/spikes/assets/render-canny.jpg`.

### Scenario 8: VRAM co-residency measured
When `scripts/ai-spike/vram-sample.sh` samples during: baseline, LLM only, ComfyUI only (after a render, models cached), and both loaded during a render plus a concurrent chat request
Then the report has the peak VRAM (absolute and over the baseline) for each phase. It states one of two outcomes: "co-resident OK" (both under ~14.5 GB over the desktop baseline, no OOM), or "serialization required". In the second case it records the unload mechanism that works (`POST /free` on ComfyUI, `docker compose stop llama-server`) and the reload times.

### Scenario 9: Results recorded
Then `docs/spikes/local-ai-gpu-spike.md` holds all numbers and decisions. `PROGRESS.md` has a session entry with the summary. ADR 0001's Status and a new Validation section reflect the outcome.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`: Compose rules, GPU budget, bash only, never sudo, subagents never commit.
- `PROGRESS.md`: `infra-compose-core` accepted; this feature is next; agents use docker via `newgrp docker` on the main checkout (Docker is reachable in this run).
- `feature_list.json`: feature entry and verification list.
- `compose.yaml`: 3 services; no `name:`; `${VAR:-default}` ports bound to 127.0.0.1; healthchecks with 5s interval; named volumes.
- `.env.example`: one commented line per variable; defaults equal those in compose.
- `init.sh`: the compose gate runs `docker compose config -q` and `up -d --wait --wait-timeout 180` without profiles.
- `docs/adr/0001-local-llm-moe-llama-cpp.md`: target Qwen3-30B-A3B Q4, `--n-cpu-moe`; status "pending validation by the Day-1 spike".
- `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`: open questions on model/quant, backend and checkpoint; GPU devices `/dev/kfd` + `/dev/dri`.
- Project doc §1.4: ~14.5 GB free VRAM; SDXL+CN fp16 ~8-10 GB; the GTT/swap overflow is not viable for the demo; ROCm >= 6.4 in images, Vulkan as the fallback.
- `.gitignore`: covers `.env*` and `presentation/out/`.
- There are no sample images in the repo (glob for jpg/png/webp is empty). `infra/` only has postgres initdb.

### Not Inspected / Unknown

- Which llama.cpp build tags exist on `ghcr.io/ggml-org/llama.cpp` today, and whether the ROCm image includes gfx1201. Verify with `docker manifest inspect`.
- Current `rocm/pytorch` tags. Exact Hugging Face filenames and sizes. Verify with `curl -sIL`.
- Host render group GID (`getent group render`).

## Technical Approach

### Compose profiles (decision)

- `ai`: `llama-server`, `comfyui`. Started explicitly with `docker compose --profile ai up -d --wait`.
- `ai-fetch`: one-shot `ai-fetch` service (`restart: "no"`) that downloads weights into the volumes.
- `./init.sh` keeps running the gate without profiles, so it never pulls models or touches the GPU. `docker compose config -q` still validates the whole file. Stop the AI services with `docker compose --profile ai stop` or `down`; always pass the profile.

### Model Matrix (primary, then fallback)

| Use | Primary | Fallback |
| --- | --- | --- |
| LLM | `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` / `Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf` (~18.6 GB; non-thinking, better for JSON) | `Qwen/Qwen3-30B-A3B-GGUF` Q4_K_M with `/no_think` |
| SDXL checkpoint | `SG161222/RealVisXL_V5.0` / `RealVisXL_V5.0_fp16.safetensors` (photoreal) | `stabilityai/stable-diffusion-xl-base-1.0` / `sd_xl_base_1.0.safetensors` |
| CN Depth | `diffusers/controlnet-depth-sdxl-1.0` / `diffusion_pytorch_model.fp16.safetensors` -> `controlnet/sdxl-depth.safetensors` | `xinsir/controlnet-union-sdxl-1.0` |
| CN Canny | `diffusers/controlnet-canny-sdxl-1.0` / `diffusion_pytorch_model.fp16.safetensors` -> `controlnet/sdxl-canny.safetensors` | same union model |
| Depth annotator | Depth Anything V2 Small (path expected by the pinned `comfyui_controlnet_aux`) | let the node download it on the first run, and record that offline mode needs the volume |
| SD 1.5 fallback (fetch only if triggered) | `stable-diffusion-v1-5/stable-diffusion-v1-5` (`v1-5-pruned-emaonly.safetensors`) + `lllyasviel/control_v11f1p_sd15_depth` | none |

All repos must be public and ungated. Check this with `curl -sIL https://huggingface.co/<repo>/resolve/main/<file>` (expect 200 or 302, not 401/403). If one is gated, take the fallback. Record the `X-Repo-Commit` and the size of every file.

### Images (pinned; no `latest`, no floating `server-rocm`)

- `llama-server`: `ghcr.io/ggml-org/llama.cpp:server-rocm-b<N>` is tried first, then `:server-vulkan-b<N>`. Use the newest build `<N>` that exists for both tags (check with `docker manifest inspect`).
  - ROCm devices: `/dev/kfd`, `/dev/dri`, `group_add: ["video", "${RENDER_GID:-<host render gid>}"]`.
  - Vulkan devices: `/dev/dri` plus the same groups.
  - Timebox ROCm to about 30 min. If no gfx1201 device appears, or it crashes or produces garbage, switch to Vulkan. If both work, run the bench on both and keep the one with the higher generation tokens/s. `compose.yaml` keeps only the winner; a comment names the other tag and its result.
- `comfyui`: local build from `infra/comfyui/Dockerfile`, tagged `bricomission/comfyui:<comfy-tag>-rocm<ver>`.
  - `FROM rocm/pytorch:<exact tag, ROCm >= 6.4.1, newest 7.x preferred, Ubuntu 24.04, py3.12>`.
  - Clone ComfyUI at a pinned release tag and `comfyui_controlnet_aux` at a pinned commit sha.
  - Install ComfyUI requirements with `torch`, `torchvision` and `torchaudio` filtered out, so the ROCm torch from the base image is not replaced by CUDA wheels. Assert this at build time: `python -c "import torch; assert torch.version.hip"`.
  - Fallback base: `ubuntu:24.04` (or `python:3.12-slim`) with torch ROCm wheels from `https://download.pytorch.org/whl/rocm<ver>` pinned by version.
  - Run: `python main.py --listen 0.0.0.0 --port 8188`. Extra flags (`--use-pytorch-cross-attention`, `--lowvram`, `--disable-smart-memory`) only when they are measured to help; record them.
  - Do not set `HSA_OVERRIDE_GFX_VERSION` unless gfx1201 is not detected natively. If you set it, record why.
- `ai-fetch`: reuses the pinned llama.cpp image (Ubuntu, has bash and curl) with `entrypoint: ["bash", "/fetch/fetch-models.sh"]`. It mounts `./infra/ai:/fetch:ro` and the model volumes. The script `curl -fL --retry 5 -C -` downloads each file into a `.part` file and then moves it into place. It skips a file whose size matches the remote `Content-Length` (or `x-linked-size`). It runs as bash under `set -euo pipefail`.

### compose.yaml additions

- Volumes: `llm-models` (`/models`), `comfyui-models` (`/opt/ComfyUI/models`), `comfyui-annotators` (the controlnet_aux ckpts dir), `comfyui-output`.
- `llama-server` command:
  - `-m /models/<gguf> --host 0.0.0.0 --port 8080 -ngl 99 --n-cpu-moe ${LLAMA_N_CPU_MOE:-48} -c ${LLAMA_CTX_SIZE:-16384} -fa on --jinja -t 16`. Qwen3-30B-A3B has 48 layers, so the default 48 keeps all experts in RAM.
  - Healthcheck: `curl -f http://127.0.0.1:8080/health`, `start_period: 600s`.
- `comfyui` healthcheck: `curl -fsS http://127.0.0.1:8188/system_stats`, `start_period: 300s`.
- Both services: `restart: unless-stopped`, ports `127.0.0.1:${LLAMA_PORT:-8080}:8080` and `127.0.0.1:${COMFYUI_PORT:-8188}:8188`, `profiles: ["ai"]`.

### Spike tooling (bash + curl + host python3 stdlib only)

- `scripts/ai-spike/vram-sample.sh <label> <seconds|pidfile>`: picks the amdgpu card with the largest `/sys/class/drm/card*/device/mem_info_vram_total`, samples `mem_info_vram_used` every 0.5 s, and prints the baseline, peak and peak-minus-baseline in MiB. Read-only, no root.
- `scripts/ai-spike/llm-bench.sh`: 3 runs, each with a ~1k-token prompt (an inline catalog excerpt) asking for Line Items under the schema `{items:[{sku:string, description:string, quantity:number, unit:string, source_ref:string}]}`, `max_tokens` 512 and `temperature` 0. It validates the JSON with python3 and prints the median prompt and generation tokens/s, plus time-to-first-token from `timings`.
- `scripts/ai-spike/comfy-run.sh <depth|canny> <image>`:
  - Uploads the image to `/upload/image`, fills `infra/comfyui/workflows/sdxl-controlnet-<mode>.json` (ComfyUI API format), posts `/prompt`, polls `/history/<id>` and downloads the result via `/view`.
  - Timing: 1 cold run and 3 warm runs. Prints seconds per image.
  - Settings: 1216x832, 25 steps, `dpmpp_2m` karras, cfg 6, ControlNet strength 0.8, fixed seed.
- Sample photo `infra/ai/samples/kitchen-sample.jpg`: a CC0 or public-domain kitchen photo (e.g. Wikimedia Commons), resized to at most 1600 px and under 1 MB. Its URL, author and licence go in `infra/ai/samples/SOURCE.md`. If no suitable CC0 photo can be fetched, generate one with SDXL text-to-image (no ControlNet), save it as the sample, and note in `SOURCE.md` that it is synthetic.

### Explicit fallback decisions

1. LLM: ROCm image -> Vulkan image. If both fail to use the GPU, set the feature to `blocked` and report. Do not accept CPU-only llama.
2. LLM VRAM: if the LLM with `--n-cpu-moe 48` exceeds 5 GB over the baseline, reduce `-c` to 8192 and record it.
3. SDXL is "too slow" when the warm render takes more than 60 s per image at 1216x832 with 25 steps, or it runs out of memory on its own. In that case switch to SD 1.5 + `control_v11f1p_sd15_depth` at 768x512, and update the workflows and the report.
4. ComfyUI: if gfx1201 is unusable under ROCm with both bases (primary and fallback) within about 60 min, the llama part can still complete. Set the feature to `blocked` with a precise log excerpt, and propose options in the report: stable-diffusion.cpp with Vulkan, or a written native exception. Do not implement them.
5. Co-residency failure (OOM or over 14.5 GB) is a valid outcome, not a failure. Document "serialization required" and the unload/reload numbers.

## Expected File Changes

- `compose.yaml`: add `llama-server`, `comfyui`, `ai-fetch` and 4 volumes (modify).
- `.env.example`: add `LLAMA_PORT`, `COMFYUI_PORT`, `LLAMA_N_CPU_MOE`, `LLAMA_CTX_SIZE`, `RENDER_GID` (modify).
- `infra/comfyui/Dockerfile`, `infra/comfyui/workflows/sdxl-controlnet-depth.json`, `infra/comfyui/workflows/sdxl-controlnet-canny.json` (create).
- `infra/ai/fetch-models.sh` (mode 755), `infra/ai/samples/kitchen-sample.jpg`, `infra/ai/samples/SOURCE.md` (create).
- `scripts/ai-spike/vram-sample.sh`, `scripts/ai-spike/llm-bench.sh`, `scripts/ai-spike/comfy-run.sh` (create, mode 755).
- `docs/spikes/local-ai-gpu-spike.md` and `docs/spikes/assets/{render-depth,render-canny}.jpg` (create; each image under 1 MB).
- `init.sh`: add only hint lines for the `ai` and `ai-fetch` profiles (modify). The gate logic does not change.
- `docs/adr/0001-local-llm-moe-llama-cpp.md`, `docs/risks-and-open-questions.md`, `docs/technical-discovery.md`, `AGENTS.md`, `PROGRESS.md`, `feature_list.json` (modify).

## Visual Design Impact

None. ComfyUI is a backend tool here, and no product screens change.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed. No app layers yet; `api-skeleton` creates it.
- `CONSTRAINTS.md`: not needed. The GPU rules already live in `AGENTS.md`/`CLAUDE.md`.
- `AGENTS.md`: update. Add a short "AI services" note: the opt-in `--profile ai`, the one-time `--profile ai-fetch run --rm ai-fetch`, and the measured co-residency rule.
- `docs/adr/0001-*.md`: update Status ("Accepted, validated 2026-11-12 by local-ai-gpu-spike", or "Amended" if the model, quant or backend changed) and add a Validation section with the numbers.
- `docs/risks-and-open-questions.md`: move the model/quant, llama backend and SDXL checkpoint questions to Resolved. Update the ROCm and SDXL risk rows with the outcomes.
- `docs/technical-discovery.md`: in the GPU section, add the actual devices and groups, the profiles and the measured serialization need.

## Implementation Plan

1. Preflight: `docker info`, `ls -l /dev/kfd /dev/dri`, `getent group render video`, the disk-space check, a baseline `vram-sample.sh`. Verify the image tags and HF URLs.
2. Write `fetch-models.sh` and the compose `ai-fetch` service. Start the download (it is long; do steps 3-4 meanwhile).
3. Write the ComfyUI Dockerfile and build it (`docker compose --profile ai build comfyui`).
4. Add `llama-server` (ROCm first). Run Scenarios 3-5. If ROCm fails, use Vulkan; compare if both work.
5. Add `comfyui`, the workflows and the sample photo. Run Scenarios 6-7, then apply the SDXL/SD 1.5 decision.
6. Run the Scenario 8 phases with `vram-sample.sh`. Test ComfyUI `POST /free` (`{"unload_models":true,"free_memory":true}`) and the llama stop/start reload time.
7. Write the report and update the docs, `init.sh` hints, `PROGRESS.md` and `feature_list.json` (`passing` with evidence, or `blocked`).

## Implementation Tasks

- [ ] Preflight checks and tag/URL verification recorded
- [ ] `infra/ai/fetch-models.sh` + `ai-fetch` service; idempotent second run
- [ ] `infra/comfyui/Dockerfile` builds; `torch.version.hip` assert passes
- [ ] `llama-server` service healthy on the GPU; backend decision recorded
- [ ] `llm-bench.sh` 3/3 valid JSON; tokens/s recorded
- [ ] `comfyui` service healthy; depth and canny workflows produce renders
- [ ] `vram-sample.sh` phases measured; co-residency verdict recorded
- [ ] Report, ADR 0001, risks, technical-discovery, AGENTS.md, init.sh hints, PROGRESS.md, feature_list.json

## Verification Plan

- `bash -n init.sh infra/ai/fetch-models.sh scripts/ai-spike/*.sh`
- `docker compose config -q`, then `docker compose --profile ai --profile ai-fetch config -q`
- Pin check, extended so that a `build:`-only service is allowed and every `FROM` in the Dockerfile has an exact tag:
  `awk '/^[[:space:]]*image:/{n=split($2,a,"/"); if (a[n] !~ /:/ || a[n] ~ /:latest$/) {print "UNPINNED: " $2; bad=1}} END{exit bad}' compose.yaml`
  and `grep -nE '^FROM' infra/comfyui/Dockerfile` must show no `latest` and no tagless image.
- `docker compose port llama-server 8080` and `docker compose port comfyui 8188` must show `127.0.0.1`.
- Run Scenarios 1-8 as written. Then run `./init.sh` and confirm exit 0 and only 3 services in its table.
- `docker compose --profile ai down` followed by `up -d --wait`: models load from the volumes with no re-download (Scenario 2's second run also shows this).
- E2E: not applicable. There is no app, route or API flow.

## Evidence To Capture

- Final image tags and digests, the ComfyUI and controlnet_aux pins, and the HF repo commits with file sizes.
- The backend decision with log lines showing the device, and the ROCm/Vulkan comparison if both ran.
- Tokens/s (prompt and generation) and TTFT medians, plus a sample of the JSON output.
- Cold and warm s/image for depth and canny, with the resolution and steps used.
- VRAM table for the baseline, LLM-only, ComfyUI-only and both phases; the co-residency verdict; `/free` and reload times.
- Everything goes in the report, as summary lines in the `feature_list.json` evidence, and in a `PROGRESS.md` session entry.

## Validator Checklist

- [ ] GPU services are only in the `ai` profile; `./init.sh` is unchanged in behaviour (3 services, exit 0).
- [ ] All images are pinned; Dockerfile `FROM` is pinned; new ports are bound to 127.0.0.1 and overridable; the defaults match `.env.example`.
- [ ] Weights live in named volumes, not in the repo; the fetch is idempotent.
- [ ] The validator re-runs Scenario 5 (`llm-bench.sh`) and one Scenario 6 render and gets matching results.
- [ ] The report has every number from Scenario 8 and an explicit co-residency verdict; ADR 0001 is updated.
- [ ] Any fallback taken is recorded with its trigger; no sudo was used, no native installs were made, and no app code was added.
- [ ] Status is `passing` with evidence, or `blocked` with exact human steps; never `accepted`.
