#!/usr/bin/env bash
# Real-GPU assertion of the diagnostics metrics agent (feature diagnostics-dashboard, spec item 3).
#
# Usage: bash scripts/diagnostics/gpu-check.sh [--llm-only] [--keep-samples <file>]
#   default     runs scripts/ai/simulation-smoke.sh (real AI; that script holds
#               /tmp/bricomission-gpu.lock and needs the embedder, see AGENTS.md) while recording the
#               agent's 1 s samples, then asserts that llama-server AND comfyui each showed non-zero
#               VRAM and a non-zero GPU % at some sample.
#   --llm-only  short check: holds /tmp/bricomission-gpu.lock itself, starts llama-server only, sends
#               one chat completion, asserts non-zero VRAM and GPU % for llama-server, and stops
#               llama-server again. ComfyUI is not exercised.
# Both modes also assert what must always hold: per-container GPU % carries approx=true (it is the
# card busy % attributed by KFD occupancy, never a measurement), no attributed value exceeds the
# card busy % of the same sample, and the host VRAM/GPU values are present.
# Needs the agent running: docker compose --profile diagnostics up -d --wait diagnostics-agent
# The agent has no published port, so samples are read with `docker compose exec` inside it.
# Afterwards (default mode) stop the GPU services yourself:
#   docker compose --profile ai stop llama-server comfyui && docker compose up -d --wait api
# Never prints tokens.
set -euo pipefail

cd "$(dirname "$0")/../.."

mode=full
keep=""
while [ $# -gt 0 ]; do
  case "$1" in
    --llm-only) mode=llm ;;
    --keep-samples) keep="${2:?--keep-samples needs a file}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v node >/dev/null || { echo "ERROR: node is required on the host for the analysis" >&2; exit 1; }
[ -n "$(docker compose ps -q --status running diagnostics-agent 2>/dev/null)" ] || {
  echo "ERROR: diagnostics-agent is not running. Start it: docker compose --profile diagnostics up -d --wait diagnostics-agent" >&2
  exit 1
}

WORK=$(mktemp -d)
samples="$WORK/samples.ndjson"
recorder=""
cleanup() {
  [ -n "$recorder" ] && kill "$recorder" 2>/dev/null || true
  [ -n "$keep" ] && [ -s "$samples" ] && cp "$samples" "$keep" || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# One JSON sample per line, read from the agent's SSE stream inside its own container.
docker compose exec -T diagnostics-agent node --input-type=module -e '
const res = await fetch("http://127.0.0.1:3300/metrics/stream", { headers: { "x-diagnostics-token": process.env.DIAGNOSTICS_TOKEN } });
if (!res.ok) { console.error("stream HTTP " + res.status); process.exit(1); }
const decoder = new TextDecoder(); let buffer = "";
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf("\n\n")) >= 0) {
    const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    if (frame.startsWith("event: metrics\n")) console.log(frame.slice(frame.indexOf("data: ") + 6));
  }
}' > "$samples" &
recorder=$!
sleep 2
[ -s "$samples" ] || { echo "ERROR: the agent stream produced no sample in 2 s" >&2; exit 1; }

if [ "$mode" = llm ]; then
  exec 9>/tmp/bricomission-gpu.lock
  flock -w 900 9 || { echo "ERROR: GPU lock busy" >&2; exit 1; }
  echo "== starting llama-server (profile ai)"
  docker compose --profile ai up -d --wait llama-server >/dev/null
  port=$(docker compose port llama-server 8080 | tail -n1 | awk -F: '{print $NF}')
  echo "== one chat completion (model ${LLM_MODEL:-qwen3-vl}; the first request loads the model)"
  curl -fsS --max-time 240 -H 'Content-Type: application/json' -o "$WORK/reply.json" \
    --data "{\"model\":\"${LLM_MODEL:-qwen3-vl}\",\"max_tokens\":400,\"messages\":[{\"role\":\"user\",\"content\":\"Describe, in about 250 words, how to plan a kitchen renovation.\"}]}" \
    "http://127.0.0.1:$port/v1/chat/completions"
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("   completion tokens:",r.usage?.completion_tokens)' "$WORK/reply.json"
  sleep 2
  docker compose exec -T diagnostics-agent node -e 'fetch("http://127.0.0.1:3300/metrics",{headers:{"x-diagnostics-token":process.env.DIAGNOSTICS_TOKEN}}).then(r=>r.json()).then(s=>console.log("   llama-server while loaded:",JSON.stringify(s.containers["llama-server"])))'
  echo "== stopping llama-server"
  docker compose --profile ai stop llama-server >/dev/null
  flock -u 9
  required="llama-server"
else
  echo "== running scripts/ai/simulation-smoke.sh (real AI) while recording the agent"
  bash scripts/ai/simulation-smoke.sh
  required="llama-server comfyui"
fi

sleep 2
kill "$recorder" 2>/dev/null || true
wait "$recorder" 2>/dev/null || true
recorder=""

node - "$samples" $required <<'NODE'
const fs = require('node:fs');
const [file, ...required] = process.argv.slice(2);
const samples = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { console.error('FAIL: ' + message); process.exitCode = 1; };
console.log(`== ${samples.length} samples over ${((samples.at(-1).ts - samples[0].ts) / 1000).toFixed(0)} s`);
const peak = (pick) => samples.reduce((max, sample) => Math.max(max, pick(sample) ?? 0), 0);
console.log(`   host peaks: VRAM ${peak((s) => s.host.vramUsedMiB)} of ${samples[0].host.vramTotalMiB} MiB, GPU busy ${peak((s) => s.host.gpuBusyPct)} %, CPU ${peak((s) => s.host.cpuPct)} % of ${samples[0].host.threads} threads`);
if (samples.some((s) => s.host.vramUsedMiB == null || s.host.gpuBusyPct == null)) fail('host VRAM or GPU busy % missing in a sample');
for (const name of ['llama-server', 'comfyui']) {
  const of = (pick) => peak((s) => (s.containers[name] ? pick(s.containers[name]) : null));
  const vram = of((c) => c.vramMiB), gpu = of((c) => c.gpuPct), cores = of((c) => c.cores), ram = of((c) => c.ramMiB);
  const gpuSamples = samples.filter((s) => (s.containers[name]?.gpuPct ?? 0) > 0).length;
  console.log(`   ${name}: peak VRAM ${vram} MiB, peak GPU ~${gpu} % (approx, non-zero in ${gpuSamples} samples), peak CPU ${cores} cores, peak RAM ${ram} MiB`);
  if (!required.includes(name)) continue;
  if (!(vram > 0)) fail(`${name}: VRAM never above 0`);
  if (!(gpu > 0)) fail(`${name}: GPU % never above 0`);
}
for (const sample of samples) {
  let attributed = 0;
  for (const [name, c] of Object.entries(sample.containers)) {
    if (c.gpuPct != null && c.gpuPct > 0 && c.approx !== true) fail(`${name}: GPU % ${c.gpuPct} without approx=true at ${sample.ts}`);
    if (c.approx) attributed += c.gpuPct ?? 0;
  }
  if (attributed > (sample.host.gpuBusyPct ?? 0) + 0.5) fail(`attributed GPU % ${attributed} exceeds the card busy % ${sample.host.gpuBusyPct} at ${sample.ts}`);
}
if (!process.exitCode) console.log('PASS: ' + required.join(' and ') + ' showed non-zero VRAM and GPU % (approx); attribution never exceeded the card value');
NODE
