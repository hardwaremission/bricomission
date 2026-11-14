#!/usr/bin/env bash
# Budget smoke test against the running stack (feature budget-tier-computation, spec Scenario 7).
#
# Usage: bash scripts/ai/budget-smoke.sh [--no-gpu]
#   default   real LLM: the api must run with AI_ADAPTERS=local. Holds /tmp/bricomission-gpu.lock
#             (flock), stops ComfyUI, starts llama-server alone (`--profile ai`) and waits for it.
#             Afterwards stop it yourself: docker compose --profile ai stop llama-server
#   --no-gpu  fake LLM (AI_ADAPTERS=fake): same API flow, no lock, no GPU service.
#
# Flow: anonymous draft through the API (sample photo, measurements, Style Gallery item
# modern-01), password-grant token of bm-homeowner on the dev-only client, claim, then POST
# /budget timed from POST to terminal status. When the Catalog index is empty (409 catalog_empty)
# it ingests infra/catalog/samples with scripts/catalog/ingest.sh (needs the CPU embedder:
# docker compose --profile rag up -d --wait embedder) and retries once. Checks 401/403, the
# one-active 409, four tiers with citations, the tier totals recomputed from the Line Item rows
# with psql, and prints the four totals, token counts (internal, read from the database) and seconds.
# Never prints tokens. Honours COMPOSE_PROJECT_NAME and the seed password env vars.
set -euo pipefail

cd "$(dirname "$0")/../.."

gpu=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-gpu) gpu=0 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

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
photo=infra/ai/samples/kitchen-sample.jpg
[ -f "$photo" ] || { echo "photo not found: $photo" >&2; exit 2; }

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
secs() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", (b-a)/1e9}'; }
psql_at() { docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -F '|' -c \"$1\""; }

password_token() {
  curl -s --max-time 10 -d grant_type=password -d client_id=bricomission-dev-cli -d scope=openid \
    --data-urlencode "username=$1" --data-urlencode "password=$2" "$OIDC/token" | json "d['access_token']"
}

if [ "$gpu" = 1 ]; then
  exec 9>/tmp/bricomission-gpu.lock
  flock -w 900 9 || { echo "ERROR: GPU lock busy" >&2; exit 1; }
  docker compose stop comfyui >/dev/null 2>&1 || true
  docker compose --profile ai up -d --wait llama-server
  echo "llama-server up, comfyui stopped (LLM alone on the GPU)"
fi

echo "Setup: draft, photo, measurements, Moodboard, claim"
draft=$(curl -s --max-time 10 -X POST "$API/kitchen-projects/drafts")
draft_token=$(printf '%s' "$draft" | json "d['draftToken']")
project=$(printf '%s' "$draft" | json "d['draft']['id']")
[ -n "$draft_token" ] && [ -n "$project" ] || { echo "ERROR: could not start a draft" >&2; exit 1; }
expect "photo upload -> 201" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "X-Draft-Token: $draft_token" -F "photo=@$photo;type=image/jpeg" "$API/kitchen-projects/drafts/current/photos")" 201
expect "measurements -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PUT -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' -d '{"lengthCm":420,"widthCm":310,"heightCm":260}' "$API/kitchen-projects/drafts/current/measurements")" 200
expect "gallery item modern-01 -> 201" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "X-Draft-Token: $draft_token" -H 'content-type: application/json' -d '{"galleryImageId":"modern-01"}' "$API/kitchen-projects/drafts/current/moodboard/gallery-items")" 201
token=$(password_token bm-homeowner "$HOMEOWNER_PW")
[ -n "$token" ] || { echo "ERROR: no bm-homeowner token (realm up? password env?)" >&2; exit 1; }
expect "claim -> 200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $token" -H "X-Draft-Token: $draft_token" "$API/kitchen-projects/drafts/current/claim")" 200
echo "  project $project"

B="$API/kitchen-projects/$project/budget"
BS="$API/kitchen-projects/$project/budgets"
pro=$(password_token bm-professional "$PROFESSIONAL_PW")
expect "POST budget anonymous -> 401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$B")" 401
expect "GET budgets anonymous -> 401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BS")" 401
expect "POST budget professional -> 403" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $pro" "$B")" 403

post_budget() { curl -s --max-time 60 -X POST -H "Authorization: Bearer $token" "$B" -w '\n%{http_code}'; }
t0=$(now)
resp=$(post_budget)
code=$(printf '%s' "$resp" | tail -n1)
if [ "$code" = 409 ] && [ "$(printf '%s' "$resp" | sed '$d' | json "d['code']")" = catalog_empty ]; then
  echo "Catalog index is empty: ingesting infra/catalog/samples (needs the CPU embedder)"
  ./scripts/catalog/ingest.sh infra/catalog/samples
  t0=$(now)
  resp=$(post_budget)
  code=$(printf '%s' "$resp" | tail -n1)
fi
id=$(printf '%s' "$resp" | sed '$d' | json "d['budget']['id']")
expect "POST budget -> 202" "$code" 202
[ -n "$id" ] || { echo "ERROR: no budget created (http $code)" >&2; exit 1; }
busy=$(curl -s --max-time 10 -X POST -H "Authorization: Bearer $token" "$B" | json "d['code']")
expect "second POST while active -> 409 budget_in_progress" "$busy" budget_in_progress

status=queued
for _ in $(seq 1 1200); do
  body=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$BS/$id")
  status=$(printf '%s' "$body" | json "d['status']")
  case "$status" in succeeded|failed) break ;; esac
  sleep 0.25
done
t1=$(now)
seconds=$(secs "$t0" "$t1")
expect "budget ${seconds}s -> succeeded" "$status" succeeded
if [ "$status" = failed ]; then echo "  error code: $(printf '%s' "$body" | json "d['errorCode']")"; fi

if [ "$status" = succeeded ]; then
  tiers=$(printf '%s' "$body" | json "','.join(t['tier'] for t in d['tiers'])")
  expect "four tiers in order" "$tiers" luxury,high,medium,low
  uncited=$(printf '%s' "$body" | json "sum(1 for t in d['tiers'] for i in t['items'] if not i['catalogName'] or i['pageNumber']<1)")
  expect "every Line Item cites a catalog page" "$uncited" 0
  leak=$(printf '%s' "$body" | python3 -I -c "import sys,re; print('yes' if re.search(r'prompt|gpuJob|tokens|sourceQuote', sys.stdin.read(), re.I) else 'no')")
  expect "response has no prompt/token/job internals" "$leak" no
  printf '%s' "$body" | python3 -I -c "
import json,sys
d=json.load(sys.stdin)
for t in d['tiers']:
    print('  %-7s total %9.2f EUR  (before VAT %9.2f, VAT %8.2f)  %d items' % (t['tier'], t['totalCents']/100, t['subtotalCents']/100, t['vatCents']/100, len(t['items'])))
    for i in t['items']:
        print('      %s x %s %s = %.2f  [%s, page %d]  %s' % (i['quotedPrice'], i['quantity'], i['unit'], i['subtotalCents']/100, i['catalogName'], i['pageNumber'], i['sku']))
"
  # Recompute the tier totals from the stored Line Items (psql) and compare with budget_tier.
  mismatch=$(psql_at "select count(*) from budget_tier t join (select budget_id, tier, sum(subtotal_cents) s from budget_line_item group by 1,2) i on i.budget_id=t.budget_id and i.tier=t.tier where t.budget_id='$id' and (t.total_cents <> i.s or t.subtotal_cents + t.vat_cents <> t.total_cents)")
  expect "psql: tier totals equal the re-summed Line Items" "$mismatch" 0
  tcount=$(psql_at "select count(*) from budget_tier where budget_id='$id'")
  expect "psql: four budget_tier rows" "$tcount" 4
fi
row=$(psql_at "select attempts, coalesce(prompt_tokens,0), coalesce(completion_tokens,0) from budget where id='$id'")
echo "  attempts|prompt_tokens|completion_tokens: $row"
listed=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$BS" | json "len(d['budgets'])")
expect "GET budgets lists 1 Budget" "$listed" 1

echo "summary: mode=$([ "$gpu" = 1 ] && echo gpu || echo fake) seconds=${seconds} tokens=${row} project=$project budget=$id"
[ "$gpu" = 1 ] && echo "reminder: docker compose --profile ai stop llama-server; docker compose up -d --wait api (back on fake)"
if [ "$failures" -gt 0 ]; then
  echo "budget smoke: $failures check(s) failed"
  exit 1
fi
echo "budget smoke: all checks passed"
