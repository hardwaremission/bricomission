-- Catalog RAG index (feature catalog-rag-ingestion, ADR 0004).
-- Generated with `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
-- then hand-edited: pgvector extension first, HNSW cosine index last.
-- The vector dimension (1024) must equal CATALOG_EMBEDDING_DIMENSIONS
-- (src/catalog/embedding/embedder.ts); a unit test checks it.

-- pgvector (also created by infra/postgres/initdb on a fresh volume).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "catalog_document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_name" TEXT NOT NULL,
    "catalog_name" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "embedding_model" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "skipped_pages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_chunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,

    CONSTRAINT "catalog_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_document_source_name_key" ON "catalog_document"("source_name");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_chunk_document_id_page_number_chunk_index_key" ON "catalog_chunk"("document_id", "page_number", "chunk_index");

-- AddForeignKey
ALTER TABLE "catalog_chunk" ADD CONSTRAINT "catalog_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "catalog_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex (hand-written): approximate nearest neighbour search by cosine distance.
CREATE INDEX "catalog_chunk_embedding_hnsw_idx" ON "catalog_chunk" USING hnsw ("embedding" vector_cosine_ops);
