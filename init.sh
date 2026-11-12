#!/usr/bin/env bash
# Standard startup and verification path for BricoMission.
# Status: pre-bootstrap. No application stack exists yet; this script only checks
# host prerequisites. Replace the provisional section when `infra-compose-core`
# and `api-skeleton` land (see feature_list.json).
set -euo pipefail

cd "$(dirname "$0")"
echo "Repository: $(pwd)"
echo "Harness status: pre-bootstrap"

missing=0
check() {
  local name="$1" cmd="$2"
  if out=$(eval "$cmd" 2>/dev/null); then
    printf '  [ok]      %-16s %s\n' "$name" "$(echo "$out" | head -n1)"
  else
    printf '  [missing] %s\n' "$name"
    missing=$((missing + 1))
  fi
}

echo "Host prerequisites:"
check "git"            "git --version"
check "node"           "node --version"
check "pnpm"           "pnpm --version || corepack pnpm --version"
check "docker"         "docker --version"
check "docker compose" "docker compose version"
check "python3"        "python3 --version"
check "ffmpeg"         "ffmpeg -version"

if [ -e /dev/kfd ] && [ -e /dev/dri ]; then
  echo "  [ok]      GPU devices      /dev/kfd and /dev/dri present"
else
  echo "  [missing] GPU devices (/dev/kfd, /dev/dri)"
  missing=$((missing + 1))
fi

if ! python3 -c "import json,sys; json.load(open('feature_list.json'))" 2>/dev/null; then
  echo "ERROR: feature_list.json is not valid JSON" >&2
  exit 1
fi
echo "feature_list.json: valid JSON"

echo
if [ "$missing" -gt 0 ]; then
  echo "$missing prerequisite(s) missing. Docker Engine + Compose v2 must be installed before 'infra-compose-core'."
fi
echo "Application stack is not initialized yet."
echo "Next step: run /feature-flow on the first ready feature in feature_list.json."
echo "Expected future commands (after bootstrap):"
echo "  docker compose up -d --wait     # infrastructure"
echo "  pnpm install --frozen-lockfile  # workspace dependencies"
echo "  pnpm -r lint && pnpm -r test    # baseline verification"
exit 0
