#!/usr/bin/env bash
# Render smoke test against the running stack (feature controlnet-render, spec Scenario 5).
#
# Usage: bash scripts/ai/render-smoke.sh [--no-gpu] [--warm N] [--photo FILE] [--out FILE]
#   default   real GPU: the api must run with AI_ADAPTERS=local and the `ai` profile must be up.
#             Holds /tmp/bricomission-gpu.lock (flock), frees ComfyUI (POST /free) so the first
#             Render is cold, then runs N warm Renders (default 2).
#   --no-gpu  fake adapter (AI_ADAPTERS=fake): same API flow, no /free, no lock.
#
# Flow: anonymous draft through the API (sample photo, measurements, Style Gallery item
# modern-01), password-grant token of bm-homeowner on the dev-only client, claim, then Renders
# timed from POST to terminal status. Also checks 401/403, the one-active 409 and the content
# variants. Writes a side-by-side before|after JPEG (ffmpeg) of the cold Render to --out
# (GPU default docs/spikes/assets/controlnet-render-compare.jpg; with --no-gpu the default is a
# temporary file, so the committed real-GPU evidence is never overwritten). Never prints tokens.
# Honours COMPOSE_PROJECT_NAME and the seed password env vars (defaults as in compose.yaml).
set -euo pipefail

cd "$(dirname "$0")/../.."

gpu=1 warm=2 photo=infra/ai/samples/kitchen-sample.jpg out=
while [ $# -gt 0 ]; do
  case "$1" in
    --no-gpu) gpu=0 ;;
    --warm) warm="${2:?--warm needs a number}"; shift ;;
    --photo) photo="${2:?--photo needs a file}"; shift ;;
    --out) out="${2:?--out needs a file}"; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -z "$out" ]; then
  if [ "$gpu" = 1 ]; then out=docs/spikes/assets/controlnet-render-compare.jpg; else out="$(mktemp --suffix=.jpg)"; fi
fi
[ -f "$photo" ] || { echo "photo not found: $photo" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 2; }

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

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
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
secs() { python3 -I -c "print(f'{($2-$1)/1e9:.2f}')" "$1" "$2" 2>/dev/null || awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", (b-a)/1e9}'; }

password_token() {
  curl -s --max-time 10 -d grant_type=password -d client_id=bricomission-dev-cli -d scope=openid \
    --data-urlencode "username=$1" --data-urlencode "password=$2" "$OIDC/token" | json "d['access_token']"
}

if [ "$gpu" = 1 ]; then
  exec 9>/tmp/bricomission-gpu.lock
  flock -w 900 9 || { echo "ERROR: GPU lock busy" >&2; exit 1; }
  COMFY="http://127.0.0.1:${COMFYUI_PORT:-8188}"
  curl -fsS --max-time 5 -o /dev/null "$COMFY/system_stats" || { echo "ERROR: ComfyUI not reachable on $COMFY (docker compose --profile ai up -d --wait)" >&2; exit 1; }
fi

echo "Setup: draft, photo, measurements, Moodboard, claim"
draft=$(curl -s --max-time 10 -X POST "$API/kitchen-projects/drafts")
draft_token=$(printf '%s' "$draft" | json "d['draftToken']")
project=$(printf '%s' "$draft" | json "d['draft']['id']")
[ -n "$draft_token" ] && [ -n "$project" ] || { echo "ERROR: could not start a draft" >&2; exit 1; }
up=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "X-Draft-Token: $draft_token" -F "photo=@$photo;type=image/jpeg" "$API/kitchen-projects/drafts/current/photos")
expect "photo upload -> 201" "$up" 201
m=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' \
  -d '{"lengthCm":420,"widthCm":310,"heightCm":260}' "$API/kitchen-projects/drafts/current/measurements")
expect "measurements -> 200" "$m" 200
g=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' \
  -d '{"galleryImageId":"modern-01"}' "$API/kitchen-projects/drafts/current/moodboard/gallery-items")
expect "gallery item modern-01 -> 201" "$g" 201
token=$(password_token bm-homeowner "$HOMEOWNER_PW")
[ -n "$token" ] || { echo "ERROR: no bm-homeowner token (realm up? password env?)" >&2; exit 1; }
claim=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $token" -H "X-Draft-Token: $draft_token" "$API/kitchen-projects/drafts/current/claim")
expect "claim -> 200" "$claim" 200
echo "  project $project"

R="$API/kitchen-projects/$project/renders"
pro=$(password_token bm-professional "$PROFESSIONAL_PW")
expect "POST renders anonymous -> 401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$R")" 401
expect "GET renders anonymous -> 401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$R")" 401
expect "POST renders professional -> 403" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $pro" "$R")" 403

if [ "$gpu" = 1 ]; then
  curl -fsS --max-time 30 -X POST -H 'Content-Type: application/json' -d '{"unload_models":true,"free_memory":true}' "$COMFY/free" >/dev/null
  sleep 3
  echo "ComfyUI models freed (cold run next)"
fi

# render_once <label> -> prints "<renderId> <seconds> <status> <errorCode>"
render_once() {
  local t0 body id status code t1 i
  t0=$(now)
  body=$(curl -s --max-time 30 -X POST -H "Authorization: Bearer $token" -H 'content-type: application/json' -d '{}' "$R" -w '\n%{http_code}')
  code=$(printf '%s' "$body" | tail -n1)
  id=$(printf '%s' "$body" | sed '$d' | json "d['render']['id']")
  [ "$code" = 202 ] && [ -n "$id" ] || { echo "- 0 post_failed http_$code"; return; }
  if [ "$1" = cold ]; then
    busy=$(curl -s --max-time 10 -X POST -H "Authorization: Bearer $token" -H 'content-type: application/json' -d '{}' "$R" | json "d['code']")
    printf '%s' "$busy" > "$WORK/busy"
  fi
  status=queued
  for i in $(seq 1 1200); do
    body=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$R/$id")
    status=$(printf '%s' "$body" | json "d['status']")
    case "$status" in succeeded|failed) break ;; esac
    sleep 0.25
  done
  t1=$(now)
  echo "$id $(secs "$t0" "$t1") $status $(printf '%s' "$body" | json "d['errorCode']")"
}

echo "Renders (POST to terminal status):"
read -r cold_id cold_s cold_status cold_err < <(render_once cold)
expect "cold render ${cold_s}s -> succeeded" "$cold_status" succeeded
expect "second POST while active -> 409 render_in_progress" "$(cat "$WORK/busy" 2>/dev/null)" render_in_progress
warm_times=()
for i in $(seq 1 "$warm"); do
  read -r wid ws wstatus _ < <(render_once warm)
  expect "warm render $i ${ws}s -> succeeded" "$wstatus" succeeded
  warm_times+=("$ws")
done

for variant in before full thumb; do
  expect "content variant=$variant -> 200 image/jpeg" \
    "$(curl -s -o "$WORK/$variant.jpg" -w '%{http_code} %{content_type}' --max-time 30 -H "Authorization: Bearer $token" "$R/$cold_id/content?variant=$variant")" "200 image/jpeg"
done
expect "content as professional -> 403" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $pro" "$R/$cold_id/content?variant=full")" 403
list=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$R")
leak=$(printf '%s' "$list" | python3 -I -c "import sys,re; print('yes' if re.search(r'prompt|seed|gpuJob', sys.stdin.read(), re.I) else 'no')")
expect "list response has no prompt/seed/job id" "$leak" no

if [ "$cold_status" = succeeded ]; then
  mkdir -p "$(dirname "$out")"
  ffmpeg -loglevel error -y -i "$WORK/before.jpg" -i "$WORK/full.jpg" -filter_complex "[0:v][1:v]hstack=inputs=2" -q:v 3 "$out"
  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$WORK/before.jpg" 2>/dev/null || echo '?')
  dimsf=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$WORK/full.jpg" 2>/dev/null || echo '?')
  expect "before and full have the same size ($dims)" "$dims" "$dimsf"
  echo "  comparison (left before, right Render): $out"
fi

echo "summary: mode=$([ "$gpu" = 1 ] && echo gpu || echo fake) cold=${cold_s}s warm=[${warm_times[*]:-}] project=$project cold_render=$cold_id"
if [ "$failures" -gt 0 ]; then
  echo "render smoke: $failures check(s) failed"
  exit 1
fi
echo "render smoke: all checks passed"
