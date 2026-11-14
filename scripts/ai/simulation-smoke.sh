#!/usr/bin/env bash
# Simulation smoke test against the running stack (feature simulations-ux-overhaul, spec item 4).
#
# Usage: bash scripts/ai/simulation-smoke.sh [--no-gpu] [--out FILE] [--keep]
#   default   real AI: recreates the api with AI_ADAPTERS=local (and checks it). Holds /tmp/bricomission-gpu.lock (flock), starts llama-server
#             (router mode) and comfyui (`--profile ai`), samples VRAM with scripts/ai-spike/vram-sample.sh.
#             The Budget part needs the CPU embedder and the sample Catalog (docker compose --profile rag
#             up -d --wait embedder; it ingests infra/catalog/samples when the index is empty).
#             Afterwards stop them yourself: docker compose --profile ai stop llama-server comfyui;
#             docker compose --profile rag stop embedder; docker compose up -d --wait api (back on fake).
#   --no-gpu  fake adapters (AI_ADAPTERS=fake): same API flow, no lock, no GPU service, no VRAM sampling.
#   --out     contact sheet JPEG (rows: before, then one row per Simulation; columns: photos). GPU default
#             docs/spikes/assets/simulations-blend-modes.jpg; with --no-gpu a temporary file.
#   --keep    keep the Simulations (default: delete them at the end; the project stays).
#
# Flow: anonymous draft with 3 photos (kitchen-sample plus two Style Gallery images) and 3 Moodboard
# references (2 Style Gallery picks and 1 own upload), claim, then one Simulation per blend mode
# (ip_adapter, vlm_text, both, switched through PUT /admin/settings/style-blend with the bm-admin
# token), the default restored (both), a "Generate again" Simulation, selection, and a Budget. For each
# Simulation: stage timings, per-Render seconds (startedAt to finishedAt), style keywords and weights,
# llama-server model status transitions (loaded/unloaded, GPU mode), VRAM peak. Budget: tier totals
# strictly ordered, relabeled flag, psql re-sum of Line Items. Never prints tokens.
# Honours COMPOSE_PROJECT_NAME and the seed password env vars.
set -euo pipefail

cd "$(dirname "$0")/../.."

gpu=1 out= keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-gpu) gpu=0 ;;
    --out) out="${2:?--out needs a file}"; shift ;;
    --keep) keep=1 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -z "$out" ]; then
  if [ "$gpu" = 1 ]; then out=docs/spikes/assets/simulations-blend-modes.jpg; else out="$(mktemp --suffix=.jpg)"; fi
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 2; }
G=apps/api/assets/style-gallery
photos=(infra/ai/samples/kitchen-sample.jpg "$G/scandinavian-02/full.jpg" "$G/classic-03/full.jpg")
upload_ref="$G/farmhouse-01/full.jpg"
for f in "${photos[@]}" "$upload_ref"; do [ -f "$f" ] || { echo "file not found: $f" >&2; exit 2; }; done

host_port() {
  local port
  port=$(docker compose port "$1" "$2" 2>/dev/null | tail -n1 | awk -F: '{print $NF}')
  [ -n "$port" ] || { echo "ERROR: service '$1' has no published port $2. Is the stack up? (./init.sh)" >&2; exit 1; }
  printf '%s' "$port"
}
API="http://127.0.0.1:$(host_port api 3000)"
KC="http://localhost:$(host_port keycloak 8080)"
OIDC="$KC/realms/BricoMission/protocol/openid-connect"
HOMEOWNER_PW=${BM_SEED_HOMEOWNER_PASSWORD:-bm-homeowner-dev}
PROFESSIONAL_PW=${BM_SEED_PROFESSIONAL_PASSWORD:-bm-professional-dev}
ADMIN_PW=${BM_SEED_ADMIN_PASSWORD:-bm-admin-dev}

WORK=$(mktemp -d)
sleeper=
trap '[ -n "$sleeper" ] && kill "$sleeper" 2>/dev/null; rm -rf "$WORK"' EXIT
failures=0
ok() { printf '  [ok]   %s\n' "$1"; }
fail() { printf '  [fail] %s\n' "$1"; failures=$((failures + 1)); }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
json() { python3 -I -c "import json,sys
try:
    d=json.load(sys.stdin); v=$1
    print('' if v is None else v)
except Exception:
    print('')"; }
now() { date +%s%N; }
secs() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", (b-a)/1e9}'; }
psql_at() { docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -F '|' -c \"$1\""; }
password_token() {
  curl -s --max-time 10 -d grant_type=password -d client_id=bricomission-dev-cli -d scope=openid \
    --data-urlencode "username=$1" --data-urlencode "password=$2" "$OIDC/token" | json "d['access_token']"
}

# Access tokens live only a couple of minutes: re-issue them when older than 60 s (a Budget run takes longer).
tok_at=$SECONDS
refresh() {
  if [ $((SECONDS - tok_at)) -ge 60 ]; then
    token=$(password_token bm-homeowner "$HOMEOWNER_PW"); admin=$(password_token bm-admin "$ADMIN_PW")
    tok_at=$SECONDS
  fi
}

LLAMA=
if [ "$gpu" = 1 ]; then
  exec 9>/tmp/bricomission-gpu.lock
  flock -w 900 9 || { echo "ERROR: GPU lock busy" >&2; exit 1; }
  # The API must run on the real adapters. Compose recreates it when its env differs, so pass it here and
  # verify; a run on the fakes would only measure the fake image delay.
  AI_ADAPTERS=local docker compose --profile ai up -d --wait llama-server comfyui api
  [ "$(docker compose exec -T api printenv AI_ADAPTERS | tr -d '\r')" = local ] \
    || { echo "ERROR: the api is not running with AI_ADAPTERS=local" >&2; exit 1; }
  LLAMA="http://127.0.0.1:$(host_port llama-server 8080)"
  echo "llama-server (router) and comfyui up; the API broker serializes the GPU loads"
fi
# llama-server router model status: loaded | unloaded | loading | unknown (empty without GPU).
llama_status() {
  [ -n "$LLAMA" ] || { echo "-"; return; }
  curl -s --max-time 2 "$LLAMA/models" | python3 -I -c "import json,sys
try:
    d=json.load(sys.stdin); m=d.get('data',d.get('models',[]))[0]
    s=m.get('status',{}); print(s.get('value',s) if isinstance(s,dict) else s)
except Exception:
    print('unknown')"
}

echo "Setup: draft with ${#photos[@]} photos, measurements, Moodboard (2 gallery + 1 upload), claim"
draft=$(curl -s --max-time 10 -X POST "$API/kitchen-projects/drafts")
draft_token=$(printf '%s' "$draft" | json "d['draftToken']")
project=$(printf '%s' "$draft" | json "d['draft']['id']")
[ -n "$draft_token" ] && [ -n "$project" ] || { echo "ERROR: could not start a draft" >&2; exit 1; }
D="$API/kitchen-projects/drafts/current"
for p in "${photos[@]}"; do
  expect "photo $(basename "$(dirname "$p")") -> 201" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "X-Draft-Token: $draft_token" -F "photo=@$p;type=image/jpeg" "$D/photos")" 201
done
expect "measurements -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' -d '{"lengthCm":420,"widthCm":310,"heightCm":260}' "$D/measurements")" 200
for gid in modern-01 japandi-02; do
  expect "gallery item $gid -> 201" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' -d "{\"galleryImageId\":\"$gid\"}" "$D/moodboard/gallery-items")" 201
done
expect "own reference upload -> 201" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "X-Draft-Token: $draft_token" -F "photo=@$upload_ref;type=image/jpeg" "$D/moodboard/uploads")" 201
token=$(password_token bm-homeowner "$HOMEOWNER_PW")
admin=$(password_token bm-admin "$ADMIN_PW")
pro=$(password_token bm-professional "$PROFESSIONAL_PW")
[ -n "$token" ] && [ -n "$admin" ] || { echo "ERROR: no bm-homeowner/bm-admin token (realm up? password env?)" >&2; exit 1; }
expect "claim -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $token" -H "X-Draft-Token: $draft_token" "$D/claim")" 200
echo "  project $project"

S="$API/kitchen-projects/$project/simulations"
SET="$API/admin/settings/style-blend"
expect "GET simulations anonymous -> 401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$S")" 401
expect "POST simulations professional -> 403" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $pro" "$S")" 403
expect "PUT style-blend as homeowner -> 403" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "Authorization: Bearer $token" -H 'content-type: application/json' -d '{"mode":"both"}' "$SET")" 403
expect "PUT style-blend invalid -> 400" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "Authorization: Bearer $admin" -H 'content-type: application/json' -d '{"mode":"nope"}' "$SET")" 400
default_mode=$(curl -s --max-time 10 -H "Authorization: Bearer $admin" "$SET" | json "d['mode']")
echo "  platform default blend mode before the run: ${default_mode:-?}"

sims=() modes=() summary_lines=()
# run_sim <label> <expected mode>: POST, poll, report; sets last_sim, last_body.
run_sim() {
  local label=$1 mode=$2 t0 t_desc="" t_rend="" t_end resp code sim body stage last_stage="" cur last_cur="" ls last_ls="" vpid vfile
  vfile="$WORK/vram-$label.txt"
  if [ "$gpu" = 1 ]; then
    sleep 3600 & sleeper=$!
    echo "$sleeper" > "$WORK/pid-$label"
    VRAM_BASELINE_MIB="" bash scripts/ai-spike/vram-sample.sh "$label" "$WORK/pid-$label" > "$vfile" 2>&1 &
    vpid=$!
  fi
  last_ls=$(llama_status)
  echo "  [$label] llama-server before: $last_ls"
  t0=$(now)
  resp=$(curl -s --max-time 120 -X POST -H "Authorization: Bearer $token" "$S" -w '\n%{http_code}')
  code=$(printf '%s' "$resp" | tail -n1)
  sim=$(printf '%s' "$resp" | sed '$d' | json "d['simulation']['id']")
  expect "[$label] POST simulations -> 202" "$code" 202
  [ -n "$sim" ] || { echo "ERROR: no simulation created ($resp)" >&2; exit 1; }
  if [ "$label" = "$FIRST_LABEL" ]; then
    expect "[$label] second POST while active -> 409 simulation_in_progress" \
      "$(curl -s --max-time 10 -X POST -H "Authorization: Bearer $token" "$S" | json "d['code']")" simulation_in_progress
  fi
  for _ in $(seq 1 4800); do
    refresh
    body=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$S/$sim")
    stage=$(printf '%s' "$body" | json "d['stage']")
    cur=$(printf '%s' "$body" | json "str(d['progress']['succeeded']) + '/' + str(d['progress']['total'])")
    if [ "$stage" != "$last_stage" ]; then
      echo "  [$label] stage $stage ($(secs "$t0" "$(now)") s)"
      [ "$stage" = rendering ] && t_rend=$(now)
      last_stage=$stage
    fi
    if [ "$cur" != "$last_cur" ]; then echo "  [$label] renders done $cur ($(secs "$t0" "$(now)") s)"; last_cur=$cur; fi
    ls=$(llama_status)
    if [ "$ls" != "$last_ls" ]; then echo "  [$label] llama-server $last_ls -> $ls ($(secs "$t0" "$(now)") s)"; last_ls=$ls; fi
    [ "$stage" = finished ] && break
    sleep 0.5
  done
  t_end=$(now)
  if [ "$gpu" = 1 ]; then kill "$sleeper" 2>/dev/null; sleeper=; wait "$vpid" 2>/dev/null || true; cat "$vfile"; fi
  echo "  [$label] llama-server after: $(llama_status)"
  local total_s rend_s
  total_s=$(secs "$t0" "$t_end")
  rend_s=$([ -n "$t_rend" ] && secs "$t_rend" "$t_end" || echo "-")
  expect "[$label] Simulation succeeded (${total_s} s total, rendering stage ${rend_s} s)" "$(printf '%s' "$body" | json "d['status']")" succeeded
  expect "[$label] blendMode $mode" "$(printf '%s' "$body" | json "d['blendMode']")" "$mode"
  expect "[$label] one Render per photo" "$(printf '%s' "$body" | json "len(d['renders'])")" "${#photos[@]}"
  echo "  [$label] styleDegraded: $(printf '%s' "$body" | json "d['styleDegraded']")"
  echo "  [$label] style keywords: $(printf '%s' "$body" | json "', '.join(d['style']['keywords'])")"
  echo "  [$label] style weights: $(printf '%s' "$body" | json "', '.join(r['kind'] + ':' + r['refId'][:12] + '=' + str(r['weightPercent']) + '%' for r in d['style']['references'])")"
  echo "  [$label] per-Render seconds: $(printf '%s' "$body" | python3 -I -c "
import json,sys
from datetime import datetime
d=json.load(sys.stdin)
f=lambda s: datetime.fromisoformat(s.replace('Z','+00:00'))
print(', '.join('%d:%.1f' % (r['photoPosition'], (f(r['finishedAt'])-f(r['startedAt'])).total_seconds()) if r['finishedAt'] and r['startedAt'] else '%d:-' % r['photoPosition'] for r in sorted(d['renders'], key=lambda r: r['photoPosition'])))")"
  # Content variants and files for the contact sheet.
  local pos id
  for pos in $(seq 0 $((${#photos[@]} - 1))); do
    id=$(printf '%s' "$body" | json "[r['id'] for r in d['renders'] if r['photoPosition']==$pos][0]")
    curl -s --max-time 30 -o "$WORK/$label-$pos.jpg" -H "Authorization: Bearer $token" "$API/kitchen-projects/$project/renders/$id/content?variant=full"
    curl -s --max-time 30 -o "$WORK/before-$pos.jpg" -H "Authorization: Bearer $token" "$API/kitchen-projects/$project/renders/$id/content?variant=before"
  done
  sims+=("$sim"); modes+=("$label")
  summary_lines+=("$label mode=$mode total=${total_s}s rendering=${rend_s}s vram=$([ -f "$vfile" ] && sed -n 's/.*peak=\([0-9]*MiB\).*/\1/p' "$vfile" | head -n1 || echo -)")
  last_sim=$sim last_body=$body
}

FIRST_LABEL=ip_adapter
declare -A keywords_by
for mode in ip_adapter vlm_text both; do
  refresh
  expect "PUT style-blend $mode -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "Authorization: Bearer $admin" -H 'content-type: application/json' -d "{\"mode\":\"$mode\"}" "$SET")" 200
  expect "GET style-blend -> $mode" "$(curl -s --max-time 10 -H "Authorization: Bearer $admin" "$SET" | json "d['mode']")" "$mode"
  echo "Simulation in blend mode $mode"
  run_sim "$mode" "$mode"
  keywords_by[$mode]=$(printf '%s' "$last_body" | json "', '.join(d['style']['references'] and d['style']['keywords'])")
  weights_by_first=${weights_by_first:-$(printf '%s' "$last_body" | json "','.join(str(r['weightPercent']) for r in d['style']['references'])")}
done
echo "  first Simulation weights (percent, equal expected): $weights_by_first"
refresh
echo "Restore the platform default (${default_mode:-both})"
restore=${default_mode:-both}
expect "PUT style-blend $restore (restore) -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "Authorization: Bearer $admin" -H 'content-type: application/json' -d "{\"mode\":\"$restore\"}" "$SET")" 200
echo "Generate again (new random weights, default mode $restore)"
prev_weights=$(printf '%s' "$last_body" | json "','.join(str(r['weightPercent']) for r in d['style']['references'])")
prev_kw="${keywords_by[both]}"
run_sim again "$restore"
new_weights=$(printf '%s' "$last_body" | json "','.join(str(r['weightPercent']) for r in d['style']['references'])")
echo "  weights before: $prev_weights ; after: $new_weights"
[ "$prev_weights" != "$new_weights" ] && ok "Generate again drew different weights" || fail "weights identical after Generate again"
new_kw=$(printf '%s' "$last_body" | json "', '.join(d['style']['keywords'])")
[ "$prev_kw" != "$new_kw" ] && ok "Generate again changed the style keywords" || echo "  [note] style keywords identical (weights differ; the merge may pick the same top terms)"
again_sim=$last_sim

refresh
echo "Selection and Budget for the last Simulation"
before_sel=$(curl -s --max-time 10 -X POST -H "Authorization: Bearer $token" "$API/kitchen-projects/$project/budget" | json "d['code']")
expect "POST budget without selection -> 409 no_simulation_selected" "$before_sel" no_simulation_selected
expect "PUT selected-simulation -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "Authorization: Bearer $token" -H 'content-type: application/json' -d "{\"simulationId\":\"$again_sim\"}" "$API/kitchen-projects/$project/selected-simulation")" 200
expect "selected flag on the Simulation" "$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$S/$again_sim" | json "d['selected']")" True

B="$API/kitchen-projects/$project/budget"
BS="$API/kitchen-projects/$project/budgets"
post_budget() { curl -s --max-time 60 -X POST -H "Authorization: Bearer $token" "$B" -w '\n%{http_code}'; }
if [ "$gpu" = 1 ]; then
  sleep 3600 & sleeper=$!; echo "$sleeper" > "$WORK/pid-budget"
  bash scripts/ai-spike/vram-sample.sh budget "$WORK/pid-budget" > "$WORK/vram-budget.txt" 2>&1 & bpid=$!
fi
t0=$(now)
resp=$(post_budget); code=$(printf '%s' "$resp" | tail -n1)
if [ "$code" = 409 ] && [ "$(printf '%s' "$resp" | sed '$d' | json "d['code']")" = catalog_empty ]; then
  echo "Catalog index is empty: ingesting infra/catalog/samples (needs the CPU embedder)"
  ./scripts/catalog/ingest.sh infra/catalog/samples
  t0=$(now); resp=$(post_budget); code=$(printf '%s' "$resp" | tail -n1)
fi
id=$(printf '%s' "$resp" | sed '$d' | json "d['budget']['id']")
expect "POST budget -> 202" "$code" 202
[ -n "$id" ] || { echo "ERROR: no budget created (http $code): $(printf '%s' "$resp" | head -c 300)" >&2; exit 1; }
status=queued last_progress='' bad=0
for _ in $(seq 1 2400); do
  refresh
  body=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$BS/$id")
  status=$(printf '%s' "$body" | json "d['status']")
  [ -n "$status" ] || { bad=$((bad + 1)); [ "$bad" -ge 20 ] && { echo "  budget poll gives no status: $(printf '%s' "$body" | head -c 200)"; break; }; }
  progress=$(printf '%s' "$body" | json "d['stage'] + ' ' + str(d['progress']['done']) + '/' + str(d['progress']['total'])")
  if [ "$progress" != "$last_progress" ]; then echo "  budget stage/progress: $progress ($(secs "$t0" "$(now)") s)"; last_progress=$progress; fi
  case "$status" in succeeded|failed) break ;; esac
  sleep 0.5
done
bseconds=$(secs "$t0" "$(now)")
if [ "$gpu" = 1 ]; then kill "$sleeper" 2>/dev/null; sleeper=; wait "$bpid" 2>/dev/null || true; cat "$WORK/vram-budget.txt"; fi
expect "budget ${bseconds} s -> succeeded" "$status" succeeded
[ "$status" = failed ] && echo "  error code: $(printf '%s' "$body" | json "d['errorCode']")"
if [ "$status" = succeeded ]; then
  expect "four tiers in order" "$(printf '%s' "$body" | json "','.join(t['tier'] for t in d['tiers'])")" luxury,high,medium,low
  expect "budget belongs to the selected Simulation" "$(printf '%s' "$body" | json "d['simulationId']")" "$again_sim"
  expect "totals strictly ordered Luxury > High > Medium > Low" "$(printf '%s' "$body" | json "all(d['tiers'][i]['totalCents'] > d['tiers'][i+1]['totalCents'] for i in range(3))")" True
  echo "  relabeled: $(printf '%s' "$body" | json "d['relabeled']")"
  printf '%s' "$body" | python3 -I -c "
import json,sys
d=json.load(sys.stdin)
for t in d['tiers']:
    print('  %-7s total %9.2f EUR  %d items' % (t['tier'], t['totalCents']/100, len(t['items'])))"
  mismatch=$(psql_at "select count(*) from budget_tier t join (select budget_id, tier, sum(subtotal_cents) s from budget_line_item group by 1,2) i on i.budget_id=t.budget_id and i.tier=t.tier where t.budget_id='$id' and (t.total_cents <> i.s or t.subtotal_cents + t.vat_cents <> t.total_cents)")
  expect "psql: tier totals equal the re-summed Line Items" "$mismatch" 0
  expect "psql: four budget_tier rows" "$(psql_at "select count(*) from budget_tier where budget_id='$id'")" 4
  echo "  attempts|prompt_tokens|completion_tokens: $(psql_at "select attempts, coalesce(prompt_tokens,0), coalesce(completion_tokens,0) from budget where id='$id'")"
fi
echo "  per-Render inventories cached: $(psql_at "select count(*) from kitchen_render where simulation_id='$again_sim' and inventory is not null") of ${#photos[@]}"

# Contact sheet: row 0 = before, rows 1.. = Simulations in order; 480x340 cells.
inputs=() filt="" n=0 rows=0
cell="scale=480:340:force_original_aspect_ratio=decrease,pad=480:340:(ow-iw)/2:(oh-ih)/2:color=black"
add_row() {
  local pre=$1 k=0 labels=""
  for pos in $(seq 0 $((${#photos[@]} - 1))); do
    inputs+=(-i "$WORK/$pre-$pos.jpg"); filt+="[$n:v]$cell[c$n];"; labels+="[c$n]"; n=$((n + 1)); k=$((k + 1))
  done
  filt+="${labels}hstack=inputs=$k[r$rows];"; rows=$((rows + 1))
}
add_row before
for m in "${modes[@]}"; do add_row "$m"; done
rowsel=""; for r in $(seq 0 $((rows - 1))); do rowsel+="[r$r]"; done
mkdir -p "$(dirname "$out")"
if ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${filt}${rowsel}vstack=inputs=$rows" -q:v 6 "$out"; then
  echo "  contact sheet (rows top to bottom: before, ${modes[*]}): $out ($(stat -c %s "$out") bytes)"
else
  fail "contact sheet could not be built"
fi

if [ "$keep" = 0 ]; then
  refresh
  for s in "${sims[@]}"; do
    expect "DELETE simulation -> 204" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -X DELETE -H "Authorization: Bearer $token" "$S/$s")" 204
  done
  expect "Budget removed with its Simulation" "$(psql_at "select count(*) from budget where id='$id'")" 0
fi
echo "summary: mode=$([ "$gpu" = 1 ] && echo gpu || echo fake) project=$project budget_seconds=$bseconds"
printf '  %s\n' "${summary_lines[@]}"
[ "$gpu" = 1 ] && echo "reminder: docker compose --profile ai stop llama-server comfyui; docker compose --profile rag stop embedder; docker compose up -d --wait api (back on fake)"
if [ "$failures" -gt 0 ]; then echo "simulation smoke: $failures check(s) failed"; exit 1; fi
echo "simulation smoke: all checks passed"
