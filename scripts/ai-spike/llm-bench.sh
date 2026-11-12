#!/usr/bin/env bash
# Structured-output benchmark for llama-server (feature local-ai-gpu-spike).
# Usage: scripts/ai-spike/llm-bench.sh [runs]   (default 3)
# Sends a ~2k-token Line Item extraction prompt to /v1/chat/completions with a
# json_schema response_format, validates every response with python3 stdlib, and
# prints median prompt/generation tokens/s and time-to-first-token (prompt_ms)
# from llama-server's `timings`. Exit 0 only if every run returns valid JSON.
set -euo pipefail

runs="${1:-3}"
base="http://127.0.0.1:${LLAMA_PORT:-8080}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

python3 -I - "$work/request.json" <<'PY'
import json, sys
catalog = []
families = [
    ("CAB", "Base cabinet", "unit", "Melamine carcass, soft-close hinges, adjustable legs"),
    ("WAL", "Wall cabinet", "unit", "Melamine carcass, lift-up or hinged door, wall rail"),
    ("WTP", "Laminate worktop", "m", "38 mm laminate worktop, moisture-resistant core"),
    ("QTZ", "Quartz worktop", "m", "20 mm engineered quartz, polished edge"),
    ("TIL", "Wall tile", "m2", "Ceramic wall tile 10x30 cm, gloss white"),
    ("SNK", "Sink", "unit", "Stainless steel single-bowl inset sink with waste"),
    ("TAP", "Mixer tap", "unit", "Chrome single-lever mixer tap, swivel spout"),
    ("HOB", "Induction hob", "unit", "60 cm induction hob, 4 zones, touch control"),
    ("LED", "Under-cabinet LED", "m", "LED strip with aluminium profile, 4000 K"),
    ("HND", "Door handle", "unit", "Brushed steel bar handle, 160 mm centres"),
]
for i, (code, name, unit, desc) in enumerate(families):
    for w in (30, 40, 60, 80):
        sku = f"{code}-{w:03d}"
        catalog.append(f"[p.{12 + i}, ref {sku}] {name} {w} cm variant. {desc}. Sold per {unit}. Colour options: white, oak, graphite.")
text = "\n".join(catalog)
request_text = (
    "Homeowner request: I need two 60 cm base cabinets, one 80 cm wall cabinet, 3.2 metres of laminate worktop, "
    "4.5 square metres of white wall tile, one stainless sink with a mixer tap, and 2 metres of LED under-cabinet lighting."
)
schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["items"],
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["sku", "description", "quantity", "unit", "source_ref"],
                "properties": {
                    "sku": {"type": "string"},
                    "description": {"type": "string"},
                    "quantity": {"type": "number"},
                    "unit": {"type": "string"},
                    "source_ref": {"type": "string"},
                },
            },
        }
    },
}
body = {
    "messages": [
        {"role": "system", "content": "You extract Line Items for a kitchen renovation Budget. Use only SKUs from the catalog excerpt. Never output prices. source_ref is the catalog page and ref, e.g. 'p.12 CAB-060'."},
        {"role": "user", "content": f"Catalog excerpt:\n{text}\n\n{request_text}\nReturn the Line Items as JSON."},
    ],
    "response_format": {"type": "json_schema", "json_schema": {"name": "line_items", "strict": True, "schema": schema}},
    "max_tokens": 512,
    "temperature": 0,
    "cache_prompt": False,
}
json.dump(body, open(sys.argv[1], "w"))
PY

ok=0
for i in $(seq 1 "$runs"); do
  curl -fsS -H 'Content-Type: application/json' --data @"$work/request.json" \
    "$base/v1/chat/completions" -o "$work/resp-$i.json"
  if python3 -I - "$work/resp-$i.json" "$i" <<'PY'
import json, sys
resp = json.load(open(sys.argv[1]))
content = resp["choices"][0]["message"]["content"]
t = resp.get("timings", {})
try:
    data = json.loads(content)
    assert isinstance(data, dict) and set(data) == {"items"}, "top-level keys must be exactly {'items'}"
    items = data["items"]
    assert isinstance(items, list) and items, "items must be a non-empty list"
    req = {"sku": str, "description": str, "quantity": (int, float), "unit": str, "source_ref": str}
    for it in items:
        assert set(it) == set(req), f"item keys {sorted(it)}"
        for k, ty in req.items():
            assert isinstance(it[k], ty) and not isinstance(it[k], bool), f"{k} has type {type(it[k]).__name__}"
        assert it["quantity"] > 0, "quantity must be > 0"
    status = f"VALID ({len(items)} items)"
    rc = 0
except Exception as e:  # noqa: BLE001
    status, rc = f"INVALID: {e}", 1
print(f"run {sys.argv[2]}: {status} prompt_n={t.get('prompt_n')} prompt_tps={t.get('prompt_per_second', 0):.1f} "
      f"gen_n={t.get('predicted_n')} gen_tps={t.get('predicted_per_second', 0):.1f} ttft_ms={t.get('prompt_ms', 0):.0f}")
sys.exit(rc)
PY
  then ok=$((ok + 1)); fi
done

echo "--- sample output (run 1) ---"
python3 -I -c 'import json,sys; print(json.dumps(json.loads(json.load(open(sys.argv[1]))["choices"][0]["message"]["content"]), indent=1)[:1500])' "$work/resp-1.json" || true
python3 -I - "$work" "$runs" <<'PY'
import json, statistics, sys, glob
ts = [json.load(open(f)).get("timings", {}) for f in sorted(glob.glob(sys.argv[1] + "/resp-*.json"))]
med = lambda k: statistics.median(t.get(k, 0) for t in ts)
print(f"median: prompt_tps={med('prompt_per_second'):.1f} gen_tps={med('predicted_per_second'):.1f} ttft_ms={med('prompt_ms'):.0f} prompt_tokens={med('prompt_n'):.0f}")
PY
echo "valid JSON: $ok/$runs"
[ "$ok" -eq "$runs" ]
