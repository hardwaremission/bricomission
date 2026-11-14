# ADR 0005: Calculated style, blend modes, vision model and GPU residency

## Status
Accepted, 2026-11-14 (feature `simulations-ux-overhaul`). Amends ADR 0001 (see its "Amendment 2026-11-14"). ADR 0002 is unchanged.

## Context

A Render used one Style Gallery style and ignored uploaded references. Homeowners pick several styles and own photos, and want every kitchen photo renovated in one consistent look, plus variations. The Budget also has to reflect what the renders actually show, and its four tiers must be ordered. All of it runs on one 16 GB card shared by the LLM and the image model (`docs/spikes/simulations-gpu-spike.md`).

## Decision

- **Simulation**: one group of Renders, one per kitchen photo (up to 8), all sharing one **calculated style**. The first Simulation of a project uses equal weights over the references (Style Gallery picks and Moodboard uploads). "Generate again" draws new weights from a seeded PRNG (mulberry32 over `style_seed`, uniform in [0.5, 1.5], divided by the mean, clamped, normalized; max/min <= 3). Same seed, same weights. The seed is stored and never returned. Render seed = hash(style seed, photo position). A Simulation is selectable, and a Budget is computed from it, only when every Render succeeded.
- **Blend modes** (platform setting `style_blend_mode`, API `GET|PUT /admin/settings/style-blend`, copied to the Simulation at creation; a missing or invalid value reads as `both`):
  - `ip_adapter`: dominant-style text plus IP-Adapter on every reference at its weight.
  - `vlm_text`: a style text merged from what a vision model sees in each reference; no IP-Adapter nodes.
  - `both`: that merged text plus IP-Adapter at a reduced base weight (0.4; `ip_adapter` uses 0.6; per-reference weight `min(1, base * n * w_i)`).
- **Vision descriptions** come from the multimodal LLM (one `llm` broker job, schema-constrained JSON: palette, materials, cabinet style, lighting, keywords), cached by (SHA-256 of the 768 px JPEG, model id; the id carries `fake:` for the fake adapters). The **merge is code, not an LLM call**: terms are scored by the weights of the references that mention them and the top terms fill a style text of <= 160 characters (one CLIP chunk). A failed vision job never fails the Simulation: it falls back to the dominant-style text and sets `style_degraded`.
- **IP-Adapter** in ComfyUI through the custom node `ComfyUI_IPAdapter_plus` (pinned commit), `ip-adapter-plus_sdxl_vit-h` and the CLIP ViT-H vision encoder, one encoder per reference, combined in groups of 5 and combined again (12 references verified), next to the unchanged ControlNet canny and depth chain. Weights come from `ai-fetch`; renders run offline.
- **Budget** per Simulation: a vision job per Render image builds an inventory of elements (category, label, count); code merges them (max count per category), extends the retrieval queries and prints price bands (terciles per category) as hints. The model still extracts cited Line Items and code computes (ADR 0002). Code enforces Luxury > High > Medium > Low on `totalCents`: an out-of-order attempt is rejected and retried with feedback (3 attempts); if still out of order the verified tiers are relabelled by total rank (`budget.relabeled`), changing names only, never an amount.
- **Residency**: llama-server runs in router mode (`--models-preset infra/ai/llama-models.ini --models-max 1`). Before every image job the broker's residency hook calls `POST /models/unload`; the next LLM request reloads the model (about 7 s). `beforeLlm`, `afterLlm` and `afterImage` do nothing: loading the LLM beside the resident ComfyUI models fits and keeps ComfyUI warm. The adapter must send `"model": "qwen3-vl"` in every request.

## Alternatives Considered

- **Co-residency** of the vision model and an IP-Adapter render: measured +46 % to +100 % render time and the card limit (peak 16,286 MiB of 16,304). Rejected.
- **`--sleep-idle-seconds`**: also works, but needs idle waiting. Kept as a fallback.
- **Stop/start the llama-server container**: needs the Docker socket in the API. Not needed.
- **An LLM call to merge the style texts**: slower, non-reproducible from the seed, one more GPU job. Rejected for a scoring merge in code.
- **Top-5 IP-Adapter fallback**: not needed, 12 references work through chaining.
- **Failing the Budget after three misordered attempts**: the developer chose relabelling (OQ-5) so a Budget is always produced and always ordered; the relabel is visible (`relabeled`) and a quiet note is shown.

## Consequences

- The model files grow by 19.6 GB (Qwen3-VL GGUF plus mmproj) and 4.8 GB for IP-Adapter and the vision encoder. The old text model stays in its volume until the developer removes it.
- Each Simulation pays one model reload (vision describe, then renders back to back); each Budget pays one (inventory, then pricing). Renders with references take 14-16 s warm against 10 s without.
- A ComfyUI custom node is a maintenance risk (pinned commit; tested on ComfyUI v0.45.3 and torch 2.14 ROCm).
- A relabelled Budget can hold a "Luxury" tier that is not the most expensive product choice; only names move.
- Quotas count one Simulation as N Render units (`daily-quota-enforcement` plugs into `SimulationsService.create`).

## Validation (2026-11-14)

Spike A1 to A3 and the per-mode smoke run are recorded in `docs/spikes/simulations-gpu-spike.md` (VRAM, seconds, node commit, model bytes, comparison image `docs/spikes/assets/simulations-blend-modes.jpg`).
