#!/usr/bin/env bash
# Browser E2E of the diagnostics dashboard (feature diagnostics-dashboard): Playwright project
# desktop-1920, spec apps/web/e2e/diagnostics.spec.ts, in the pinned web-e2e image, fake adapters.
#
# Usage: bash scripts/diagnostics/e2e.sh [--live-only] [extra playwright args]
#   (pnpm test:e2e:diagnostics [-- --live-only])
#
# What it does (no sudo, no GPU):
#   1. Brings the stack up with diagnostics on: api and web with DIAGNOSTICS_ENABLED=true, the
#      dashboard and the metrics agent (profile diagnostics), the CPU embedder (profile rag) and the
#      sample Catalog (the Budget needs both).
#   2. Live run: the portrait app runs a Simulation and a Budget while the dashboard is watched.
#   3. Stack states (skipped with --live-only), each one a short run of the same spec:
#        reconnect       the dashboard container restarted while a page is connected
#        no-agent        diagnostics-agent stopped
#        token-mismatch  the dashboard recreated with another DIAGNOSTICS_TOKEN
#        api-disabled    the api recreated with DIAGNOSTICS_ENABLED=false
#      The stack is put back after each state (also when a run fails).
# It leaves the stack up WITH diagnostics on. To go back to the default stack:
#   docker compose --profile diagnostics --profile rag stop diagnostics diagnostics-agent embedder
#   docker compose up -d --wait        # api and web without diagnostics again (or ./init.sh)
# A plain `pnpm test:e2e` never needs this script: on a stack without the dashboard the spec skips.
# Exit code: 0 when every run passed. Never prints tokens.
set -euo pipefail
cd "$(dirname "$0")/../.."

live_only=0
args=()
for arg in "$@"; do
  case "$arg" in
    --live-only) live_only=1 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) args+=("$arg") ;;
  esac
done

export DIAGNOSTICS_ENABLED=true
step() { echo; echo "==> $*"; }

step "Stack with diagnostics on (api, web, dashboard, agent), embedder and the sample Catalog"
docker compose --profile diagnostics up -d --build --quiet-build --wait --wait-timeout 300
docker compose --profile rag up -d --wait embedder
./scripts/catalog/ingest.sh infra/catalog/samples | tail -n 1
[ "$(docker compose exec -T api printenv DIAGNOSTICS_ENABLED | tr -d '\r')" = true ] || { echo "ERROR: the api does not run with DIAGNOSTICS_ENABLED=true" >&2; exit 1; }
[ "$(docker compose exec -T api printenv AI_ADAPTERS | tr -d '\r')" = fake ] || { echo "ERROR: the api must run on AI_ADAPTERS=fake for this E2E" >&2; exit 1; }

restore=""
cleanup() {
  local code=$?
  trap - EXIT
  if [ -n "$restore" ]; then
    echo "restoring the stack after state '$restore'"
    docker compose --profile diagnostics up -d --wait >/dev/null 2>&1 || echo "WARNING: could not restore the stack; run: DIAGNOSTICS_ENABLED=true docker compose --profile diagnostics up -d --wait" >&2
  fi
  exit "$code"
}
trap cleanup EXIT

run() { # run <state> [playwright args]
  local state="$1"; shift
  E2E_DIAGNOSTICS_STATE="$state" E2E_DIAGNOSTICS_REQUIRED=1 bash scripts/web/e2e.sh --project=desktop-1920 "$@"
}

step "Live run (Simulation and Budget in the app, dashboard at 1920x1080)"
run live ${args[@]+"${args[@]}"}

if [ "$live_only" = 0 ]; then
  step "State: RECONNECTING (dashboard container restarted while the page is connected)"
  ready=apps/web/test-results/diagnostics-e2e-ready
  rm -f "$ready"
  (
    # The spec writes the file once its page shows LIVE; then the stream is cut by a restart.
    for _ in $(seq 1 120); do [ -e "$ready" ] && break; sleep 0.5; done
    [ -e "$ready" ] && docker compose --profile diagnostics restart diagnostics >/dev/null 2>&1
  ) &
  restarter=$!
  run reconnect
  wait "$restarter" || true
  rm -f "$ready"
  docker compose --profile diagnostics up -d --wait diagnostics >/dev/null

  step "State: NO AGENT (diagnostics-agent stopped)"
  restore=no-agent
  docker compose --profile diagnostics stop diagnostics-agent >/dev/null
  run no-agent
  docker compose --profile diagnostics up -d --wait diagnostics-agent >/dev/null
  restore=""

  step "State: TOKEN MISMATCH (dashboard recreated with another token)"
  restore=token-mismatch
  # Only the dashboard is named, so only it is recreated; the api, web and agent keep the real token.
  DIAGNOSTICS_TOKEN="e2e-mismatch-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')" docker compose --profile diagnostics up -d --wait diagnostics >/dev/null
  run token-mismatch
  docker compose --profile diagnostics up -d --wait diagnostics >/dev/null
  restore=""

  step "State: API DISABLED (api recreated with DIAGNOSTICS_ENABLED=false)"
  restore=api-disabled
  DIAGNOSTICS_ENABLED=false docker compose up -d --wait api >/dev/null
  run api-disabled
  docker compose up -d --wait api >/dev/null
  restore=""
fi

echo
echo "Diagnostics E2E passed. The stack is still up with diagnostics on (see the header of this script to turn it off)."
