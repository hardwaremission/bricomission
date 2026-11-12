# ADR 0001: Local LLM served by llama.cpp with MoE experts in system RAM

## Status
Accepted (2026-11-12), pending validation by the Day-1 spike.

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
