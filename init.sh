#!/usr/bin/env bash
# Standard startup and verification path for BricoMission.
# Status: infra. Checks host prerequisites, then starts the detached infrastructure
# stack (compose.yaml: postgres, minio, mailpit) with `docker compose up -d --wait`
# and verifies its health. Never runs foreground or long-running dev servers.
# The pnpm workspace gate is added by `api-skeleton` (see feature_list.json).
set -euo pipefail

cd "$(dirname "$0")"
echo "Repository: $(pwd)"
echo "Harness status: infra"

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
  echo "$missing prerequisite(s) missing (pnpm is only needed from 'api-skeleton' on)."
fi

echo
echo "Compose gate:"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed: run ./scripts/install-host-prereqs.sh in your own terminal (needs sudo), then log out/in"
  echo "Compose gate skipped."
  exit 0
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Compose v2 plugin missing: run the helper ./scripts/install-host-prereqs.sh" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon unreachable. Likely causes and fixes:" >&2
  echo "  - service stopped:            systemctl status docker  (start: sudo systemctl enable --now docker.service)" >&2
  echo "  - docker group not active:    log out/in, or run: newgrp docker" >&2
  echo "  - full check:                 ./scripts/install-host-prereqs.sh --check" >&2
  exit 1
fi
if ! docker compose config -q; then
  echo "ERROR: compose.yaml is invalid (docker compose config -q failed)" >&2
  exit 1
fi
if ! docker compose up -d --wait --wait-timeout 180; then
  echo "ERROR: infrastructure stack is not healthy:" >&2
  docker compose ps -a >&2 || true
  exit 1
fi
docker compose ps --format 'table {{.Service}}\t{{.Status}}'

echo
echo "Infrastructure stack is up and healthy (detached)."
echo "Next step: run /feature-flow on the first ready feature in feature_list.json."
echo "Useful commands:"
echo "  docker compose logs -f <service>  # follow one service's logs"
echo "  docker compose down               # stop the stack (keeps named volumes)"
echo "After api-skeleton:"
echo "  pnpm install --frozen-lockfile  # workspace dependencies"
echo "  pnpm -r lint && pnpm -r test    # baseline verification"
exit 0
