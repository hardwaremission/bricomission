# Simulations GPU spike (feature simulations-ux-overhaul, phase A)

Date 2026-11-14. Host: RX 9070 XT 16 GB (16,304 MiB), default Compose project, one GPU job at a time
under `flock /tmp/bricomission-gpu.lock`. Result: all three unknowns pass. Co-residency fails, so
the LLM is unloaded before every render (router mode `POST /models/unload`).

Desktop VRAM drifted between 1.1 and 4.3 GB during the session (browser and compositor). Absolute
peaks below include it, so compare rows measured back to back, not across hours.

## A1 Vision model on the pinned image

Image `ghcr.io/ggml-org/llama.cpp:server-rocm-b12316` loads `Qwen3-VL-30B-A3B-Instruct` with its
mmproj. No image bump: llama-server, ai-fetch and the CPU embedder stay on b12316 (embedder untouched,
not re-verified because nothing changed).

| File (volume `bricomission_llm-models`) | Bytes | Source (pinned commit) |
| --- | --- | --- |
| `Qwen3-VL-30B-A3B-Instruct-Q4_K_M.gguf` | 18,556,688,096 | `unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF@0af19e747985` |
| `Qwen3-VL-30B-A3B-Instruct-mmproj-F16.gguf` | 1,083,500,224 | same repo, file `mmproj-F16.gguf` |

Flags (same as the text model plus `--mmproj`): `-ngl 99 --n-cpu-moe 48 -c 16384 -fa on --jinja -t 16`.
Experts stay in system RAM (log: 49/49 layers offloaded, CPU_Mapped expert buffers). The mmproj is
offloaded to the GPU (default). The Instruct variant is enough (no Thinking variant needed): a
schema-constrained `json_schema` request with one `image_url` data URI returned valid JSON every time.

`scripts/ai-spike/vlm-bench.sh` (kitchen-sample.jpg scaled to 768x576, temperature 0):

| Metric | Value |
| --- | --- |
| Image tokens at 768 px long edge | 434 (prompt 473 with the text) |
| First image (cold cache) | 6.1 s wall, prompt 214 tok/s (2.2 s for the image), 104 output tokens |
| Same image again (prompt cache) | 3.9 s wall |
| Generation | 25.4-26.8 tok/s |
| 8 distinct images in one request | 3,697 prompt tokens, 8.4 s prompt (442 tok/s), about 1 s per image |
| VRAM, VL resident | about 3.8-4.6 GB (text-only model was 2.9 GB): +1 to 1.7 GB |

Decisions: `LLAMA_CTX_SIZE` 16384 stays (8 images = 3.7k tokens; the Budget inventory reads one image
per call). `--image-max-tokens` and `--no-mmproj-offload` were not needed and not measured. Qwen warns that
grounding tasks want `--image-min-tokens 1024`; style traits and inventories do not need grounding.

## A2 IP-Adapter in ComfyUI

`ComfyUI_IPAdapter_plus` pinned at `a0f451a5113cf9becb0847b92884cb10cbdec0ef` (`ARG IPADAPTER_PLUS_SHA`
in `infra/comfyui/Dockerfile`). Rebuilt image `bricomission/comfyui:v0.45.3-rocm10.1.0`: torch stays
`2.14.0+rocm10.1.0`, node loads on ComfyUI v0.45.3 with no import error. Weights (volume
`bricomission_comfyui-models`):

| File | Bytes | Source (pinned commit) |
| --- | --- | --- |
| `ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors` | 847,517,512 | `h94/IP-Adapter@018e402774ae`, `sdxl_models/` |
| `clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | 3,944,552,236 | `laion/CLIP-ViT-H-14-laion2B-s32B-b79K@1c2b8495b281`, `model.safetensors` |

Workflow (`scripts/ai-spike/ipadapter-run.sh`): the production canny (0.6/0.95, 0.8, end 0.5) plus depth
assist (0.7, end 1) chain at 1216x832, plus one `IPAdapterEncoder` per reference (weight
`min(1, base*n*w_i)`, equal weights, base 0.6), merged by `IPAdapterCombineEmbeds` (method `concat`),
applied by `IPAdapterEmbeds` on the checkpoint model.
Facts found: `IPAdapterEmbeds` needs `clip_vision` as well for the Plus model (error "Missing CLIPVision
model" otherwise). `IPAdapterCombineEmbeds` takes `embed1..embed5` only, so chaining works as groups
of up to 5 whose partial results are combined again: **12 references work** (3 groups of 5, 5, 2,
then a second combine). No top-5 fallback needed (`mode=top5` exists in the script, not used).

LLM stopped, same photo and seed, warm render seconds (cold = first run after `POST /free`):

| References | Cold s | Warm s | Peak VRAM MiB |
| --- | --- | --- | --- |
| 0 (current Render) | 17.1 | 10.0 | 16,079 |
| 1 | 22.3 | 13.4 | 16,019 |
| 5 | 22.6 | 14.3 | 16,128 |
| 12 | 25.9 | 16.0 | 16,220 |

Cost of references: about +3.4 s warm for 1, +4.3 s for 5, +6 s for 12. The peak is the card
(ComfyUI fills free VRAM), no OOM.
Evidence image `docs/spikes/assets/simulations-ipadapter-chain.jpg` (labels did not render; order
left to right, top row: original photo, 0 references, 1 reference (industrial); bottom row: 5
references, 12 references; references are Style Gallery images). Geometry (windows, fridges, island,
cabinet lines) is preserved by ControlNet in all cases; materials, colours and floor follow the
references, and the 12-reference result blends them into a coherent warm-wood look without artefacts.

## A3 Residency

All with the VL model at `-c 16384` and ComfyUI at the 5 and 12 reference workflow.

| Case | Render peak MiB | Warm s (5 refs) | Warm s (12 refs) | Notes |
| --- | --- | --- | --- | --- |
| Reference, LLM stopped | 16,128 | 14.3 | 16.0 | no OOM |
| LLM unloaded (router) | 15,472 (5) / 16,148 (12) | 14.3 | 16.2 | same as stopped |
| LLM resident (co-resident) | 16,286 / 16,284 | 20.9 (+46 %) | 32.4 (+100 %) | no OOM, but spills |

Rule from the spec (peak above 15,600 MiB, OOM, or slowdown above 25 %): co-residency breaks it on
slowdown (+46 % and +100 %) and peak. **Decision: unload the LLM before every render.**

Unload mechanisms, in the spec's order:

1. **Router mode, `POST /models/unload` (chosen).** Works on b12316. `llama-server --models-preset
   <ini> --models-max 1` lists presets at `GET /models`; a request with `"model":"qwen3-vl"` autoloads
   it; `POST /models/unload` body `{"model":"qwen3-vl"}` returns `{"success":true}` in 0.01 s and VRAM
   falls back to the desktop level (4,292 MiB measured; model status `unloaded`). Shared flags
   from the compose command (`-ngl`, `--n-cpu-moe`, `-c`, `-fa`, `--jinja`, `-t`) reach the model
   instance (checked in `GET /models` args). Reload plus first vision request 13.4 s (the request alone
   6.2 s), so reload is about 7 s with a warm page cache. `/health` stays 200, healthcheck unchanged.
   Router mode makes `"model": "qwen3-vl"` mandatory in every chat request.
2. `--sleep-idle-seconds 5` also works (VRAM 4.9 GB to 1.1 GB, `/props` `is_sleeping: true`, wake plus
   request 12.1 s) but needs idle waiting, so it is slower to be deterministic. Fallback only.
3. Stop/start: not needed, no justification required.

Other findings:
- LLM load while ComfyUI keeps its models resident (8.6 GB after a render) fits (13.2 GB total, request
  6.2 s, no slowdown). So `beforeLlm()` may skip `POST /free`: this keeps ComfyUI warm and saves the
  cold render penalty (about +8 s) once per switch. Call `/free` only if a load error is seen.
- Switching cost per Simulation: describe (about 7 s reload + vision calls) then unload, then N renders
  back to back (cold 23 s then warm 14-16 s each). Per Budget: inventory then pricing, both LLM.
- `PreviewImage` and `/free` behave as before; references upload through `POST /upload/image`.

## Final recommended defaults

- Blend mode: **`both`** (OQ-2). Confirmed by the phase F per-mode comparison below: no problem found.
- Reference weights: base 0.6 per reference with `min(1, base*n*w_i)`; renders up to 12 references
  with chaining; no top-5 fallback.
- Residency: `beforeImage()` unloads the LLM (`POST /models/unload`), `beforeLlm()` does not free
  ComfyUI, the next LLM request reloads automatically. LLM `model` name `qwen3-vl`
  (`LLM_MODEL` env default for the adapter).
- Timings to budget: vision describe about 6 s per image plus 7 s reload; render warm 14-16 s with
  references.

## Files and commands

- `infra/ai/fetch-models.sh`: four new pinned entries (idempotent; second run printed `present`).
- `infra/comfyui/Dockerfile`: IPAdapter node (build: `docker compose --profile ai build comfyui`).
- `infra/ai/llama-models.ini` and `compose.yaml` (router command, preset mount).
- `scripts/ai-spike/vlm-bench.sh`, `scripts/ai-spike/ipadapter-run.sh` (with `vram-sample.sh`).
- Reproduce: `docker compose --profile ai-fetch run --rm ai-fetch`; `docker compose --profile ai up -d --wait
  llama-server`; `flock /tmp/bricomission-gpu.lock scripts/ai-spike/vlm-bench.sh`; stop it and start
  `comfyui`; `flock ... scripts/ai-spike/ipadapter-run.sh 12 infra/ai/samples/kitchen-sample.jpg <dir of
  jpg refs> out.jpg 0.6`. Stop both services afterwards (`docker compose --profile ai stop llama-server comfyui`).

## Phase F: real-GPU smoke per blend mode (2026-11-14)

`bash scripts/ai/simulation-smoke.sh` under `flock /tmp/bricomission-gpu.lock`, api recreated with `AI_ADAPTERS=local`,
llama-server in router mode, ComfyUI, CPU embedder with the sample Catalog. Project: 3 photos (`kitchen-sample.jpg` 1600x1200,
Style Gallery `scandinavian-02` and `classic-03` used as photos, 1216x832), 3 references (Style Gallery `modern-01`, `japandi-02`,
and an own upload, `farmhouse-01`). One Simulation per mode (admin API `PUT /admin/settings/style-blend`), default `both` restored,
then "Generate again" (new random weights), selection and a Budget. Final run: all checks passed (exit 0).
Desktop VRAM floor 8.5 GB during these runs (browser and compositor), so peaks are absolute card usage out of 16,304 MiB.

| Simulation | Total s | Render s (3 photos) | VRAM peak MiB | Notes |
| --- | --- | --- | --- | --- |
| `ip_adapter` (equal weights 34/33/33) | 41.8 | 14.1, 13.7, 13.7 | 16,049 | no describe pass; LLM unloaded at 1.4 s |
| `vlm_text` (31/45/24) | 31.1 | 10.5, 10.2, 10.0 | 16,035 | no IP-Adapter, same speed as the plain render (10 s) |
| `both` (21/45/34) | 43.5 | 15.4, 13.8, 13.8 | 16,075 | |
| `both`, "Generate again" (43/34/23) | 42.5 | 14.2, 13.9, 13.8 | 15,979 | weights and keywords differ from the previous Simulation |

Stage timings with a cold description cache (run before the final one, same code): `vlm_text` Simulation 47-48 s: `describing`
17 s (router load about 3 s with a warm page cache, vision pass over 3 references), llama-server unloaded at 17.7 s (the hook
before the first image job), then three renders of 10.0-10.4 s. The final run reused the cached descriptions, so its `vlm_text`
and `both` Simulations had no `describing` stage. Every Simulation ended with llama-server `unloaded` (polled at 0.5 s); the
Budget reloads it (`loaded` again) for the inventory pass. Fake adapter runs of the same flow never see these transitions.

Budget for the selected Simulation (Generate again): final run 147.7 s: inventory 3 images (28.3 s for the first including the
reload, 29.2 s for the second, 30.5 s for the third; an inventory answer is about 600-700 tokens), pricing 59.7 s, **1 attempt**,
1,701 prompt and 1,394 completion tokens, totals 2,243.00 > 1,768.70 > 1,692.05 > 337.45 EUR (Luxury > High > Medium > Low,
`relabeled` false), 3 of 3 inventories cached, psql re-sum of tier totals equals the Line Items, VRAM peak 13,904 MiB (LLM alone).
Earlier runs of the same flow (same code except the inventory token cap): 253.6 s with 3 attempts and the last one ordered
(no relabel), and a run whose polling had lost its token (the Budget still finished in the background) that needed 3 attempts and was **relabelled** (`relabeled = true`). So the real model
does produce misordered totals and the retry-then-relabel path is exercised in practice, not only in unit tests.

Bugs found by the real run (all fixed in this phase):
1. The vision cache key carried the same model id for fake and real adapters, so a fake run poisoned the real run's style traits
   (key now prefixed `fake:` when `AI_ADAPTERS` is not `local`).
2. `INVENTORY_MAX_TOKENS` 500 truncated the inventory JSON (`finish_reason: length`, 570-690 tokens needed), so 2 of 3 inventories
   were silently skipped (1 of 3 cached) and the Budget was priced from fewer elements. Raised to 1200 and a warning is logged;
   after the fix 3 of 3 are cached.
3. Smoke script: access tokens expire during a long Budget (the first Budget poll loop ran 1,332 s on 401s); the script now
   re-issues tokens every 60 s and gives up after 20 empty polls.

Quality comparison (`docs/spikes/assets/simulations-blend-modes.jpg`, 1440x1700, rows top to bottom: original photos, `ip_adapter`,
`vlm_text`, `both`, "Generate again" with `both`; columns: the three photos; labels do not render in this ffmpeg build):
- Geometry (windows, doors, fridges, island, cabinet runs) is preserved in all rows; ControlNet works unchanged with IP-Adapter.
  No artefacts, no structural hallucination (the black kettle on the hob survives as a kettle in every row: clutter is restyled,
  a known limit).
- `ip_adapter`: follows the reference photos' look (white cabinets with gold and wood accents, warm light) but the three photos
  diverge more from each other (white shaker in photo 2, pale wood cabinets in photo 3).
- `vlm_text`: the merged words (wood, white, minimalist, flat panel, stone) give oak-faced cabinets and light floors, the most
  uniform "wood" read but flatter materials; it is the fastest (10 s per render, no extra VRAM).
- `both`: wood cabinets and wood floors in all three photos plus the reference lighting and hardware; the most consistent
  across the Simulation and the closest to a blend of the three references. No problem found, 3-4 s slower per render than
  `vlm_text` (the IP-Adapter cost measured in A2).
- "Generate again" (`both`, other weights): visibly a different style (cream shaker cabinets with wood accents, darker pendants)
  from the same references.

**Recommended default blend mode: `both`** (the spec rule: `both` unless the comparison shows a problem; none shown). It is the
code default when the setting is missing or invalid. `vlm_text` stays the fast fallback when IP-Adapter cannot load.

Commands: `docker compose --profile rag up -d --wait embedder`, `bash scripts/ai/simulation-smoke.sh`, then `docker compose
--profile ai stop llama-server comfyui`, `docker compose --profile rag stop embedder`, `docker compose up -d --wait api`.

## Not run

`--no-mmproj-offload`, `--image-max-tokens`, Thinking variant (not needed), `mode=top5`, IPAdapter weights
other than the production base weights, 8-photo Simulations and Budgets on the real GPU (3 photos were run; 8 would take about
2 minutes of rendering and a 4-6 minute Budget by extrapolation).
Renders ran with `HF_HUB_OFFLINE=1` (compose sets it) and succeeded.
