#!/usr/bin/env bash
# Vision-language benchmark for llama-server (feature simulations-ux-overhaul, spike A1).
# Usage: scripts/ai-spike/vlm-bench.sh [image] [runs] [max_edge]
#   defaults: infra/ai/samples/kitchen-sample.jpg, 3 runs, 768 px long edge.
# Downscales the image with ffmpeg, sends it as an image_url data URI to
# /v1/chat/completions with a json_schema response_format (style traits), validates the JSON
# with python3 stdlib, and prints prompt tokens (image tokens = prompt tokens minus a text-only
# call), prompt/generation tokens/s and wall seconds per run. Exit 0 only if every run is valid.
# Run it under: flock /tmp/bricomission-gpu.lock scripts/ai-spike/vlm-bench.sh ...
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
image="${1:-$root/infra/ai/samples/kitchen-sample.jpg}"
runs="${2:-3}"
edge="${3:-768}"
base="http://127.0.0.1:${LLAMA_PORT:-8080}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
[ -f "$image" ] || { echo "image not found: $image" >&2; exit 2; }

ffmpeg -loglevel error -y -i "$image" \
  -vf "scale='if(gt(iw,ih),min($edge,iw),-2)':'if(gt(iw,ih),-2,min($edge,ih))'" -q:v 3 "$work/in.jpg"
echo "input: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$work/in.jpg") px"

python3 -I - "$work" <<'PY'
import base64, json, os, sys
w = sys.argv[1]
schema = {
    "type": "object",
    "properties": {
        "style_summary": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "materials": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "palette": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
    },
    "required": ["style_summary", "keywords", "materials", "palette"],
    "additionalProperties": False,
}
prompt = ("Describe the interior design style of this kitchen photo: a one-sentence summary, "
          "style keywords, visible materials and the main colours. Answer in JSON only.")
b64 = base64.b64encode(open(w + "/in.jpg", "rb").read()).decode()
def req(with_image):
    content = [{"type": "text", "text": prompt}]
    if with_image:
        content.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}})
    return {"model": os.environ.get("LLM_MODEL", "qwen3-vl"), "messages": [{"role": "user", "content": content}], "temperature": 0, "max_tokens": 400,
            "response_format": {"type": "json_schema", "json_schema": {"name": "style", "strict": True, "schema": schema}}}
json.dump(req(True), open(w + "/req-image.json", "w"))
json.dump(req(False), open(w + "/req-text.json", "w"))
PY

call() { curl -fsS --max-time 300 -H 'Content-Type: application/json' --data @"$1" "$base/v1/chat/completions" -o "$2"; }
call "$work/req-text.json" "$work/text.json"
text_tokens=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["usage"]["prompt_tokens"])' "$work/text.json")

fail=0
for i in $(seq 1 "$runs"); do
  t0=$(date +%s%N)
  call "$work/req-image.json" "$work/out-$i.json" || { echo "run $i: HTTP failure" >&2; fail=1; continue; }
  t1=$(date +%s%N)
  python3 -I - "$work/out-$i.json" "$text_tokens" "$i" "$t0" "$t1" <<'PY' || fail=1
import json, sys
d = json.load(open(sys.argv[1])); text_tokens = int(sys.argv[2])
t = d.get("timings", {})
try:
    body = json.loads(d["choices"][0]["message"]["content"])
    assert body["style_summary"] and isinstance(body["keywords"], list)
    ok = "valid-json"
except Exception as e:
    body, ok = d["choices"][0]["message"]["content"][:300], f"INVALID ({e})"
pt = d["usage"]["prompt_tokens"]
secs = (int(sys.argv[5]) - int(sys.argv[4])) / 1e9
print(f"run {sys.argv[3]}: {ok} wall={secs:.2f}s prompt_tokens={pt} image_tokens~{pt - text_tokens} "
      f"prompt_tps={t.get('prompt_per_second', 0):.0f} gen_tokens={d['usage']['completion_tokens']} "
      f"gen_tps={t.get('predicted_per_second', 0):.1f} prompt_ms={t.get('prompt_ms', 0):.0f}")
if sys.argv[3] == "1":
    print(json.dumps(body, indent=1)[:900])
sys.exit(0 if ok == "valid-json" else 1)
PY
done
exit "$fail"
