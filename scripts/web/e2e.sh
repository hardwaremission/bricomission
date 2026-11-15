#!/usr/bin/env bash
# Browser E2E for apps/web (Playwright, project mobile-390) against the running compose
# `web` service. Browsers come from the pinned Playwright image (compose service web-e2e,
# profile e2e); nothing is installed on the host. Extra args go to `playwright test`.
# Prerequisite: the stack is up (./init.sh or docker compose up -d --build --wait).
# The Keycloak theme spec (keycloak-theme.spec.ts) also gets the Keycloak and Mailpit URLs and
# the bm-homeowner seed password (env or the compose default). E2E_PERSIST_PHASE (save|check) is
# passed through for scripts/web/auth-persist-check.sh; empty skips e2e/auth-persist.spec.ts.
# Project desktop-1920 (e2e/diagnostics.spec.ts) gets the dashboard URL only when the compose service
# `diagnostics` is running, and skips itself otherwise; scripts/diagnostics/e2e.sh runs it in full.
# E2E_DIAGNOSTICS_STATE and E2E_DIAGNOSTICS_REQUIRED are passed through for that script. The diagnostics
# token is read from the api container and passed by name only (never printed, never on a command line).
# Exit code: Playwright's (0 = all specs passed).
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! port=$(docker compose port web 3000 2>/dev/null | awk -F: '{print $NF}') || [ -z "$port" ]; then
  echo "ERROR: compose service 'web' is not running; start the stack with ./init.sh" >&2
  exit 1
fi
kc_port=$(docker compose port keycloak 8080 2>/dev/null | awk -F: '{print $NF}' || true)
mailpit_port=$(docker compose port mailpit 8025 2>/dev/null | awk -F: '{print $NF}' || true)
if [ -z "$kc_port" ] || [ -z "$mailpit_port" ]; then
  echo "ERROR: compose services 'keycloak' and 'mailpit' must be running; start the stack with ./init.sh" >&2
  exit 1
fi
if [ ! -x apps/web/node_modules/.bin/playwright ]; then
  echo "ERROR: apps/web dependencies missing; run pnpm install --frozen-lockfile" >&2
  exit 1
fi
diag_port=$(docker compose port diagnostics 3000 2>/dev/null | awk -F: '{print $NF}' || true)
diag_url=""
if [ -n "$diag_port" ]; then
  diag_url="http://localhost:${diag_port}"
  E2E_DIAGNOSTICS_TOKEN="$(docker compose exec -T api printenv DIAGNOSTICS_TOKEN 2>/dev/null | tr -d '\r' || true)"
  export E2E_DIAGNOSTICS_TOKEN
fi
echo "E2E against http://localhost:${port} (Keycloak http://localhost:${kc_port}, Mailpit http://localhost:${mailpit_port})"
exec docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" \
  -e E2E_BASE_URL="http://localhost:${port}" \
  -e E2E_KEYCLOAK_URL="http://localhost:${kc_port}" \
  -e E2E_MAILPIT_URL="http://localhost:${mailpit_port}" \
  -e E2E_SEED_HOMEOWNER_PASSWORD="${BM_SEED_HOMEOWNER_PASSWORD:-bm-homeowner-dev}" \
  -e E2E_PERSIST_PHASE="${E2E_PERSIST_PHASE:-}" \
  -e E2E_DIAGNOSTICS_URL="${diag_url}" \
  -e E2E_DIAGNOSTICS_STATE="${E2E_DIAGNOSTICS_STATE:-}" \
  -e E2E_DIAGNOSTICS_REQUIRED="${E2E_DIAGNOSTICS_REQUIRED:-}" \
  -e E2E_DIAGNOSTICS_TOKEN \
  web-e2e ./node_modules/.bin/playwright test "$@"
