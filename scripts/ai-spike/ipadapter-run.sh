#!/usr/bin/env bash
# IP-Adapter style-reference render against ComfyUI (feature simulations-ux-overhaul, spike A2).
# Usage: scripts/ai-spike/ipadapter-run.sh <n_refs> <photo> <ref_dir> [out.jpg] [base_weight] [mode]
#   n_refs   number of reference images used (1..12; images repeat cyclically from <ref_dir>/*.jpg)
#   mode     "chain" (default: IPAdapterEncoder per reference, merged with IPAdapterCombineEmbeds
#            in groups of up to 5 and the partial results combined again) or "top5" (fallback: only
#            the 5 heaviest references reach IP-Adapter)
# Workflow = existing canny ControlNet (0.6/0.95, 0.8, end 0.5) + depth assist (0.7, end 1)
# at 1216x832 + IPAdapterEmbeds on the checkpoint model. Weight per reference:
# min(1, base * n * w_i) with w_i = 1/n (equal weights) => base. Runs one cold and one warm render,
# prints seconds, and writes the warm render to <out.jpg>.
# Run it under: flock /tmp/bricomission-gpu.lock scripts/ai-spike/ipadapter-run.sh ...
set -euo pipefail

n="${1:?usage: ipadapter-run.sh <n_refs> <photo> <ref_dir> [out.jpg] [base_weight] [mode]}"
photo="${2:?photo}"; refdir="${3:?ref_dir}"; out="${4:-}"; base_w="${5:-0.6}"; mode="${6:-chain}"
base="http://127.0.0.1:${COMFYUI_PORT:-8188}"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
[ "$n" -ge 0 ] && [ "$n" -le 12 ] || { echo "n_refs must be 0..12" >&2; exit 2; }

upload() { # <file> <name>
  curl -fsS -F "image=@$1;filename=$2" -F overwrite=true "$base/upload/image" \
    | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print((d["subfolder"]+"/" if d.get("subfolder") else "")+d["name"])'
}

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"unload_models":true,"free_memory":true}' "$base/free" >/dev/null
sleep 2
mapfile -t files < <(ls "$refdir"/*.jpg | sort)
[ "${#files[@]}" -gt 0 ] || { echo "no jpg in $refdir" >&2; exit 2; }

run_once() { # <label> -> prints seconds, leaves $work/hist.json
  local label="$1" stamp; stamp=$(date +%s%N)
  local photo_name; photo_name=$(upload "$photo" "ipa-photo-$stamp.jpg")
  : > "$work/refs.txt"
  for i in $(seq 0 $((n - 1))); do
    echo "$(upload "${files[$((i % ${#files[@]}))]}" "ipa-ref-$stamp-$i.jpg")" >> "$work/refs.txt"
  done
  python3 -I - "$photo_name" "$work/refs.txt" "$base_w" "$mode" "$work/prompt.json" <<'PY'
import json, sys, uuid
photo, refs_file, base_w, mode, outp = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
refs = [l.strip() for l in open(refs_file) if l.strip()]
n = len(refs)
W, H = 1216, 832
wf = {
 "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "RealVisXL_V5.0_fp16.safetensors"}},
 "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "photorealistic renovated modern kitchen, interior design photography, natural daylight, sharp focus, high detail", "clip": ["1", 1]}},
 "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, lowres, cartoon, painting, cgi, distorted perspective, warped walls, people, text, watermark", "clip": ["1", 1]}},
 "4": {"class_type": "LoadImage", "inputs": {"image": photo}},
 "5": {"class_type": "ImageScale", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "width": W, "height": H, "crop": "center"}},
 "6": {"class_type": "Canny", "inputs": {"image": ["5", 0], "low_threshold": 0.6, "high_threshold": 0.95}},
 "7": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "sdxl-canny.safetensors"}},
 "8": {"class_type": "ControlNetApplyAdvanced", "inputs": {"positive": ["2", 0], "negative": ["3", 0], "control_net": ["7", 0], "image": ["6", 0], "strength": 0.8, "start_percent": 0, "end_percent": 0.5, "vae": ["1", 2]}},
 "13": {"class_type": "DepthAnythingV2Preprocessor", "inputs": {"image": ["5", 0], "ckpt_name": "depth_anything_v2_vits.pth", "resolution": 1024}},
 "14": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "sdxl-depth.safetensors"}},
 "15": {"class_type": "ControlNetApplyAdvanced", "inputs": {"positive": ["8", 0], "negative": ["8", 1], "control_net": ["14", 0], "image": ["13", 0], "strength": 0.7, "start_percent": 0, "end_percent": 1, "vae": ["1", 2]}},
 "9": {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
 "11": {"class_type": "VAEDecode", "inputs": {"samples": ["10", 0], "vae": ["1", 2]}},
 "12": {"class_type": "PreviewImage", "inputs": {"images": ["11", 0]}},
}
model = ["1", 0]
if n > 0:
    # Equal weights w_i = 1/n; per-reference weight min(1, base * n * w_i).
    weights = [min(1.0, base_w * n * (1.0 / n)) for _ in refs]
    idx = list(range(n))
    if mode == "top5":
        idx = sorted(idx, key=lambda i: (-weights[i], i))[:5]
    wf["20"] = {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": "ip-adapter-plus_sdxl_vit-h.safetensors"}}
    wf["21"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"}}
    enc = []
    for k, i in enumerate(idx):
        li, ei = f"3{k:02d}", f"4{k:02d}"
        wf[li] = {"class_type": "LoadImage", "inputs": {"image": refs[i]}}
        wf[ei] = {"class_type": "IPAdapterEncoder", "inputs": {"ipadapter": ["20", 0], "image": [li, 0], "weight": weights[i], "clip_vision": ["21", 0]}}
        enc.append(ei)
    def combine(ids, tag):
        if len(ids) == 1:
            return ids[0]
        nid = f"5{tag}"
        inputs = {"method": "concat"}
        for j, e in enumerate(ids):
            inputs[f"embed{j + 1}"] = [e, 0]
        wf[nid] = {"class_type": "IPAdapterCombineEmbeds", "inputs": inputs}
        return nid
    groups = [enc[i:i + 5] for i in range(0, len(enc), 5)]
    parts = [combine(g, f"{gi:02d}") for gi, g in enumerate(groups)]
    final = combine(parts, "99") if len(parts) > 1 else parts[0]
    wf["60"] = {"class_type": "IPAdapterEmbeds", "inputs": {
        "model": ["1", 0], "ipadapter": ["20", 0], "pos_embed": [final, 0], "weight": 1.0,
        "weight_type": "linear", "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only", "clip_vision": ["21", 0]}}
    model = ["60", 0]
wf["10"] = {"class_type": "KSampler", "inputs": {"model": model, "seed": 20261114, "steps": 25, "cfg": 6.0,
    "sampler_name": "dpmpp_2m", "scheduler": "karras", "positive": ["15", 0], "negative": ["15", 1],
    "latent_image": ["9", 0], "denoise": 1.0}}
json.dump({"prompt": wf, "client_id": str(uuid.uuid4())}, open(outp, "w"))
PY
  local t0 t1 pid state
  t0=$(date +%s%N)
  pid=$(curl -sS -H 'Content-Type: application/json' --data @"$work/prompt.json" "$base/prompt" -o "$work/resp.json" -w '%{http_code}' ) || true
  if [ "$pid" != 200 ]; then echo "ERROR: POST /prompt $pid"; head -c 2500 "$work/resp.json" >&2; exit 1; fi
  pid=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["prompt_id"])' "$work/resp.json")
  while :; do
    curl -fsS "$base/history/$pid" -o "$work/hist.json"
    state=$(python3 -I - "$work/hist.json" "$pid" <<'PY'
import json, sys
h = json.load(open(sys.argv[1])).get(sys.argv[2])
if not h: print("pending")
else:
    st = h.get("status", {})
    print("error" if st.get("status_str") == "error" else ("done" if st.get("completed") else "pending"))
PY
)
    [ "$state" = pending ] || break
    sleep 0.25
  done
  t1=$(date +%s%N)
  if [ "$state" = error ]; then
    echo "ERROR: render failed:" >&2
    python3 -I -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))[sys.argv[2]]["status"], indent=1)[:3500])' "$work/hist.json" "$pid" >&2
    exit 1
  fi
  python3 -I -c "print(f'{($t1-$t0)/1e9:.2f}')"
  echo "$pid" > "$work/pid"
}

cold=$(run_once cold); echo "refs=$n mode=$mode base_weight=$base_w cold=${cold}s"
warm=$(run_once warm); echo "refs=$n mode=$mode base_weight=$base_w warm=${warm}s"
if [ -n "$out" ]; then
  pid=$(cat "$work/pid")
  python3 -I - "$work/hist.json" "$pid" > "$work/file.txt" <<'PY'
import json, sys
img = json.load(open(sys.argv[1]))[sys.argv[2]]["outputs"]["12"]["images"][0]
print(img["filename"], img.get("subfolder") or "-", img.get("type", "temp"))
PY
  read -r fn sub typ < "$work/file.txt"; [ "$sub" = "-" ] && sub=""
  curl -fsS -G --data-urlencode "filename=$fn" --data-urlencode "subfolder=$sub" --data-urlencode "type=$typ" "$base/view" -o "$work/r.png"
  mkdir -p "$(dirname "$out")"
  ffmpeg -loglevel error -y -i "$work/r.png" -q:v 3 "$out"
  echo "saved $out"
fi
