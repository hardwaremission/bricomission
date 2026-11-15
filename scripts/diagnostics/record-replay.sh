#!/usr/bin/env bash
# Records the session the diagnostics dashboard plays with ?source=replay (or DIAGNOSTICS_SOURCE=replay):
# apps/diagnostics/replay/demo-simulation-budget.ndjson (feature diagnostics-dashboard, Decision 16).
#
# Usage: bash scripts/diagnostics/record-replay.sh [--out FILE]
#
# It reads the dashboard's own browser stream (http://127.0.0.1:$DIAGNOSTICS_PORT/stream: the API events,
# already redacted by the API, the agent metrics and the inferred mail event) while the "demo path" test
# of apps/web/e2e/diagnostics.spec.ts drives the portrait app on the fake adapters: draft, sign-in with
# the email code, one Simulation (2 photos, 2 style references), one Budget. Events that were already in
# the API buffer before the recording are dropped. Lines: {"at": ms since the first frame,
# "frame": "event"|"metrics", "data": {...}} with the original timing.
# Polling events (status polls every 2 s, health checks) are not recorded: they carry nothing to read and
# the dashboard only draws them as a counter row.
# The file is refused when it contains the diagnostics token, a Bearer value, a JWT shape or a session
# cookie name with a value. Rebuild the dashboard image afterwards (the file is baked into it):
#   docker compose --profile diagnostics up -d --build --wait diagnostics
# Needs: the stack as scripts/diagnostics/e2e.sh leaves it (that script is run with --live-only first).
# Never prints tokens.
set -euo pipefail
cd "$(dirname "$0")/../.."

out=apps/diagnostics/replay/demo-simulation-budget.ndjson
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="${2:?--out needs a file}"; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
command -v node >/dev/null || { echo "ERROR: node is required on the host" >&2; exit 1; }

export DIAGNOSTICS_ENABLED=true
echo "==> Stack with diagnostics on, embedder and the sample Catalog"
docker compose --profile diagnostics up -d --build --quiet-build --wait --wait-timeout 300
docker compose --profile rag up -d --wait embedder
./scripts/catalog/ingest.sh infra/catalog/samples | tail -n 1
port=$(docker compose port diagnostics 3000 | awk -F: '{print $NF}')

work=$(mktemp -d)
recorder=""
cleanup() {
  [ -n "$recorder" ] && kill "$recorder" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

node --input-type=module -e '
import { createWriteStream } from "node:fs";
const [url, file] = process.argv.slice(1);
const out = createWriteStream(file);
const res = await fetch(url);
if (!res.ok) { console.error("stream HTTP " + res.status); process.exit(1); }
const decoder = new TextDecoder();
let buffer = "", skipUpTo = null, start = null;
const stop = () => out.end(() => process.exit(0));
process.on("SIGTERM", stop); process.on("SIGINT", stop);
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf("\n\n")) >= 0) {
    const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    let event = "message", data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (event === "hello") { skipUpTo = JSON.parse(data).newestSeq ?? 0; continue; }
    if (skipUpTo === null || (event !== "event" && event !== "metrics")) continue;
    const value = JSON.parse(data);
    if (event === "event") {
      if (/^\d+$/.test(value.id) && Number(value.id) <= skipUpTo) continue; // already buffered before the recording
      if (value.poll) continue;
    }
    if (start === null) start = Date.now();
    out.write(JSON.stringify({ at: Date.now() - start, frame: event, data: value }) + "\n");
  }
}
' "http://127.0.0.1:${port}/stream" "$work/session.ndjson" &
recorder=$!
sleep 2
kill -0 "$recorder" 2>/dev/null || { echo "ERROR: the recorder could not read the dashboard stream" >&2; exit 1; }

echo "==> Driving the app (E2E demo path: sign-in, Simulation, Budget)"
E2E_DIAGNOSTICS_STATE=live E2E_DIAGNOSTICS_REQUIRED=1 bash scripts/web/e2e.sh --project=desktop-1920 --grep "demo path"
sleep 3
kill -TERM "$recorder"; wait "$recorder" 2>/dev/null || true
recorder=""

echo "==> Checking the recording"
token="$(docker compose exec -T api printenv DIAGNOSTICS_TOKEN | tr -d '\r')"
RECORDED_TOKEN="$token" node --input-type=module -e '
import { readFileSync } from "node:fs";
const text = readFileSync(process.argv[1], "utf8");
const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const events = lines.filter((l) => l.frame === "event");
const problems = [];
if (process.env.RECORDED_TOKEN && text.includes(process.env.RECORDED_TOKEN)) problems.push("the diagnostics token");
if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(text)) problems.push("a Bearer value");
if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./.test(text)) problems.push("a JWT");
if (/bm_(session|draft)=[^\s";]{8,}/.test(text)) problems.push("a session or draft cookie value");
const hop = (from, to) => events.some((l) => l.data.from === from && l.data.to === to);
for (const [from, to] of [["browser", "web"], ["ai-adapters", "comfyui"], ["ai-adapters", "llama-server"], ["budget-engine", "budget-math"], ["catalog-search", "embedder"]]) {
  if (!hop(from, to)) problems.push("no " + from + " > " + to + " event");
}
if (problems.length > 0) { console.error("ERROR: the recording is refused: " + problems.join(", ")); process.exit(1); }
const last = lines[lines.length - 1];
console.log("events " + events.length + ", metric samples " + (lines.length - events.length) + ", " + Math.round(last.at / 1000) + " s, " + Math.round(text.length / 1024) + " KB, correlation ids " + new Set(events.map((l) => l.data.correlationId)).size);
' "$work/session.ndjson"
cp "$work/session.ndjson" "$out"
echo "written: $out"
echo "Rebuild the dashboard image to serve it: docker compose --profile diagnostics up -d --build --wait diagnostics"
