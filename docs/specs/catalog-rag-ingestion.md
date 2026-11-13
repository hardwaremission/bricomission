# Feature Implementation Spec: Catalog PDFs are searchable in the local RAG index

## Source Feature

- `id`: catalog-rag-ingestion
- `area`: ai-budget
- `depends_on`: local-ai-gpu-spike (accepted), api-skeleton (accepted)
- `status`: not_started (at planning time, 2026-11-13)
- `source`: `feature_list.json`

## Goal

Build the local RAG index that ADR 0002 depends on. An ingestion command takes any directory of Catalog PDFs, extracts text page by page, skips pages without a text layer (with a warning), chunks each page, embeds the chunks with a **CPU-only** multilingual embedding model, and stores them in pgvector. Re-runs are idempotent. `GET /catalog/search` in `apps/api` returns the most relevant chunks, each with its document reference and page number. The budget engine (`budget-tier-computation`) will call the same search service in-process.

Real partner Catalogs arrive later from the developer. Until then the repo ships a generator for a clearly synthetic sample Catalog PDF, plus the committed output.

## Non-Goals

- Budget, Line Items, cited-price verification, LLM calls (`budget-tier-computation`).
- OCR of scanned pages. Detecting them and skipping them is in scope.
- Uploading Catalogs to MinIO, an admin UI for Catalogs, hot-swapping the embedding endpoint (`admin-service-endpoints`).
- Auth on the search endpoint (see Users And Permissions), GPU job broker integration, any UI.
- Pruning documents whose files left the directory. Reranking, BM25 or full-text search beyond the exact-SKU boost described below.
- Changes to the GPU services or to the shared volumes `bricomission_llm-models`, `bricomission_comfyui-models`, `bricomission_comfyui-annotators`.

## Job Story

When the developer drops partner Catalog PDFs into a folder,
I want one command that indexes them and an endpoint that finds the chunk holding a product's SKU and price,
so the budget engine can cite a real Catalog source for every price.

## Users And Permissions

- Developer/operator: runs the ingestion command on the host. Agents never use sudo.
- `GET /catalog/search`: **unauthenticated in this feature**. Rationale: Keycloak is not a dependency yet (`keycloak-realm-roles`). The data is public partner Catalog content with no user data, and the port binds to 127.0.0.1. Its main consumer is the in-process `CatalogSearchService`, and the HTTP route is a thin internal/diagnostic surface. Follow-up, recorded in ARCHITECTURE.md: when auth lands, either guard the route (signed-in or admin) or remove it.

## Acceptance Scenarios

### Scenario 1: Synthetic sample Catalog is generated
Given the workspace is installed
When `./scripts/catalog/generate-sample-catalog.sh` runs (default output `infra/catalog/samples/`)
Then it writes `bricomission-sample-catalog.pdf`. The file is byte-identical across runs (fixed metadata dates). It has at least 5 pages: a cover saying "SYNTHETIC SAMPLE - not real products or prices", 3 or more product pages with a text layer (SKU, en/es name, unit, price in EUR), and one page drawn with shapes only and no text. It includes `BM-SYN-WTP-300` "Oak laminate worktop 300 cm / Encimera laminada roble 300 cm", unit `unit`, `189.90 EUR`, on page 3. Passing `--edition 2` changes that price to `199.90 EUR` and nothing else.

### Scenario 2: Embedding weights are fetched once
Given no embedding weights yet
When `docker compose --profile rag-fetch run --rm embedder-fetch` runs twice
Then the first run downloads the pinned GGUF into the named volume `bricomission_embedding-models` and checks its size. The second run prints `present, skipping` and exits 0. No other volume is touched.

### Scenario 3: CPU embedder runs without the GPU
When `docker compose --profile rag up -d --wait embedder` runs
Then `embedder` is healthy, published on `127.0.0.1:${EMBEDDING_PORT:-8090}`, and has no `/dev/kfd` or `/dev/dri` devices (`docker inspect` shows empty Devices). `POST /v1/embeddings` returns vectors of exactly 1024 dimensions. `./init.sh` neither starts it nor depends on it.

### Scenario 4: Ingestion indexes a directory of PDFs
Given the core stack and the embedder are healthy
When `./scripts/catalog/ingest.sh infra/catalog/samples` runs
Then migrations apply, and the report lists each PDF with its status (`ingested`), total pages, skipped pages with reason (`page 5: no text layer`), and chunk count. A summary line gives `documents`, `chunks`, `warnings`. Exit code 0. Any directory path works (absolute or relative, read-only mount). Non-PDF files are ignored.

### Scenario 5: Search returns the SKU chunk with page reference
When `curl "http://127.0.0.1:$API_PORT/catalog/search?q=oak%20laminate%20worktop&limit=5"` and `...?q=BM-SYN-WTP-300` run
Then both return 200. The top result's `text` contains `BM-SYN-WTP-300` and `189.90`, with `pageNumber: 3`, `fileName: "bricomission-sample-catalog.pdf"`, `documentId`, `catalogName`, `chunkId` and a numeric `score`. A Spanish query (`encimera roble`) also returns the page 3 chunk in the top 3.

### Scenario 6: Re-ingestion is idempotent; changed content replaces chunks
- Running Scenario 4 again reports `unchanged` and leaves the `catalog_document` and `catalog_chunk` row counts and ids unchanged.
- With `--force`, the document is re-embedded with the same counts and no duplicates.
- Ingesting a temp directory holding the `--edition 2` file under the same name reports `replaced`. Search then returns `199.90` and no chunk with `189.90` for that SKU remains.

### Scenario 7: Error paths
- Missing directory or no `*.pdf` in it: usage message, exit 2.
- Corrupt or encrypted PDF: that document is `failed` with a reason, the others still ingest, exit 1. The previous chunks of a failed document are kept, because each document is written in one transaction.
- A PDF with no text layer at all: status `skipped (no_text_layer)` with a warning, 0 chunks, exit 0.
- Embedder unreachable during ingestion: fails fast with a hint to start `--profile rag`, exit 1, no partial writes.
- Search: `q` missing, blank or longer than 500 characters, or `limit` outside 1-20, gives 400. Embedder or DB unreachable gives 503 with a generic message (no internals). An empty index gives 200 with `results: []`.

### Scenario 8: Offline test gate
`pnpm -r lint` and `pnpm -r test` pass with no network, no Docker, no GPU and no model, using the deterministic fake embedder.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `feature_list.json`: rules, AI Services section, current state.
- `ARCHITECTURE.md`: ESM NestJS 12, Prisma 7 + adapter-pg, lazy `PrismaService`, `configureApp`, feature-module layout, Vitest + supertest layering.
- `compose.yaml`: postgres is already `pgvector/pgvector:0.8.1-pg17` (extension 0.8.1, created by `infra/postgres/initdb/01-extensions.sql` on first volume init). It also shows the profile pattern (`ai`, `ai-fetch`), fixed-name weight volumes and the `127.0.0.1:${X_PORT:-n}` convention.
- `infra/ai/fetch-models.sh`: pinned-commit HF download pattern (resume, size check, idempotent).
- `apps/api/{package.json,Dockerfile,prisma/schema.prisma,prisma.config.ts,src/**,test/**,vitest.config.ts,tsconfig.json}`: no models or migrations yet. `files` = dist, prisma, prisma.config.ts. `prisma` is a devDependency (PROGRESS notes the CLI ends up in prod deps as a peer: verify).
- `init.sh`, `.env.example`, `docs/technical-discovery.md`, `docs/adr/0002-llm-extracts-code-computes-budget.md`, `docs/domain-model.md` (Line Item source reference = document + page/chunk), `docs/risks-and-open-questions.md` (embedding model open; text-layer check is a research task), `docs/spikes/local-ai-gpu-spike.md`, `docs/specs/api-skeleton.md`.
- Not inspected or not verifiable offline: HF availability and sizes of the embedding GGUFs, and whether the CPU tag `ghcr.io/ggml-org/llama.cpp:server-b12316` exists. The implementer must check both, as the spike did.

### Existing Patterns To Follow

- Compose: pinned tags, healthcheck with curl, `restart: unless-stopped`, opt-in profiles, fixed-name shared weight volumes, env-overridable 127.0.0.1 ports, defaults mirrored in `.env.example`.
- API: one Nest module per feature, Swagger DTO classes implementing `@bricomission/shared-types` types, `import type`, `.js` relative imports, errors never leak internals.

### Current Gaps

- No Prisma migration story. This feature adds the first migration and a way to apply it.
- No PDF parsing, no embedding client, no host-run CLI pattern.

## Technical Approach

**Embedding model (CPU, multilingual, 1024 dimensions).** Primary: `Qwen/Qwen3-Embedding-0.6B-GGUF`, file `Qwen3-Embedding-0.6B-Q8_0.gguf` (Apache-2.0, 100+ languages, 1024 dimensions, `--pooling last`, query instruction prefix, documents raw). Fallback if it is unavailable or llama.cpp rejects it: a `bge-m3` Q8_0 GGUF (MIT, 1024 dimensions, `--pooling cls`, no prefixes). Both are 1024 dimensions, so the schema does not change. Pin the repo commit and byte size from an HF HEAD request (`x-linked-size`). If neither works, stop and report `block`. Record the choice in ADR 0004.

**Compose.**
- Service `embedder`, profile `rag`. Image `ghcr.io/ggml-org/llama.cpp:server-b12316` (CPU build, same release as the GPU image; verify the tag and record its digest; if missing, use the nearest existing `server-bNNNNN` CPU tag). No `devices`, no `group_add`.
- Command: `-m /models/<file> --host 0.0.0.0 --port 8080 --embeddings --pooling last -ngl 0 -t ${EMBEDDING_THREADS:-8} -c 8192 -b 2048 -ub 2048`.
- Volume `embedding-models:/models:ro`. Port `127.0.0.1:${EMBEDDING_PORT:-8090}:8080`. Healthcheck curl `/health`, start_period 120s.
- Service `embedder-fetch`, profile `rag-fetch`: same image, `entrypoint: ["bash","/fetch/fetch-embedding-model.sh"]`, mounts `./infra/ai:/fetch:ro` and `embedding-models:/models`.
- Volume `embedding-models: {name: bricomission_embedding-models}`. Leave existing volumes and services alone.
- `api` gets `EMBEDDING_URL: http://embedder:8080`, `EMBEDDING_MODEL: ${EMBEDDING_MODEL:-qwen3-embedding-0.6b-q8_0}`, `EMBEDDING_QUERY_INSTRUCTION` (default: the Qwen instruction `Instruct: Given a product search query, retrieve catalog passages that contain matching products\nQuery: `). There is no `depends_on` on embedder.
- `.env.example` gets `EMBEDDING_PORT=8090`, `EMBEDDING_THREADS=8`, `EMBEDDING_MODEL=...`.

**Data model (Prisma + raw SQL migration).**
- `CatalogDocument` (`catalog_document`): `id` uuid, `sourceName` (file basename, unique), `catalogName` (PDF Title metadata, else basename without `.pdf`), `contentSha256`, `embeddingModel`, `pageCount`, `skippedPages` Int[], `status` (`indexed` | `no_text_layer`), timestamps.
- `CatalogChunk` (`catalog_chunk`): `id` uuid, `documentId` FK with cascade delete, `pageNumber` (1-based), `chunkIndex`, `text`, `embedding Unsupported("vector(1024)")`, unique (`documentId`, `pageNumber`, `chunkIndex`).
- Migration `apps/api/prisma/migrations/<timestamp>_catalog_rag/migration.sql`: generated with `prisma migrate diff --from-empty --to-schema ... --script`, then hand-edited to start with `CREATE EXTENSION IF NOT EXISTS vector;` and add `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`. Add `migration_lock.toml`.
- Constant `CATALOG_EMBEDDING_DIMENSIONS = 1024`. A unit test asserts that the migration SQL contains `vector(1024)` matching the constant.

**Applying migrations.** Add `apps/api/docker-entrypoint.sh` (and include it in `files` or COPY it). It runs `prisma migrate deploy`. On failure it logs `migrations not applied` and still `exec node dist/main.js`, so api-skeleton's boot-with-DB-down behavior holds. The Prisma CLI must be in the runtime image: move `prisma` to `dependencies` if `pnpm deploy --prod` does not already include it. The ingestion wrapper also runs `migrate deploy` before ingesting.

**Code layout (`apps/api/src/catalog/`).**
- `embedding/embedder.ts`: interface `Embedder { model; dimensions; embedDocuments(texts): Promise<number[][]>; embedQuery(text): Promise<number[]> }`.
- `embedding/llama-server.embedder.ts`: OpenAI-compatible `POST {EMBEDDING_URL}/v1/embeddings`, batches of 16, timeouts (10 s for queries, 120 s per batch), L2 normalization, a clear dimension-mismatch error, and `EmbeddingUnavailableError` on network failure.
- `embedding/fake.embedder.ts`: deterministic token feature hashing into 1024 dimensions, L2-normalized, so lexically similar texts score higher in tests.
- `pdf/pdf-text.ts`: `pdfjs-dist` legacy build (pinned, pure JS, no network or workers needed in Node). Returns per-page text with lines rebuilt from item y positions. A page with fewer than 20 non-whitespace characters means no text layer. `unpdf` is an acceptable alternative.
- `chunking/chunker.ts`: pure and deterministic. Chunks never cross pages and never split a line. Target about 800 characters with about 1 line of overlap. Whitespace is normalized. Line order is kept.
- `catalog.repository.ts`: interface plus `PrismaCatalogRepository`. Uses `$queryRaw`/`$executeRaw` tagged templates with `::vector` casts. Writing a document is one transaction (delete the old document by `sourceName`, insert the new document and its chunks). Search is a cosine query filtered by `embeddingModel`.
- `catalog-ingestion.service.ts`: per file, compute sha256. If `sourceName` exists with the same hash, the same `embeddingModel` and no `--force`, report `unchanged`. Otherwise extract, chunk and embed everything **before** opening the transaction, then write. The result is `ingested` or `replaced`.
- `catalog-search.service.ts`: validates input, embeds the query (with the instruction prefix), runs vector top-k. **Exact-SKU boost:** query tokens matching `[A-Z0-9][A-Z0-9-]{3,}` also run a parameterized `ILIKE` lookup (escape `%` and `_`). Matching chunks rank first with `matchedSku: true`. Results are de-duplicated and cut at `limit`.
- `catalog.controller.ts` + `catalog.dto.ts` + `catalog.module.ts`: `GET /catalog/search?q=&limit=` (default 5) with Swagger docs for 200, 400 and 503. Register in `AppModule`. Types `CatalogSearchResult` and `CatalogSearchResponse` go in `packages/shared-types`.
- `cli/ingest.ts`: compiled to `dist/catalog/cli/ingest.js`. `ingest <dir> [--force]`. Builds the services by hand (no HTTP server) and prints the report. Exit codes 0/1/2 as in Scenario 7.

**Scripts.**
- `scripts/catalog/ingest.sh <dir> [--force]`:
  1. Resolve the directory to an absolute path and check it contains PDFs.
  2. Run `docker compose up -d --build --wait postgres api`.
  3. Check `embedder` is healthy, otherwise print the `--profile rag` hint and exit 1.
  4. Run `docker compose run --rm --no-deps -v "$dir:/catalogs:ro" api sh -c 'prisma migrate deploy && node dist/catalog/cli/ingest.js /catalogs "$@"'`.

  It runs in the api image, so DB credentials and `EMBEDDING_URL` come from compose and the script never reads `.env`. It honors `COMPOSE_PROJECT_NAME` and the port env vars.
- `scripts/catalog/generate-sample-catalog.sh [out-dir] [--edition 2]`: runs `apps/api/scripts/generate-sample-catalog.ts` with `pdfkit` (devDependency). Use Node 26 native type stripping with erasable syntax only, or a pinned `tsx` devDependency. The same builder is imported by the tests. Commit the generated `infra/catalog/samples/bricomission-sample-catalog.pdf` (expected under 50 KB) and `infra/catalog/samples/README.md` (synthetic, how to regenerate, where real Catalogs go).

**GPU.** None. The embedder is CPU-only, so no `flock /tmp/bricomission-gpu.lock` is needed. If the implementer touches the GPU for any reason, wrap it in that flock and stop the services afterwards.

## Expected File Changes

- `compose.yaml`, `.env.example`: modify (embedder, embedder-fetch, volume, api env).
- `infra/ai/fetch-embedding-model.sh`: create. `infra/catalog/samples/{bricomission-sample-catalog.pdf,README.md}`: create.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`: modify/create.
- `apps/api/src/catalog/**` (files above), `apps/api/src/app.module.ts`: create/modify.
- `apps/api/scripts/generate-sample-catalog.ts`, `apps/api/docker-entrypoint.sh`, `apps/api/Dockerfile`, `apps/api/package.json`, `apps/api/tsconfig.json` (include `scripts`), `pnpm-lock.yaml`: create/modify.
- `apps/api/test/catalog/*.spec.ts`: create. `packages/shared-types/src/index.ts`: modify.
- `scripts/catalog/{ingest.sh,generate-sample-catalog.sh}`: create, mode 755.
- `init.sh`: modify only the final hints (rag-fetch, rag up/stop, ingest). Do not start the embedder.
- Docs: listed below.

## Visual Design Impact

- UI involved: no. No design artifact required.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Add the catalog module (embedder interface and fakes, repository, search route), migrations on api start, the `embedder` runtime row, the ingestion CLI path, test layering, and the auth follow-up for `/catalog/search`.
- `CONSTRAINTS.md`: not needed. Rules stay in AGENTS.md.
- `AGENTS.md`: update the AI Services section with the `rag-fetch` and `rag` commands (stop by naming `embedder`), the ingest and sample-generator commands, and "embedder is CPU-only; do not add GPU devices".
- `docs/adr/0004-cpu-multilingual-embeddings.md`: create. Covers the model, dimension, CPU rationale (no VRAM contention), fallback, and query-prefix handling.
- `docs/technical-discovery.md`: update the Embeddings / RAG line and the Deployment profiles. `docs/risks-and-open-questions.md`: move "Embedding model" to Resolved. Mark research task 3 as "detection implemented, real PDFs pending".

## Implementation Plan

1. Verify the image tag and the GGUF (HEAD for commit and size). Add the compose services, fetch script and env. Run Scenarios 2-3.
2. Write the sample generator, generate and commit the PDF (Scenario 1).
3. Add the Prisma models, migration, entrypoint and Dockerfile changes. Confirm migrations apply on `up` and that the API still boots with postgres stopped.
4. Write the pure units (PDF text, chunker, embedders, ingestion decisions, search ranking) with tests using the fake embedder and an in-memory repository.
5. Add the Prisma repository, controller, module, shared types and CLI. Write `scripts/catalog/ingest.sh`.
6. Run the real end-to-end smoke (Scenarios 4-7), then `./init.sh`. Update the docs, `feature_list.json` (`passing` plus evidence) and `PROGRESS.md`.

## Implementation Tasks

- [ ] Image tag and GGUF verified and pinned (commit, bytes, digest).
- [ ] `embedder` / `embedder-fetch` / volume / env added. Fetch is idempotent. No GPU devices.
- [ ] Deterministic sample generator plus committed PDF (with the `--edition 2` variant).
- [ ] Prisma models plus raw-SQL migration (extension, vector(1024), HNSW). Entrypoint migrate is best-effort.
- [ ] Embedder interface, llama-server client and fake. Dimension guard.
- [ ] PDF extraction with no-text-layer detection. Page-bounded chunker.
- [ ] Idempotent ingestion service (hash, model, force, replace in one transaction) and CLI with exit codes.
- [ ] Search service with the SKU boost, controller, DTOs, Swagger, shared types.
- [ ] Unit and HTTP tests (offline). Shell scripts pass `bash -n`.
- [ ] Docs plus evidence.

## Verification Plan

Worktree env: `export COMPOSE_PROJECT_NAME=catalog-rag-ingestion POSTGRES_PORT=5634 MINIO_API_PORT=9300 MINIO_CONSOLE_PORT=9301 MAILPIT_UI_PORT=8325 MAILPIT_SMTP_PORT=1325 API_PORT=3300 EMBEDDING_PORT=8390`. Use `newgrp docker` if needed. No sudo. No GPU.

- `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r test`: exit 0, run offline. The test names must cover:
  - PDF extraction of the generated fixture (page count, page 3 text, page 5 flagged no-text);
  - chunker determinism and page boundaries;
  - the fake embedder being deterministic and 1024-dimensional;
  - the llama-server client against mocked fetch (batching, dimension mismatch, unavailable);
  - ingestion decisions (ingested, unchanged, forced, replaced, failed keeps old, no-text doc);
  - search ranking with the SKU boost;
  - the migration dimension matching the constant;
  - HTTP `/catalog/search` returning 200, 400 (blank q, limit 0/21) and 503 (embedder down), and `/docs-json` containing `/catalog/search`.
- `bash -n` on every new or changed `.sh`. `docker compose config -q` (also with `--profile rag --profile rag-fetch`). Run the awk pin check from `docs/specs/infra-compose-core.md`.
- Scenario 1: run the generator twice and compare `sha256sum`. `--edition 2` produces a different hash. `pdftotext` is not required: check through the test suite or a `node` one-liner.
- Scenario 2: `docker compose --profile rag-fetch run --rm embedder-fetch`, twice. `docker volume ls` shows `bricomission_embedding-models`, and the existing `bricomission_*` volumes have unchanged sizes.
- Scenario 3: `docker compose --profile rag up -d --wait embedder`. Then `docker inspect "$(docker compose ps -q embedder)" --format '{{json .HostConfig.Devices}}'` gives `[]` or `null`. `curl -s 127.0.0.1:8390/v1/embeddings -d '{"input":["test"]}' | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["data"][0]["embedding"]))'` gives `1024`. `ss -ltn` shows `127.0.0.1:8390` only.
- `./init.sh`: exit 0. The api is healthy and `docker compose exec -T postgres psql -U bricomission -d bricomission -c '\d catalog_chunk'` shows `vector(1024)`. Stop postgres and restart api: the api still boots and `/health` returns 503, then recovers.
- Scenarios 4-7: run `./scripts/catalog/ingest.sh infra/catalog/samples` and record the report. Curl the three searches (English, SKU, Spanish). Re-run and confirm `unchanged`, with identical `SELECT count(*), md5(string_agg(id::text, ',' ORDER BY id)) FROM catalog_chunk` before and after. Run with `--force`. Then the `--edition 2` file in `mktemp -d` under the same name gives `replaced`, and searching for the SKU returns `199.90` with no `189.90`. Error paths: an empty dir (exit 2); a dir with a corrupt `.pdf` (`head -c 100 /dev/urandom > bad.pdf`) next to the sample (exit 1, sample `unchanged`); `docker compose stop embedder`, then ingest with `--force` (exit 1, counts unchanged) and search (503).
- Optionally record the ingestion time for the sample (CPU) and `docker stats` CPU and RAM of the embedder.
- E2E: there is no persistent E2E harness yet (Playwright arrives with `web-pwa-shell`), and this feature has no UI. Supertest HTTP tests plus the real compose smoke cover the API flow.
- Leave the embedder stopped afterwards (`docker compose stop embedder`) and the core stack healthy.

## Evidence To Capture

- Embedding repo, commit, file, bytes, license. Image tag and digest. Ingestion report lines. Search JSON (top result) for the three queries. Idempotency count/hash before and after. Replace result. Error-path exit codes. Devices `[]`. Test names and counts. `./init.sh` tail. Record them in `feature_list.json` evidence and a `PROGRESS.md` session entry.

## Validator Checklist

- [ ] Scope: no budget, LLM, OCR, MinIO upload, auth or UI. GPU services and shared `bricomission_*` volumes untouched.
- [ ] The embedder is CPU-only (no devices), pinned, healthchecked, bound to 127.0.0.1 with an env-overridable port. Weights sit in the fixed-name volume via the one-shot fetch. `./init.sh` does not start it.
- [ ] The vector dimension (1024) is consistent across the model, migration, constant and client guard. The HNSW cosine index exists.
- [ ] The migration story works: applied on api start (best-effort) and by the ingest wrapper. The API still boots with the DB down.
- [ ] Ingestion accepts any directory, detects and skips no-text pages, is idempotent by hash and model, and replaces in one transaction. Exit codes match.
- [ ] Search returns document and page references, validates input, gives 503 without leaks, and is parameterized SQL only. The auth decision is documented.
- [ ] `pnpm -r test` is offline and uses the fake embedder. The sample PDF is clearly synthetic and reproducible.
- [ ] ADR 0004, ARCHITECTURE.md, AGENTS.md, technical-discovery and risks are updated. `feature_list.json` is `passing` (not `accepted`), and `PROGRESS.md` is updated.
