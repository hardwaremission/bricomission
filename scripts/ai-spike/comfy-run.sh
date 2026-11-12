#!/usr/bin/env bash
# Run an SDXL + ControlNet workflow against ComfyUI (feature local-ai-gpu-spike).
# Usage: scripts/ai-spike/comfy-run.sh <depth|canny> <image> [warm_runs]   (default 3 warm runs)
# Frees ComfyUI models first (POST /free) so run 1 is a cold load, then runs warm
# renders. Each run uploads the photo under a new name so ComfyUI's node cache
# cannot skip the preprocessor or sampler. Saves the cold-run render to
# docs/spikes/assets/render-<mode>.jpg and its control hint to /tmp, and prints
# seconds per image (wall clock from POST /prompt to finished history entry).
set -euo pipefail

mode="${1:?usage: comfy-run.sh <depth|canny> <image> [warm_runs]}"
image="${2:?usage: comfy-run.sh <depth|canny> <image> [warm_runs]}"
warm="${3:-3}"
case "$mode" in depth|canny) ;; *) echo "mode must be depth or canny" >&2; exit 2;; esac
[ -f "$image" ] || { echo "image not found: $image" >&2; exit 2; }

root="$(cd "$(dirname "$0")/../.." && pwd)"
base="http://127.0.0.1:${COMFYUI_PORT:-8188}"
workflow="$root/infra/comfyui/workflows/sdxl-controlnet-$mode.json"
out_dir="${COMFY_OUT_DIR:-$root/docs/spikes/assets}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out_dir"

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"unload_models":true,"free_memory":true}' "$base/free" >/dev/null
sleep 2

times=()
for i in $(seq 0 "$warm"); do
  name="spike-$mode-$(date +%s%N)-$i.jpg"
  uploaded=$(curl -fsS -F "image=@$image;filename=$name" -F overwrite=true "$base/upload/image" \
    | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print((d["subfolder"]+"/" if d.get("subfolder") else "")+d["name"])')
  python3 -I - "$workflow" "$uploaded" "$work/prompt.json" <<'PY'
import json, sys, uuid
wf = json.load(open(sys.argv[1]))
for node in wf.values():
    if node["class_type"] == "LoadImage":
        node["inputs"]["image"] = sys.argv[2]
json.dump({"prompt": wf, "client_id": str(uuid.uuid4())}, open(sys.argv[3], "w"))
PY
  t0=$(date +%s%N)
  pid=$(curl -fsS -H 'Content-Type: application/json' --data @"$work/prompt.json" "$base/prompt" \
    | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["prompt_id"])')
  while :; do
    curl -fsS "$base/history/$pid" -o "$work/hist.json"
    state=$(python3 -I - "$work/hist.json" "$pid" <<'PY'
import json, sys
h = json.load(open(sys.argv[1])).get(sys.argv[2])
if not h:
    print("pending")
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
    echo "ERROR: ComfyUI run failed:" >&2
    python3 -I -c 'import json,sys; h=json.load(open(sys.argv[1]))[sys.argv[2]]; print(json.dumps(h["status"], indent=1)[:4000])' "$work/hist.json" "$pid" >&2
    exit 1
  fi
  secs=$(python3 -I -c "print(f'{($t1-$t0)/1e9:.2f}')")
  label=$([ "$i" -eq 0 ] && echo cold || echo "warm$i")
  echo "run $label: ${secs}s"
  times+=("$label=$secs")
  if [ "$i" -eq 0 ]; then
    python3 -I - "$work/hist.json" "$pid" > "$work/files.txt" <<'PY'
import json, sys
outs = json.load(open(sys.argv[1]))[sys.argv[2]]["outputs"]
for node_id in ("12", "13"):
    img = outs[node_id]["images"][0]
    print(node_id, img["filename"], img.get("subfolder") or "-", img.get("type", "output"))
PY
    while read -r node fn sub typ; do
      dest="$work/node-$node.png"
      [ "$sub" = "-" ] && sub=""
      curl -fsS -G --data-urlencode "filename=$fn" --data-urlencode "subfolder=$sub" --data-urlencode "type=$typ" "$base/view" -o "$dest"
    done < "$work/files.txt"
    ffmpeg -loglevel error -y -i "$work/node-12.png" -q:v 3 "$out_dir/render-$mode.jpg"
    ffmpeg -loglevel error -y -i "$work/node-13.png" -q:v 3 "/tmp/spike-hint-$mode.jpg"
    echo "saved: $out_dir/render-$mode.jpg ($(stat -c %s "$out_dir/render-$mode.jpg") bytes); hint: /tmp/spike-hint-$mode.jpg"
  fi
done

python3 -I - "${times[@]}" <<'PY'
import statistics, sys
pairs = [a.split("=") for a in sys.argv[1:]]
cold = float(pairs[0][1]); warm = [float(v) for k, v in pairs[1:]]
print(f"summary: cold={cold:.2f}s warm_median={statistics.median(warm):.2f}s warm_runs={warm} (1216x832, 25 steps, dpmpp_2m karras, cfg 6, CN strength 0.8)" if warm else f"summary: cold={cold:.2f}s")
PY
