# Spike report: local MoE LLM and SDXL + ControlNet on the RX 9070 XT in Docker

- Feature: `local-ai-gpu-spike` (spec `docs/specs/local-ai-gpu-spike.md`)
- Date: 2026-11-12
- Host: CachyOS, kernel 7.3.3-1-cachyos, Ryzen 9 5950X (16C/32T), 64 GB RAM, Radeon RX 9070 XT 16 GB (gfx1201), Docker 29.9.3, no host ROCm.
- Result: both services run on the GPU inside containers, with ROCm and no `HSA_OVERRIDE_GFX_VERSION`. SDXL is fast enough, so no SD 1.5 fallback. Co-residency verdict: **serialization required** (see below).

## Decisions

| Item | Decision |
| --- | --- |
| LLM backend | ROCm: `ghcr.io/ggml-org/llama.cpp:server-rocm-b12316` (digest `sha256:1da62f4e1bca273de30b04b260c9643dda7ac1d336c783484ef5f1bf2373280f`). Vulkan `server-vulkan-b12316` (`sha256:4bce66a7831e1d396f49d433eb738b9ef1edc20002f5a0d5099b15282d01d13f`) also works, but its prompt processing is half as fast. |
| LLM model | `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` Q4_K_M (primary, no fallback needed). |
| LLM flags | `-ngl 99 --n-cpu-moe 48 -c 16384 -fa on --jinja -t 16 -lv 4`. Context not reduced (VRAM stays under 5 GB). |
| Image stack | `bricomission/comfyui:v0.45.3-rocm10.1.0` (local build, image id `sha256:ee2768ac4361...`, 40.8 GB). Base `rocm/pytorch:rocm10.1.0_ubuntu24.04_py3.12_pytorch_release_2.14.0` (digest `sha256:099f59a3bee9c436f5cc57db6bc6076fdeda579c57e9e22ae40f856d5905b3e4`). torch `2.14.0+rocm10.1.0`, HIP 7.16. ComfyUI `v0.45.3` (`71096d1a`). `comfyui_controlnet_aux` `a587a4c1594524c1d2de5cd1a86cd868ff448e1c`. |
| ComfyUI flags | Defaults only (`python3 main.py --listen 0.0.0.0 --port 8188`). ComfyUI picks PyTorch attention and its DynamicVRAM loader on its own. No extra flags were needed. |
| SDXL vs SD 1.5 | SDXL stays: warm renders take 8.5-9 s, far under the 60 s limit. |
| GPU access | `/dev/kfd` + `/dev/dri`, `group_add: [video, ${RENDER_GID:-987}]`. Host: `render` GID 987 (owns `/dev/kfd`), `video` GID 983. ComfyUI also uses `ipc: host` and `seccomp=unconfined` (the usual ROCm container settings). |
| Offline | Weights come from named volumes. ComfyUI runs with `HF_HUB_OFFLINE=1`, and the Depth Anything annotator loads from the `comfyui-annotators` volume (`AUX_ANNOTATOR_CKPTS_PATH=/opt/annotators`). Note: the node's startup log still prints its default ckpts path, but the env var wins at runtime (`model_path is /opt/annotators/...`). |

## Model files (Hugging Face, pinned by commit in the URL)

| Volume path | Repo @ commit | File | Bytes |
| --- | --- | --- | --- |
| `llm-models:/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf` | `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF@eea7b2be5805` | same name | 18,556,686,752 |
| `comfyui-models:/checkpoints/RealVisXL_V5.0_fp16.safetensors` | `SG161222/RealVisXL_V5.0@ac93e0dda1f6` | same name | 6,938,065,488 |
| `comfyui-models:/controlnet/sdxl-depth.safetensors` | `diffusers/controlnet-depth-sdxl-1.0@17bb97973f29` | `diffusion_pytorch_model.fp16.safetensors` | 2,502,139,134 |
| `comfyui-models:/controlnet/sdxl-canny.safetensors` | `diffusers/controlnet-canny-sdxl-1.0@eb115a19a10d` | `diffusion_pytorch_model.fp16.safetensors` | 2,502,139,136 |
| `comfyui-annotators:/depth-anything/Depth-Anything-V2-Small/depth_anything_v2_vits.pth` | `depth-anything/Depth-Anything-V2-Small@03876f8651c7` | same name | 99,218,434 |

All repos are public and ungated (HEAD gives 302 with `x-linked-size`). The SD 1.5 fallback files (`stable-diffusion-v1-5/stable-diffusion-v1-5@451f4fe16113`, `lllyasviel/control_v11f1p_sd15_depth@539f99181d33`) are also reachable. They are only fetched with `FETCH_SD15=1` and were not downloaded. Full commit SHAs are in `infra/ai/fetch-models.sh`.

Fetch (Scenario 2): the first `docker compose --profile ai-fetch run --rm ai-fetch` took 9 min 13 s (about 30.6 GB). The second run printed `present, skipping` for all 5 files and finished in 0.6 s.

## LLM (Scenarios 4-5)

Device log lines (`docker compose logs llama-server`, verbosity 4):

```
common_param:   - ROCm0   : AMD Radeon RX 9070 XT (16304 MiB, 16204 MiB free)
llama_prepare_model_devices: using device ROCm0 (AMD Radeon RX 9070 XT) (0000:0e:00.0) - 16058 MiB free
load_tensors: offloaded 49/49 layers to GPU
load_tensors:        ROCm0 model buffer size =   784.42 MiB
llama_kv_cache:      ROCm0 KV buffer size =  1536.00 MiB
sched_reserve:      ROCm0 compute buffer size =   233.51 MiB
resolve_fused_ops: Flash Attention over K/V rows not supported, set to disabled
```

The expert tensors stay in system RAM as `CPU_Mapped` buffers, about 17 GB through mmap. The llama.cpp log does not print the string `gfx1201` itself. It names the HIP device `ROCm0`. The ComfyUI container on the same GPU logs `AMD arch: gfx1201`. On both backends, `-fa on` is reported as unsupported for this configuration and gets disabled automatically. This did not cause any failure.

`scripts/ai-spike/llm-bench.sh` runs a Line Item extraction against a 40-SKU catalog excerpt. The prompt is 2,003 tokens: the spec asked for about 1k, so this is a stricter test. It uses `response_format: json_schema` (strict), `max_tokens 512`, `temperature 0` and `cache_prompt: false`. Every run produced 436 tokens and 7 valid items.

| Backend | Valid JSON | Prompt tok/s (median) | Gen tok/s (median) | TTFT (prompt_ms, median) |
| --- | --- | --- | --- | --- |
| ROCm b12316 (chosen) | 3/3 (repeated 4 times, 12/12) | 757-775 | 24.6-25.5 | 2.59-2.65 s |
| Vulkan b12316 (RADV) | 3/3 | 357.7 | 24.1 | 5.60 s |

Sample output (ROCm, run 1, abbreviated): `{"items":[{"sku":"CAB-060","description":"Base cabinet 60 cm variant","quantity":2,"unit":"unit","source_ref":"p.12 CAB-060"}, {"sku":"WAL-080",...,"quantity":1}, {"sku":"WTP-060",...,"quantity":3.2,"unit":"m"}, {"sku":"TIL-030",...,"quantity":4.5,"unit":"m2"}, {"sku":"SNK-060",...}, {"sku":"TAP-060",...}, {"sku":"LED-060",...,"quantity":2,"unit":"m"}]}`. The structure and quantities are correct. The SKU choice for size-less items (worktop, tile, tap) is arbitrary, which is a prompt-engineering matter for `catalog-rag-ingestion` and the Budget features. The model produced no prices.

Start times: `up --wait` to healthy takes 5.3-5.8 s with the GGUF in the page cache. The first start after the download took 10.9 s. A start with a cold page cache could not be measured, because dropping caches needs root.

## Images (Scenarios 6-7)

`scripts/ai-spike/comfy-run.sh <mode> infra/ai/samples/kitchen-sample.jpg`: 1216x832 (center crop), 25 steps, `dpmpp_2m` karras, cfg 6, ControlNet strength 0.8, seed 20261112, RealVisXL V5.0 fp16. Each run uploads the photo under a new name, so the preprocessor and sampler always run. The cold run starts after `POST /free`.

| Mode | Cold s/image | Warm s/image (3 runs) | Warm median |
| --- | --- | --- | --- |
| Depth (Depth Anything V2 Small, res 1024) | 16.87 (19.75 on a later run) | 8.46, 8.45, 10.38 | 8.46 |
| Canny (core `Canny`, 0.2/0.5) | 16.84 (19.14 on a later run) | 8.48, 9.46, 9.00 | 9.00 |

Sampling runs at about 3.5 it/s, and ComfyUI reports "Prompt executed in 8.2 s" for warm runs.

Side-by-side check (input, control hint, render): `docs/spikes/assets/compare-depth.jpg` and `compare-canny.jpg`. Renders: `render-depth.jpg` (126 KB) and `render-canny.jpg` (125 KB).

- Depth: kept the island with its countertop line and the hob/oven position, the right-hand counter run, both fridges, the rear window, the door and the floor perspective. The large left window became a glazed wall cabinet, because a flat depth map cannot tell a window from a wall.
- Canny: kept every element, including both window frames, the sink and tap, the dish racks, the fridges and the right-hand counter. Geometry is preserved more literally than with depth.
- Both renders clearly look like renovated kitchens: white shaker cabinets, wood worktop, steel appliances.

Sample photo: US Forest Service, public domain (see `infra/ai/samples/SOURCE.md`).

## VRAM and co-residency (Scenario 8)

`scripts/ai-spike/vram-sample.sh` reads `/sys/class/drm/card1/device/mem_info_vram_used` every 0.5 s. Total VRAM is 16,304 MiB. The desktop-only baseline is 1,181 MiB (`VRAM_BASELINE_MIB`). It drifts between about 1.0 and 1.9 GB with desktop activity.

| Phase | Peak MiB (absolute) | Peak over baseline | Notes |
| --- | --- | --- | --- |
| 0. Baseline (no AI containers) | 1,269 | 88 | 20 s sample |
| 1. LLM only, during `llm-bench.sh` | 4,388 | 3,207 | about 3.0 GB at idle (model 784 + KV 1,536 + compute 234 MiB plus HIP runtime) |
| 2. ComfyUI only, cold + 3 warm depth renders | 16,197 | 15,016 | 7,449 over baseline at idle with models cached; 247 over baseline with nothing loaded |
| 3. Both loaded, 4 depth renders + concurrent 3-run chat bench | 16,270 | 15,089 | idle with both loaded: 10,455 over baseline |

Phase 3 outcome: there was no OOM and both services stayed healthy. All renders finished, and the bench returned 3/3 valid JSON. Both slowed down under contention:

- Render warm median went from 8.47 s to 10.66 s (+26 %).
- LLM generation went from 25.5 to 17.3-19.2 tok/s and prompt processing from 771 to about 500 tok/s while a render ran. The bench run after the render returned to 25.6 / 774.

**Verdict: serialization required.** ComfyUI on its own already pushes the card to about 16.2 GB, about 15.0 GB over the desktop baseline, during a render. Its DynamicVRAM loader and the PyTorch caching allocator take whatever VRAM is free. So "both under about 14.5 GB over the baseline" does not hold, even though the run did not fail. The concurrent run survived only because ComfyUI adapts by staging weights, at a measurable speed cost. That is not a guarantee the demo can rely on. The `gpu-job-broker` must run image jobs one at a time and should not let chat traffic share the GPU during a render. The two levers are pausing LLM requests or stopping the LLM.

Unload and reload mechanisms (measured):

| Action | Result |
| --- | --- |
| `POST /free {"unload_models":true,"free_memory":true}` on ComfyUI | Returns in 5 ms (asynchronous). VRAM falls from 8,850 to 4,104 MiB within 3 s; the rest is llama-server. |
| ComfyUI reload after `/free` | The cold render costs 16.9-19.8 s against 8.5 s warm, so reloading SDXL + ControlNet adds about 8-11 s. |
| `docker compose --profile ai stop llama-server` | 0.6 s. VRAM returns to 1,220 MiB (baseline). |
| `docker compose --profile ai up -d --wait llama-server` | 5.3-5.8 s to healthy (page cache warm). The first chat request after the reload takes 0.4 s. |
| `docker compose --profile ai up -d --wait` (whole profile, after `down`) | 16 s, all 5 services healthy, no re-download. |

## Fallbacks taken

None. ROCm worked for both services natively on gfx1201, so no `HSA_OVERRIDE_GFX_VERSION` was set. Neither the SDXL fallback checkpoint nor SD 1.5 was needed, and `-c` was not reduced. Vulkan was benchmarked only for the comparison the spec asked for.

## Deviations and notes

- The ComfyUI image runs pip into the base image's system `python3`, with `PIP_BREAK_SYSTEM_PACKAGES=1`, because the base has no `python` binary and no venv. A constraints file built from the base's frozen `torch` pins ROCm torch. The build asserts `torch.version.hip`, and it printed `torch 2.14.0+rocm10.1.0 hip 7.16.26385`.
- `comfyui_controlnet_aux` is installed without `onnxruntime-gpu` (a CUDA build) and `mediapipe`. Only the depth preprocessor is used. DWPose logs a CPU-fallback warning, which is harmless.
- `ai-fetch` adds `FETCH_SD15` (default 0), so the SD 1.5 fallback can be fetched on demand.
- `llama-server` uses `-lv 4`, so its logs show the device and offload lines that Scenario 4 needs.
- The bench prompt is about 2k tokens instead of about 1k.
- Extra evidence images: `docs/spikes/assets/compare-{depth,canny}.jpg` (side-by-side, under 100 KB each).
- Disk (sizes as `docker images` reports them): llama ROCm 30.8 GB, `rocm/pytorch` base 37.2 GB, ComfyUI build 40.8 GB (includes the base layers), Vulkan 1.2 GB; weights about 30.6 GB in volumes. All on `/var/lib/docker` (449 GB free at start).
