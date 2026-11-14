# Style Gallery source

The 24 Style Gallery images (8 styles x 3) are synthetic: generated once on 2026-11-14 with the
local SDXL stack (feature `moodboard-selection`). They show no real place, person or product.
No third-party photos and no network images were used. The API serves these committed files
and never generates gallery images at runtime.

## How they were made

- Model: RealVisXL V5.0, `RealVisXL_V5.0_fp16.safetensors` from Hugging Face repo
  `SG161222/RealVisXL_V5.0` at commit `ac93e0dda1f6d448cae19bbfab8c5e720a5e48bc`
  (6,938,065,488 bytes; fetched by `infra/ai/fetch-models.sh`). An SDXL 1.0 fine-tune.
- Runtime: ComfyUI 0.45.3 in `bricomission/comfyui:v0.45.3-rocm10.1.0` (compose profile `ai`),
  Radeon RX 9070 XT, ROCm. `llama-server` was stopped (GPU serialization rule).
- Workflow: `infra/comfyui/workflows/sdxl-txt2img.json` (txt2img, 1216x832, 30 steps,
  `dpmpp_2m` + `karras`, cfg 5.5, denoise 1.0, one fixed negative prompt in the workflow).
- Prompts and seeds: per image in `manifest.json` (`prompt`, `seed`; seeds 20261114-20261137).
  These fields are internal and never returned by the API.
- Script: `scripts/style-gallery/generate.sh [image-id ...]` (PNGs into the git-ignored
  `.style-gallery-work/png/`), then `node apps/api/scripts/build-style-gallery.ts
  [--contact-sheet <png>]`.
- Timing: about 7.3 s per image warm (the first image, with the cold model load, 14.4 s).
- Post-processing: sharp re-encodes every PNG (ComfyUI PNGs embed the prompt and workflow in
  text chunks) into `<id>/full.jpg` (longest edge <= 1280, q82; the source is 1216x832, so no
  resize) and `<id>/thumb.jpg` (longest edge 512, q80), sRGB, no EXIF/XMP/IPTC/ICC/text.
  `manifest.json` records the `full` size. Total about 3.2 MB.
- Re-runs give similar but not byte-identical pixels (ROCm is not bit-exact). The committed
  JPEGs are the source of truth. Image ids are stable and are never reused or removed.
- Approval: contact sheet `design/openpencil/moodboard-selection/gallery-contact-sheet.png`,
  approved by the developer on 2026-11-14.

## Licence

- **Checked 2026-11-14 (orchestrator, Hugging Face model page `SG161222/RealVisXL_V5.0`):** licence `openrail++` (CreativeML Open RAIL++-M, the SDXL 1.0 licence family). It places no ownership claim on generated outputs and restricts only the listed harmful uses, so using these kitchen images in the app and in the public demo video is allowed.
- The local model file carries no licence metadata (the safetensors header `__metadata__` is empty); the model page is the source of the finding above.
- If the model page changes or a different checkpoint is used, re-check before publishing and, if needed, replace this gallery (same ids, different source).
