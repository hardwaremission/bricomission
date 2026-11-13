#!/usr/bin/env bash
# Indexes a directory of Catalog PDFs into the local RAG index (feature catalog-rag-ingestion).
# Usage: ./scripts/catalog/ingest.sh <catalog-dir> [--force]
#   <catalog-dir>  any directory (absolute or relative to the caller's cwd); mounted read-only.
#                  Only *.pdf files directly inside it are read; other files are ignored.
#   --force        re-embed documents even when their content and model are unchanged.
# Steps: start postgres + api (docker compose up -d --build --wait postgres api), require a
# healthy CPU embedder (profile rag), then run `prisma migrate deploy` and the ingestion CLI
# inside the api image (DB credentials and EMBEDDING_URL come from compose; .env is never
# read here). Honors COMPOSE_PROJECT_NAME and the *_PORT env vars like any compose command.
# Exit codes: 0 ok (warnings allowed), 1 a document failed / embedder or stack unavailable,
# 2 usage (missing directory, no *.pdf).
set -euo pipefail

usage() { echo "usage: $0 <catalog-dir> [--force]" >&2; }

dir=""
extra=()
for arg in "$@"; do
  case "$arg" in
    --force) extra+=(--force) ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) echo "ERROR: unknown option: $arg" >&2; usage; exit 2 ;;
    *) if [ -n "$dir" ]; then echo "ERROR: only one directory may be given" >&2; usage; exit 2; fi
       dir="$arg" ;;
  esac
done
if [ -z "$dir" ]; then usage; exit 2; fi
if [ ! -d "$dir" ]; then echo "ERROR: directory not found: $dir" >&2; usage; exit 2; fi
dir="$(cd "$dir" && pwd -P)"
if ! find "$dir" -maxdepth 1 -type f -iname '*.pdf' -print -quit | grep -q .; then
  echo "ERROR: no *.pdf files in $dir" >&2
  usage
  exit 2
fi

cd "$(dirname "$0")/../.."

echo "==> starting postgres and api"
if ! docker compose up -d --build --quiet-build --wait --wait-timeout 300 postgres api; then
  echo "ERROR: postgres/api did not become healthy (docker compose ps -a)" >&2
  exit 1
fi

echo "==> checking the CPU embedder (profile rag)"
embedder_id="$(docker compose --profile rag ps -q embedder 2>/dev/null || true)"
health=""
if [ -n "$embedder_id" ]; then
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$embedder_id" 2>/dev/null || true)"
fi
if [ "$health" != "healthy" ]; then
  echo "ERROR: the embedder is not running or not healthy (status: ${health:-absent})." >&2
  echo "Start it first (CPU only, no GPU needed):" >&2
  echo "  docker compose --profile rag-fetch run --rm embedder-fetch   # once: download the weights" >&2
  echo "  docker compose --profile rag up -d --wait embedder" >&2
  exit 1
fi

echo "==> migrating and ingesting $dir"
# shellcheck disable=SC2016 # "$@" expands inside the container shell.
docker compose run --rm --no-deps -T -v "$dir:/catalogs:ro" api \
  sh -c './node_modules/.bin/prisma migrate deploy && node dist/catalog/cli/ingest.js /catalogs "$@"' \
  sh "${extra[@]}"
