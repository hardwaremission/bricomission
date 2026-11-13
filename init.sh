#!/usr/bin/env bash
# Standard startup and verification path for BricoMission.
# Status: bootstrapped. Checks host prerequisites and feature_list.json, runs the
# pnpm workspace gate (frozen install, lint, test), then builds and starts the
# detached compose stack (6 services: postgres, minio, mailpit, keycloak, api, web) with
# `docker compose up -d --build --wait`, verifies GET /health reports database up, that
# Keycloak serves realm BricoMission with the expected issuer, and that the web PWA
# serves a localized Home, Language Selection, its manifest and the /api proxy.
# Never runs foreground or long-running dev servers, Playwright or Lighthouse.
set -euo pipefail

cd "$(dirname "$0")"
echo "Repository: $(pwd)"
echo "Harness status: bootstrapped"

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

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

# GPU devices are informational here: no feature in this gate uses the GPU yet.
if [ -e /dev/kfd ] && [ -e /dev/dri ]; then
  echo "  [ok]      GPU devices      /dev/kfd and /dev/dri present"
else
  echo "  [info]    GPU devices (/dev/kfd, /dev/dri) not found (needed from local-ai-gpu-spike on)"
fi

if ! python3 -c "import json,sys; json.load(open('feature_list.json'))" 2>/dev/null; then
  echo "ERROR: feature_list.json is not valid JSON" >&2
  exit 1
fi
echo "feature_list.json: valid JSON"
if [ "$missing" -gt 0 ]; then
  echo "$missing prerequisite(s) missing (see above)."
fi

echo
echo "Workspace gate:"
PNPM=()
if command -v pnpm >/dev/null 2>&1 && pnpm --version >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  echo "ERROR: pnpm is not resolvable (version pinned in package.json 'packageManager')." >&2
  echo "Get it without sudo, in this order:" >&2
  echo "  1. corepack enable --install-directory \"\$HOME/.local/bin\" pnpm        (if corepack exists)" >&2
  echo "  2. npx --yes corepack@0.36.0 enable --install-directory \"\$HOME/.local/bin\" pnpm" >&2
  echo "  3. npm install --prefix \"\$HOME/.local\" pnpm@10.34.9" >&2
  echo "Then make sure \$HOME/.local/bin is on PATH and re-run ./init.sh." >&2
  exit 1
fi
echo "  pnpm command: ${PNPM[*]} ($("${PNPM[@]}" --version))"

run_step() {
  local label="$1"; shift
  echo "==> $label"
  if ! "$@"; then
    echo "ERROR: workspace step failed: $label" >&2
    exit 1
  fi
}
run_step "pnpm install --frozen-lockfile" "${PNPM[@]}" install --frozen-lockfile
run_step "pnpm -r lint" "${PNPM[@]}" -r lint
run_step "pnpm -r test" "${PNPM[@]}" -r test

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
if ! docker compose up -d --build --wait --wait-timeout 300; then
  echo "ERROR: stack is not healthy:" >&2
  docker compose ps -a >&2 || true
  exit 1
fi
docker compose ps --format 'table {{.Service}}\t{{.Status}}'

echo
echo "API health:"
api_port=$(docker compose port api 3000 | cut -d: -f2)
health=$(curl -fsS --max-time 10 "http://127.0.0.1:${api_port}/health" 2>&1 || true)
if ! printf '%s' "$health" | grep -q '"database":"up"'; then
  echo "ERROR: API health is not 'database: up'. Response: ${health:-<empty>}" >&2
  docker compose logs --tail 50 api >&2 || true
  exit 1
fi
echo "  GET /health -> $health (database: up)"

echo
echo "Keycloak:"
kc_port=$(docker compose port keycloak 8080 | cut -d: -f2)
kc_expected="http://localhost:${kc_port}/realms/BricoMission"
kc_issuer=$(curl -sS --max-time 10 "http://127.0.0.1:${kc_port}/realms/BricoMission/.well-known/openid-configuration" 2>/dev/null |
  python3 -c "import json,sys; print(json.load(sys.stdin).get('issuer',''))" 2>/dev/null || true)
if [ "$kc_issuer" != "$kc_expected" ]; then
  echo "ERROR: realm BricoMission discovery issuer is '${kc_issuer:-<none>}', expected '$kc_expected'" >&2
  docker compose logs --tail 50 keycloak >&2 || true
  exit 1
fi
echo "  realm BricoMission issuer -> $kc_issuer"

echo
echo "Web:"
web_fail() {
  echo "ERROR: web check failed: $1" >&2
  docker compose logs --tail 50 web >&2 || true
  exit 1
}
web_port=$(docker compose port web 3000 2>/dev/null | awk -F: '{print $NF}' || true)
[ -n "$web_port" ] || web_fail "compose service 'web' publishes no port"
web_url="http://127.0.0.1:${web_port}"
web_es=$(curl -sS --max-time 10 -H 'Accept-Language: es' -o - -w '\n%{http_code}' "${web_url}/" 2>/dev/null || true)
[ "$(printf '%s' "$web_es" | tail -n1)" = "200" ] || web_fail "GET / (Accept-Language: es) did not return 200"
grep -q 'lang="es"' <<<"$web_es" || web_fail 'GET / (Accept-Language: es) has no lang="es"'
echo "  GET / (Accept-Language: es) -> 200, lang=\"es\""
web_ja=$(curl -sS --max-time 10 -H 'Accept-Language: ja' -o /dev/null -w '%{http_code} %{redirect_url}' "${web_url}/" 2>/dev/null || true)
case "$web_ja" in
  "307 "*/language) echo "  GET / (Accept-Language: ja) -> $web_ja" ;;
  *) web_fail "GET / (Accept-Language: ja) gave '${web_ja:-<none>}', expected 307 to /language" ;;
esac
web_manifest=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "${web_url}/manifest.webmanifest" 2>/dev/null || true)
[ "$web_manifest" = "200" ] || web_fail "GET /manifest.webmanifest gave '${web_manifest:-<none>}'"
echo "  GET /manifest.webmanifest -> 200"
web_health=$(curl -sS --max-time 10 "${web_url}/api/health" 2>/dev/null || true)
grep -q '"database":"up"' <<<"$web_health" || web_fail "GET /api/health (proxy) is '${web_health:-<empty>}', expected database up"
echo "  GET /api/health (proxy) -> $web_health"

echo
echo "Stack is up and healthy (detached)."
echo "  Web:      http://localhost:${web_port}/  (PWA; language from the browser or the NEXT_LOCALE cookie)"
echo "  API:      http://127.0.0.1:${api_port}/health"
echo "  API docs: http://127.0.0.1:${api_port}/docs  (OpenAPI JSON: /docs-json)"
echo "  Keycloak: http://localhost:${kc_port}/admin  (master bootstrap admin, KEYCLOAK_ADMIN_*)"
echo "  Account:  http://localhost:${kc_port}/realms/BricoMission/account  (bm-homeowner / bm-professional / bm-admin; email code in Mailpit)"
echo "Next step: run /feature-flow on the first ready feature in feature_list.json."
echo "Useful commands:"
echo "  ${PNPM[*]} -r lint && ${PNPM[*]} -r test  # workspace verification (no database needed)"
echo "  ./scripts/keycloak-smoke.sh             # realm roles, API 401/403/200, Mailpit SMTP, email-code login"
echo "  ${PNPM[*]} test:e2e                     # browser E2E (Playwright image, mobile 390x844) against the web service"
echo "  bash scripts/web/lighthouse-pwa.sh      # Lighthouse 11 PWA installability (installable-manifest)"
echo "  docker compose up -d --build --wait     # rebuild the api and web images after code changes"
echo "  docker compose logs -f <service>        # follow one service's logs"
echo "  docker compose down                     # stop the stack (keeps named volumes)"
echo "Local AI (opt-in, GPU; never started by this script):"
echo "  docker compose --profile ai-fetch run --rm ai-fetch   # one-time model download into volumes (~30 GB)"
echo "  docker compose --profile ai up -d --wait               # llama-server + comfyui on the GPU"
echo "  docker compose --profile ai stop llama-server comfyui  # stop only the GPU services (keeps volumes)"
echo "Catalog RAG (opt-in, CPU-only embedder; never started by this script):"
echo "  docker compose --profile rag-fetch run --rm embedder-fetch  # one-time embedding weight download (~640 MB)"
echo "  docker compose --profile rag up -d --wait embedder          # CPU embedder (no GPU devices)"
echo "  ./scripts/catalog/ingest.sh infra/catalog/samples           # index a directory of Catalog PDFs"
echo "  docker compose --profile rag stop embedder                  # stop only the embedder"
exit 0
