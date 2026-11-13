# ADR 0004: CPU-only multilingual embeddings for the Catalog RAG index

## Status
Accepted, 2026-11-13 (feature `catalog-rag-ingestion`).

## Context

ADR 0002 makes every Budget price come from a cited Catalog chunk. The chunks need a local embedding model: the demo runs offline. Catalogs and queries are multilingual: partner Catalogs are mostly Spanish, product names are often bilingual, and the UI ships 11 locales. The GPU is already contended. ComfyUI fills about 15 GB of VRAM during a render and the LLM holds about 3.2 GB (`docs/spikes/local-ai-gpu-spike.md`). A third GPU tenant would need the GPU job broker for every search.

## Decision

- Model: `Qwen/Qwen3-Embedding-0.6B-GGUF`, file `Qwen3-Embedding-0.6B-Q8_0.gguf`. Apache-2.0, 100+ languages, **1024 dimensions**, last-token pooling. Pinned at repo commit `370f27d7550e0def9b39c1f16d3fbaa13aa67728`, 639,150,592 bytes, sha256 `06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439`.
- Server: stock llama.cpp `ghcr.io/ggml-org/llama.cpp:server-b12316`, the **CPU** build of the release the LLM uses (digest `sha256:2103d1f4f2e2e223ad80587dcb39fc15a9f912f29ae1fa9fc1193fe8c1aea82f`). Compose service `embedder`, profile `rag`. It runs `--embeddings --pooling last -ngl 0` with no devices and no `group_add`, so it cannot touch the GPU. The weights go into the fixed-name volume `bricomission_embedding-models`, filled once by `embedder-fetch` (profile `rag-fetch`).
- Query prefix: queries are embedded as `Instruct: Given a product search query, retrieve catalog passages that contain matching products\nQuery: <q>`. Documents are embedded raw, as the model card recommends. The prefix is configurable through `EMBEDDING_QUERY_INSTRUCTION`.
- Storage: pgvector `vector(1024)` with an HNSW `vector_cosine_ops` index. The constant `CATALOG_EMBEDDING_DIMENSIONS = 1024` (`apps/api/src/catalog/embedding/embedder.ts`) is checked against the migration by a unit test and against every response by the client.
- Model identity: each Catalog document stores `embeddingModel` (`EMBEDDING_MODEL`, default `qwen3-embedding-0.6b-q8_0`). Search only matches documents with the active model, and ingestion re-embeds a document when its model differs.

## Alternatives Considered

- **bge-m3 Q8_0 GGUF** (MIT, 1024 dimensions, CLS pooling, no prefixes): the fallback. It has the same dimension, so the schema stays the same. Switching it in means a new GGUF in the fetch script, `--pooling cls`, `EMBEDDING_MODEL` changed, `EMBEDDING_QUERY_INSTRUCTION=` (empty), and a re-ingest.
- **Embedding on the GPU**: faster, but it adds a third VRAM tenant and broker coordination for every search. Catalog chunks are few: the CPU embeds them in seconds.
- **English-only small models (MiniLM, bge-small)**: weak on Spanish Catalog text.
- **Embedding inside the API process (ONNX/transformers.js)**: it needs native runtimes and model files in the API image. A separate llama.cpp service follows the same pattern as the LLM, and an OpenAI-compatible endpoint can later be swapped from the Admin endpoint settings.

## Consequences

- No VRAM contention: search and ingestion never go through the GPU job broker.
- The embedder uses about 1 GB of RAM and some CPU while embedding. Ingesting the sample Catalog (4 chunks) takes about 4 s end to end, most of it container start-up.
- The embedder is opt-in (`--profile rag`) like the other AI services. While it is down, `GET /catalog/search` answers 503 and ingestion fails fast with a hint.
- Changing the model means a re-ingest. If the dimension changes too, it also needs a new migration, and the constant test catches a mismatch.

## Validation (2026-11-13)

- `POST /v1/embeddings` returns 1024-dimensional vectors. The container's `HostConfig.Devices` is `null`.
- On the synthetic sample Catalog, `oak laminate worktop`, `BM-SYN-WTP-300` and the Spanish `encimera roble` all return the page 3 chunk (the one holding `BM-SYN-WTP-300 ... 189.90 EUR`) as the top result, with cosine scores 0.58, 0.46 (SKU-boosted) and 0.46.
