#!/usr/bin/env bash
# Generates the clearly synthetic sample Catalog PDF (feature catalog-rag-ingestion).
# Usage: ./scripts/catalog/generate-sample-catalog.sh [out-dir] [--edition 1|2]
#   out-dir    default: infra/catalog/samples (relative paths resolve from the caller's cwd)
#   --edition  2 changes only the BM-SYN-WTP-300 price (189.90 -> 199.90 EUR); default 1
# Output: <out-dir>/bricomission-sample-catalog.pdf, byte-identical across runs.
# Needs the workspace installed (pnpm install) for pdfkit; Node runs the .ts file
# with native type stripping.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
out=""
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --edition) [ "$#" -ge 2 ] || { echo "usage: $0 [out-dir] [--edition 1|2]" >&2; exit 2; }
               args+=(--edition "$2"); shift 2 ;;
    --edition=*) args+=("$1"); shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; echo "usage: $0 [out-dir] [--edition 1|2]" >&2; exit 2 ;;
    *) out="$1"; shift ;;
  esac
done
[ -n "$out" ] || out="$repo/infra/catalog/samples"

if [ ! -d "$repo/apps/api/node_modules/pdfkit" ]; then
  echo "ERROR: pdfkit is not installed; run 'pnpm install' at the repository root first." >&2
  exit 1
fi
exec node "$repo/apps/api/scripts/generate-sample-catalog.ts" "$out" "${args[@]}"
