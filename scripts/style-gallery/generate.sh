#!/usr/bin/env bash
# Generate the Style Gallery source images with the local SDXL checkpoint (feature moodboard-selection).
#
# Development-time tool only: the API never generates gallery images at runtime. The committed
# JPEGs in apps/api/assets/style-gallery/ are the source of truth; this script records how they
# were made (ROCm is not bit-exact, so re-runs give similar but not identical pixels).
#
# Prerequisites (GPU, about 15 GB VRAM; never co-resident with the LLM):
#   docker compose stop llama-server              # if it is running
#   docker compose --profile ai up -d --wait comfyui
# Afterwards:
#   docker compose --profile ai stop comfyui      # name the service (a bare profile stop also stops the core stack)
#
# Usage: scripts/style-gallery/generate.sh [image-id ...]
#   Without ids, every image of apps/api/assets/style-gallery/manifest.json is generated.
#   Prompt and seed come from the manifest; workflow = infra/comfyui/workflows/sdxl-txt2img.json.
#   PNGs land in .style-gallery-work/png/<id>.png (git-ignored; ComfyUI PNGs embed the prompt
#   and workflow, so they are never committed). Then run:
#   node apps/api/scripts/build-style-gallery.ts
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
base="http://127.0.0.1:${COMFYUI_PORT:-8188}"
manifest="$root/apps/api/assets/style-gallery/manifest.json"
workflow="$root/infra/comfyui/workflows/sdxl-txt2img.json"
out_dir="${STYLE_GALLERY_WORK_DIR:-$root/.style-gallery-work}/png"
mkdir -p "$out_dir"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if docker compose -f "$root/compose.yaml" ps --status running --services 2>/dev/null | grep -qx llama-server; then
  echo "llama-server is running. Stop it first: docker compose stop llama-server" >&2
  exit 1
fi
if ! curl -fsS -o /dev/null "$base/system_stats"; then
  echo "ComfyUI is not reachable at $base. Start it: docker compose --profile ai up -d --wait comfyui" >&2
  exit 1
fi

# Lines "id<TAB>seed" for the requested ids (all when none given).
python3 -I - "$manifest" "$@" > "$tmp/ids.tsv" <<'PY'
import json, sys
images = json.load(open(sys.argv[1]))["images"]
wanted = sys.argv[2:]
known = {image["id"] for image in images}
unknown = [w for w in wanted if w not in known]
if unknown:
    sys.exit("unknown image id(s): " + ", ".join(unknown))
for image in images:
    if not wanted or image["id"] in wanted:
        print(f'{image["id"]}\t{image["seed"]}')
PY

while IFS=$'\t' read -r id seed; do
  python3 -I - "$workflow" "$manifest" "$id" "$tmp/prompt.json" <<'PY'
import json, sys, uuid
wf = json.load(open(sys.argv[1]))
image = next(i for i in json.load(open(sys.argv[2]))["images"] if i["id"] == sys.argv[3])
for node in wf.values():
    if node["class_type"] == "CLIPTextEncode" and node["inputs"]["text"] == "__PROMPT__":
        node["inputs"]["text"] = image["prompt"]
    if node["class_type"] == "KSampler":
        node["inputs"]["seed"] = image["seed"]
    if node["class_type"] == "SaveImage":
        node["inputs"]["filename_prefix"] = "style-gallery-" + image["id"]
json.dump({"prompt": wf, "client_id": str(uuid.uuid4())}, open(sys.argv[4], "w"))
PY
  t0=$(date +%s%N)
  pid=$(curl -fsS -H 'Content-Type: application/json' --data @"$tmp/prompt.json" "$base/prompt" \
    | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["prompt_id"])')
  while :; do
    curl -fsS "$base/history/$pid" -o "$tmp/hist.json"
    state=$(python3 -I - "$tmp/hist.json" "$pid" <<'PY'
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
    sleep 0.5
  done
  if [ "$state" = error ]; then
    echo "ERROR: ComfyUI run failed for $id" >&2
    exit 1
  fi
  read -r fn sub typ < <(python3 -I - "$tmp/hist.json" "$pid" <<'PY'
import json, sys
outs = json.load(open(sys.argv[1]))[sys.argv[2]]["outputs"]
img = next(iter(outs.values()))["images"][0]
print(img["filename"], img.get("subfolder") or "-", img.get("type", "output"))
PY
)
  [ "$sub" = "-" ] && sub=""
  curl -fsS -G --data-urlencode "filename=$fn" --data-urlencode "subfolder=$sub" --data-urlencode "type=$typ" "$base/view" -o "$out_dir/$id.png"
  t1=$(date +%s%N)
  echo "$id seed=$seed $(python3 -I -c "print(f'{($t1-$t0)/1e9:.1f}')")s -> $out_dir/$id.png"
done < "$tmp/ids.tsv"

echo "Done. Next: node apps/api/scripts/build-style-gallery.ts"
