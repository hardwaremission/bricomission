#!/usr/bin/env bash
# launch-demo.sh: brings up the whole BricoMission demo with the REAL models and stops
# everything again when this process ends (Ctrl+C, SIGTERM, closing the terminal).
#
#   ./launch-demo.sh             real models: core + CPU embedder + llama-server + ComfyUI,
#                                API on AI_ADAPTERS=local
#   ./launch-demo.sh --fake      same stack but deterministic fake adapters, no GPU
#   ./launch-demo.sh --fetch     also (re)run the idempotent weight downloads first
#   ./launch-demo.sh --keep-core on exit stop only the GPU services, the embedder and the
#                                diagnostics services and put the API back on the fake adapters
#                                (API and web without diagnostics); leave the core stack up
#   ./launch-demo.sh --no-diagnostics  do not start the diagnostics dashboard
#
# The diagnostics dashboard (http://localhost:3200, desktop window, no login, 127.0.0.1 only) is
# started by default: API and web run with DIAGNOSTICS_ENABLED=true and the Compose profile
# "diagnostics" adds the dashboard and its read-only metrics agent (docs/adr/0006).
#
# Stopping uses `docker compose stop`: containers and volumes (your projects, photos,
# accounts) are kept. Run ./init.sh or `docker compose up -d --wait` to bring them back.
# No sudo is ever used. One feature of the demo needs the GPU free: do not run other
# GPU work (or the smoke scripts) while this runs.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

MODE=local
FETCH=0
KEEP_CORE=0
DIAGNOSTICS=1
for arg in "$@"; do
  case "$arg" in
    --fake) MODE=fake ;;
    --fetch) FETCH=1 ;;
    --keep-core) KEEP_CORE=1 ;;
    --no-diagnostics) DIAGNOSTICS=0 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; N=$'\033[0m'; else B=''; G=''; R=''; Y=''; N=''; fi
step() { echo; echo "${B}==> $*${N}"; }
ok()   { echo "${G}ok${N}  $*"; }
warn() { echo "${Y}!!${N}  $*"; }
die()  { echo "${R}error${N} $*" >&2; exit 1; }

env_value() { # env_value NAME DEFAULT: reads NAME from the environment or .env
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f .env ]; then v="$(grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"; fi
  echo "${v:-$2}"
}
WEB_PORT="$(env_value WEB_PORT 3100)"
API_PORT="$(env_value API_PORT 3000)"
MAILPIT_UI_PORT="$(env_value MAILPIT_UI_PORT 8025)"
MINIO_CONSOLE_PORT="$(env_value MINIO_CONSOLE_PORT 9001)"
DIAGNOSTICS_PORT="$(env_value DIAGNOSTICS_PORT 3200)"

# Every `docker compose up` below may recreate api and web, so the flag is exported once for all
# of them (the shell value wins over .env). With --no-diagnostics nothing is exported: api and
# web keep whatever .env or the compose default (false) says.
if [ "$DIAGNOSTICS" = 1 ]; then export DIAGNOSTICS_ENABLED=true; fi

STARTED=0
CLEANED=0
cleanup() {
  local code=$?
  trap - EXIT INT TERM HUP
  [ "$CLEANED" = 1 ] && exit "$code"
  CLEANED=1
  if [ "$STARTED" = 1 ]; then
    echo
    step "Stopping the demo"
    if [ "$KEEP_CORE" = 1 ]; then
      docker compose --profile ai --profile rag --profile diagnostics stop \
        llama-server comfyui embedder diagnostics diagnostics-agent >/dev/null 2>&1 || true
      if [ "$DIAGNOSTICS" = 1 ]; then
        AI_ADAPTERS=fake DIAGNOSTICS_ENABLED=false docker compose up -d --wait api web >/dev/null 2>&1 \
          || warn "could not put the API and web back on fake without diagnostics"
        ok "GPU services, embedder and diagnostics stopped, API back on fake, diagnostics off, core stack still up"
      else
        AI_ADAPTERS=fake docker compose up -d --wait api >/dev/null 2>&1 || warn "could not put the API back on fake"
        ok "GPU services and embedder stopped, API back on fake, core stack still up"
      fi
    else
      docker compose --profile ai --profile rag --profile diagnostics stop >/dev/null 2>&1 || true
      ok "everything stopped (volumes and data kept). Next time: ./launch-demo.sh"
    fi
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

step "Checking the host"
command -v docker >/dev/null || die "docker not found. Run ./scripts/install-host-prereqs.sh --check"
docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable. Run ./scripts/install-host-prereqs.sh --check"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 not found"
ok "docker and compose available"

if [ "$MODE" = local ]; then
  if [ "$FETCH" = 1 ]; then
    step "Fetching model weights (idempotent)"
    docker compose --profile ai-fetch run --rm ai-fetch
    docker compose --profile rag-fetch run --rm embedder-fetch
  fi
  for v in bricomission_llm-models bricomission_comfyui-models bricomission_embedding-models; do
    docker volume inspect "$v" >/dev/null 2>&1 \
      || die "volume $v is missing: run ./launch-demo.sh --fetch (downloads about 25 GB once)"
  done
  if ! docker image inspect bricomission/comfyui >/dev/null 2>&1; then
    step "Building the ComfyUI image (first time only)"
    docker compose --profile ai build comfyui
  fi
  ok "weights volumes and ComfyUI image present"
  if [ -r /sys/class/drm/card1/device/mem_info_vram_used ]; then
    used=$(( $(cat /sys/class/drm/card1/device/mem_info_vram_used) / 1048576 ))
    echo "    VRAM in use before starting: ${used} MiB of 16 GB"
    [ "$used" -gt 6000 ] && warn "more than 6 GB of VRAM already in use: close other GPU programs or the demo may fail"
  fi
fi

STARTED=1

step "Core stack (API, web, PostgreSQL, Keycloak, MinIO, Mailpit)"
docker compose up -d --build --wait

step "Catalog search (CPU embedder) and the sample Catalog"
docker compose --profile rag up -d --wait embedder
# Sample Catalog ingest disabled: the developer is testing with their own Catalog data.
# ./scripts/catalog/ingest.sh infra/catalog/samples

if [ "$MODE" = local ]; then
  step "AI services on the GPU (llama-server, ComfyUI)"
  docker compose --profile ai up -d --wait llama-server comfyui
  step "API on the real models (AI_ADAPTERS=local)"
  AI_ADAPTERS=local docker compose up -d --wait api
else
  step "API on the fake adapters (no GPU)"
  AI_ADAPTERS=fake docker compose up -d --wait api
fi

if [ "$DIAGNOSTICS" = 1 ]; then
  step "Diagnostics dashboard and metrics agent (profile diagnostics)"
  docker compose --profile diagnostics up -d --build --wait diagnostics diagnostics-agent
fi

step "Final checks"
health="$(curl -fsS --max-time 10 "http://localhost:${API_PORT}/health" || true)"
echo "$health" | grep -q '"database":"up"' || die "API health check failed: $health"
ok "API healthy: $health"
curl -fsS --max-time 10 -o /dev/null -w "ok  web answers %{http_code} (307 means the language redirect)\n" "http://localhost:${WEB_PORT}/" || die "the web does not answer on port ${WEB_PORT}"
adapters="$(docker compose exec -T api printenv AI_ADAPTERS | tr -d '\r')"
ok "the API runs on AI_ADAPTERS=${adapters}"
if [ "$DIAGNOSTICS" = 1 ]; then
  diag_api="$(docker compose exec -T api printenv DIAGNOSTICS_ENABLED | tr -d '\r' || true)"
  diag_web="$(docker compose exec -T web printenv DIAGNOSTICS_ENABLED | tr -d '\r' || true)"
  [ "$diag_api" = true ] && [ "$diag_web" = true ] || die "diagnostics are not enabled on the API and web (api=${diag_api:-unset} web=${diag_web:-unset})"
  curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:${DIAGNOSTICS_PORT}/api/health" || die "the diagnostics dashboard does not answer on port ${DIAGNOSTICS_PORT}"
  ok "diagnostics dashboard answers on 127.0.0.1:${DIAGNOSTICS_PORT} (API and web emit events)"
fi

cat <<EOF

${B}${G}The demo is up.${N}
  App:            http://localhost:${WEB_PORT}   (use localhost, not 127.0.0.1)
  Mail codes:     http://localhost:${MAILPIT_UI_PORT}   (the 6-digit sign-in code arrives here)
  Test account:   bm-homeowner / bm-homeowner-dev   (or use "Create account")
  MinIO console:  http://localhost:${MINIO_CONSOLE_PORT}
$([ "$DIAGNOSTICS" = 1 ] && echo "  Diagnostics:    http://localhost:${DIAGNOSTICS_PORT}   (desktop window, no login, this machine only)")
  Mode:           ${adapters}$([ "$adapters" = local ] && echo "  (real models: first image about 25 s, then 10-15 s; a budget takes 2-3 minutes)")

  Flow: Capture -> Moodboard -> Generate (sign in) -> results -> project -> select a simulation -> Get my budget

$([ "$DIAGNOSTICS" = 1 ] && printf '%s\n%s\n' "  Two windows: the app in a narrow portrait window (about 480 x 1000, or a 390 x 844 device frame)" "  and the diagnostics dashboard in a desktop window beside it (1920 x 1080, or the 1440 px left over).")

${B}Press Ctrl+C to stop everything.${N}
EOF

# Stay in the foreground until interrupted; the EXIT trap does the shutdown.
while true; do sleep 1; done
