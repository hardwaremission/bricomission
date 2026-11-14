# ADR 0001: Local LLM served by llama.cpp with MoE experts in system RAM

## Status
Accepted, validated 2026-11-12 by local-ai-gpu-spike (see Validation).

## Context

The dev machine has an RX 9070 XT with ~14.5 GB free VRAM and 64 GB RAM. The LLM must coexist with SDXL + ControlNet image generation. Dense models that fit in VRAM alongside SDXL (7-8B) give weaker reasoning; larger dense models do not fit. Mixture-of-Experts models activate few parameters per token, so their expert weights can live in system RAM while dense layers and attention stay on the GPU.

## Decision

Serve the LLM with stock llama.cpp `llama-server` in Docker (ROCm or Vulkan backend), running a medium MoE model (target: Qwen3-30B-A3B, Q4) with expert tensors offloaded to system RAM (`--n-cpu-moe` / `-ot ".ffn_.*_exps.=CPU"`). Expose the OpenAI-compatible API behind the app's AI abstraction layer.

## Alternatives Considered

- **Avalon** (llama.cpp fork for one 125B MoE): single-model, tuned for RDNA3 and unmeasured on RDNA4, requires native ROCm 7.x (breaks the Docker rule), ~98 GiB of weights, and its expert cache would crowd out the image model. Kept as a possible later experiment, swappable via the Admin AI endpoint setting.
- **Ollama with a dense 8B model**: simplest, but weaker chat quality and structured extraction.
- **Dense 14B**: better quality, but not co-resident with SDXL.

## Consequences

- Low VRAM footprint leaves room for SDXL + ControlNet; GPU jobs are still serialized by the API.
- CPU and RAM bandwidth bound the token rate; acceptable for chat.
- Model and backend are swappable through the endpoint configuration without code changes.

## Validation

Measured on 2026-11-12 by `local-ai-gpu-spike` (`docs/spikes/local-ai-gpu-spike.md`):

- Model: `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` Q4_K_M (18.6 GB), served by `ghcr.io/ggml-org/llama.cpp:server-rocm-b12316` in Docker. gfx1201 works natively, with no override.
- Flags: `-ngl 99 --n-cpu-moe 48 -c 16384 --jinja`. All 49 layers are offloaded to the GPU and every expert tensor stays in system RAM.
- VRAM: about 3.0 GB idle and 3.2 GB peak over the desktop baseline (model 784 MiB, KV 1,536 MiB, compute 234 MiB).
- Speed, on a 2,003-token prompt with 436 generated tokens: 771 tok/s prompt, 25.5 tok/s generation, 2.6 s time to first token. With Vulkan (`server-vulkan-b12316`), prompt processing reaches 358 tok/s and generation 24.1 tok/s, so ROCm is the chosen backend.
- Structured output: `response_format` `json_schema` (strict) returned schema-valid Line Items in 12 of 12 runs.
- Co-residency with SDXL + ControlNet: the two can run at the same time without OOM, but ComfyUI fills the card during a render and both slow down by about 25 %. GPU jobs must therefore be serialized by the API broker, as this ADR already assumed. Stopping the LLM takes 0.6 s and reloading it about 5.5 s.

## Amendment 2026-11-14 (feature `simulations-ux-overhaul`, see ADR 0005)

The decision above stands (local MoE LLM on llama.cpp, experts in system RAM). What changed:

- **Model**: `Qwen3-VL-30B-A3B-Instruct` GGUF Q4_K_M (18,556,688,096 bytes) plus its `mmproj` F16 (1,083,500,224 bytes), pinned at `unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF@0af19e747985`, replaces the text-only `Qwen3-30B-A3B-Instruct-2507`. Same family and size class; it also reads images (style descriptions of references, element inventory of Renders). The same `server-rocm-b12316` image loads it with `--mmproj`; 434 image tokens at 768 px, about 1 s per image, 25-27 tok/s generation, VRAM about 3.8-4.6 GB while resident (text-only: 2.9 GB).
- **Router mode**: `llama-server --models-preset infra/ai/llama-models.ini --models-max 1`. Chat requests must carry `"model": "qwen3-vl"`; `POST /models/unload` frees the card in 0.01 s and the next request reloads it (about 7 s).
- **Unload rule**: the LLM is no longer left resident during renders. Co-residency with an IP-Adapter SDXL render was measured at +46 % to +100 % render time at the card limit, so the API unloads the LLM before every image job (ADR 0005). The earlier statement that both can be resident without OOM still holds, but not at acceptable speed. GPU jobs remain serialized by the broker.
- The old text model file is no longer used; deleting it from the `bricomission_llm-models` volume is a manual step after acceptance.
