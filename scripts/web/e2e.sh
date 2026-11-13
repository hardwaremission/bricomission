#!/usr/bin/env bash
# Browser E2E for apps/web (Playwright, project mobile-390) against the running compose
# `web` service. Browsers come from the pinned Playwright image (compose service web-e2e,
# profile e2e); nothing is installed on the host. Extra args go to `playwright test`.
# Prerequisite: the stack is up (./init.sh or docker compose up -d --build --wait).
# Exit code: Playwright's (0 = all specs passed).
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! port=$(docker compose port web 3000 2>/dev/null | awk -F: '{print $NF}') || [ -z "$port" ]; then
  echo "ERROR: compose service 'web' is not running; start the stack with ./init.sh" >&2
  exit 1
fi
if [ ! -x apps/web/node_modules/.bin/playwright ]; then
  echo "ERROR: apps/web dependencies missing; run pnpm install --frozen-lockfile" >&2
  exit 1
fi
echo "E2E against http://localhost:${port}"
exec docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" \
  -e E2E_BASE_URL="http://localhost:${port}" \
  web-e2e ./node_modules/.bin/playwright test "$@"
