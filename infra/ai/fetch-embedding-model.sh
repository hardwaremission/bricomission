#!/usr/bin/env bash
# One-shot fetcher for the CPU embedding model (feature catalog-rag-ingestion, ADR 0004).
# Run with: docker compose --profile rag-fetch run --rm embedder-fetch
# Downloads a pinned Hugging Face file (repo commit sha in the URL) into the named
# volume bricomission_embedding-models mounted at /models. Idempotent: a file whose
# size matches the expected size is skipped ("present, skipping"). Partial downloads
# resume from <file>.part and are moved into place only when the size matches.
set -euo pipefail

HF="https://huggingface.co"

# dest|repo|commit|file|expected_bytes
# Qwen3-Embedding-0.6B Q8_0 (Apache-2.0, multilingual, 1024 dimensions, last-token pooling).
FILES=(
  "/models/Qwen3-Embedding-0.6B-Q8_0.gguf|Qwen/Qwen3-Embedding-0.6B-GGUF|370f27d7550e0def9b39c1f16d3fbaa13aa67728|Qwen3-Embedding-0.6B-Q8_0.gguf|639150592"
)

file_size() { stat -c %s "$1" 2>/dev/null || echo 0; }

fail=0
for entry in "${FILES[@]}"; do
  IFS='|' read -r dest repo commit file expected <<<"$entry"
  if [ -f "$dest" ] && [ "$(file_size "$dest")" = "$expected" ]; then
    echo "present, skipping: $dest ($expected bytes)"
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  url="$HF/$repo/resolve/$commit/$file"
  echo "fetching: $repo@${commit:0:12}/$file -> $dest ($expected bytes)"
  if ! curl -fL --retry 5 --retry-delay 5 --retry-all-errors -C - -sS -o "$dest.part" "$url"; then
    echo "ERROR: download failed: $url" >&2
    fail=1
    continue
  fi
  got=$(file_size "$dest.part")
  if [ "$got" != "$expected" ]; then
    echo "ERROR: size mismatch for $dest.part: got $got, expected $expected" >&2
    fail=1
    continue
  fi
  mv "$dest.part" "$dest"
  echo "done: $dest"
done

if [ "$fail" -ne 0 ]; then
  echo "Download failed; re-run to resume." >&2
  exit 1
fi
echo "Embedding model present."
