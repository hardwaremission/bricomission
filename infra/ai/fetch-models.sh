#!/usr/bin/env bash
# One-shot model fetcher for the local AI stack (feature local-ai-gpu-spike).
# Run with: docker compose --profile ai-fetch run --rm ai-fetch
# Downloads pinned Hugging Face files (repo commit sha in the URL) into the
# named volumes mounted at /models (llm-models), /comfy-models (comfyui-models)
# and /annotators (comfyui-annotators). Idempotent: a file whose size matches
# the expected size is skipped ("present, skipping"). Partial downloads resume
# from <file>.part and are moved into place only when complete.
# Set FETCH_SD15=1 to also fetch the SD 1.5 fallback (only if SDXL is too slow).
set -euo pipefail

HF="https://huggingface.co"

# dest|repo|commit|file|expected_bytes
FILES=(
  "/models/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf|unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF|eea7b2be5805a5f151f8847ede8e5f9a9284bf77|Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf|18556686752"
  "/comfy-models/checkpoints/RealVisXL_V5.0_fp16.safetensors|SG161222/RealVisXL_V5.0|ac93e0dda1f6d448cae19bbfab8c5e720a5e48bc|RealVisXL_V5.0_fp16.safetensors|6938065488"
  "/comfy-models/controlnet/sdxl-depth.safetensors|diffusers/controlnet-depth-sdxl-1.0|17bb97973f29801224cd66f192c5ffacf82648b4|diffusion_pytorch_model.fp16.safetensors|2502139134"
  "/comfy-models/controlnet/sdxl-canny.safetensors|diffusers/controlnet-canny-sdxl-1.0|eb115a19a10d14909256db740ed109532ab1483c|diffusion_pytorch_model.fp16.safetensors|2502139136"
  "/models/Qwen3-VL-30B-A3B-Instruct-Q4_K_M.gguf|unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF|0af19e7479857aa7f3246466a4ad16c7e7299639|Qwen3-VL-30B-A3B-Instruct-Q4_K_M.gguf|18556688096"
  "/models/Qwen3-VL-30B-A3B-Instruct-mmproj-F16.gguf|unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF|0af19e7479857aa7f3246466a4ad16c7e7299639|mmproj-F16.gguf|1083500224"
  "/comfy-models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors|h94/IP-Adapter|018e402774aeeddd60609b4ecdb7e298259dc729|sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors|847517512"
  "/comfy-models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors|laion/CLIP-ViT-H-14-laion2B-s32B-b79K|1c2b8495b28150b8a4922ee1c8edee224c284c0c|model.safetensors|3944552236"
  "/annotators/depth-anything/Depth-Anything-V2-Small/depth_anything_v2_vits.pth|depth-anything/Depth-Anything-V2-Small|03876f8651c73a60fe4c2c48294e09fcb6838fcf|depth_anything_v2_vits.pth|99218434"
)

if [ "${FETCH_SD15:-0}" = "1" ]; then
  FILES+=(
    "/comfy-models/checkpoints/v1-5-pruned-emaonly.safetensors|stable-diffusion-v1-5/stable-diffusion-v1-5|451f4fe16113bff5a5d2269ed5ad43b0592e9a14|v1-5-pruned-emaonly.safetensors|4265146304"
    "/comfy-models/controlnet/sd15-depth.safetensors|lllyasviel/control_v11f1p_sd15_depth|539f99181d33db39cf1af2e517cd8056785f0a87|diffusion_pytorch_model.fp16.safetensors|722598642"
  )
fi

file_size() { stat -c %s "$1" 2>/dev/null || echo 0; }

fail=0
for entry in "${FILES[@]}"; do
  IFS='|' read -r dest repo commit file expected <<<"$entry"
  if [ -f "$dest" ] && [ "$(file_size "$dest")" = "$expected" ]; then
    echo "present, skipping: $dest ($expected bytes)"
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  url="$HF/$repo/resolve/$commit/$file"
  echo "fetching: $repo@${commit:0:12}/$file -> $dest ($expected bytes)"
  if ! curl -fL --retry 5 --retry-delay 5 --retry-all-errors -C - -sS -o "$dest.part" "$url"; then
    echo "ERROR: download failed: $url" >&2
    fail=1
    continue
  fi
  got=$(file_size "$dest.part")
  if [ "$got" != "$expected" ]; then
    echo "ERROR: size mismatch for $dest.part: got $got, expected $expected" >&2
    fail=1
    continue
  fi
  mv "$dest.part" "$dest"
  echo "done: $dest"
done

if [ "$fail" -ne 0 ]; then
  echo "Some downloads failed; re-run to resume." >&2
  exit 1
fi
echo "All model files present."
