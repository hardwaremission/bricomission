import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Nest injection token for the active {@link CatalogRepository}. */
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export type CatalogDocumentStatus = 'indexed' | 'no_text_layer';

export interface StoredCatalogDocument {
  id: string;
  sourceName: string;
  catalogName: string;
  contentSha256: string;
  embeddingModel: string;
  pageCount: number;
  skippedPages: number[];
  status: CatalogDocumentStatus;
  chunkCount: number;
}

export interface NewCatalogDocument {
  sourceName: string;
  catalogName: string;
  contentSha256: string;
  embeddingModel: string;
  pageCount: number;
  skippedPages: number[];
  status: CatalogDocumentStatus;
}

export interface NewCatalogChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface CatalogChunkHit {
  chunkId: string;
  documentId: string;
  catalogName: string;
  fileName: string;
  pageNumber: number;
  text: string;
  /** Cosine similarity (1 - cosine distance). */
  score: number;
}

/** Persistence of the Catalog RAG index (pgvector in production, in memory in tests). */
export interface CatalogRepository {
  findDocumentBySourceName(sourceName: string): Promise<StoredCatalogDocument | null>;
  /**
   * Atomically replaces the document with this `sourceName` (if any) and all its
   * chunks. Either everything is written or nothing changes.
   */
  replaceDocument(document: NewCatalogDocument, chunks: NewCatalogChunk[]): Promise<{ documentId: string }>;
  /** Top-k chunks by cosine similarity, among documents embedded with `embeddingModel`. */
  searchByVector(vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]>;
  /** Chunks whose text contains any of `terms` (case-insensitive substring), scored against `vector`. */
  searchByTerms(terms: string[], vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]>;
}

/** pgvector literal, e.g. `[0.1,0.2]`; always passed as a bind parameter and cast with `::vector`. */
export function toVectorLiteral(vector: number[]): string {
  if (!vector.every((value) => Number.isFinite(value))) {
    throw new Error('embedding contains a non-finite value');
  }
  return `[${vector.join(',')}]`;
}

/** Escapes LIKE wildcards so a user term matches literally (backslash is PostgreSQL's default LIKE escape). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

interface HitRow {
  chunk_id: string;
  document_id: string;
  catalog_name: string;
  source_name: string;
  page_number: number;
  text: string;
  score: number;
}

function toHit(row: HitRow): CatalogChunkHit {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    catalogName: row.catalog_name,
    fileName: row.source_name,
    pageNumber: Number(row.page_number),
    text: row.text,
    score: Number(row.score),
  };
}

/** Prisma + pgvector implementation. Only parameterized tagged-template SQL. */
@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDocumentBySourceName(sourceName: string): Promise<StoredCatalogDocument | null> {
    const document = await this.prisma.catalogDocument.findUnique({
      where: { sourceName },
      include: { _count: { select: { chunks: true } } },
    });
    if (!document) return null;
    return {
      id: document.id,
      sourceName: document.sourceName,
      catalogName: document.catalogName,
      contentSha256: document.contentSha256,
      embeddingModel: document.embeddingModel,
      pageCount: document.pageCount,
      skippedPages: document.skippedPages,
      status: document.status as CatalogDocumentStatus,
      chunkCount: document._count.chunks,
    };
  }

  async replaceDocument(document: NewCatalogDocument, chunks: NewCatalogChunk[]): Promise<{ documentId: string }> {
    const literals = chunks.map((chunk) => toVectorLiteral(chunk.embedding));
    return this.prisma.$transaction(
      async (tx) => {
        await tx.catalogDocument.deleteMany({ where: { sourceName: document.sourceName } });
        const created = await tx.catalogDocument.create({ data: document, select: { id: true } });
        for (const [index, chunk] of chunks.entries()) {
          await tx.$executeRaw`
            INSERT INTO catalog_chunk (id, document_id, page_number, chunk_index, text, embedding)
            VALUES (${randomUUID()}::uuid, ${created.id}::uuid, ${chunk.pageNumber}, ${chunk.chunkIndex}, ${chunk.text}, ${literals[index]}::vector)`;
        }
        return { documentId: created.id };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  async searchByVector(vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]> {
    const literal = toVectorLiteral(vector);
    const rows = await this.prisma.$queryRaw<HitRow[]>`
      SELECT c.id::text AS chunk_id, d.id::text AS document_id, d.catalog_name, d.source_name,
             c.page_number, c.text, (1 - (c.embedding <=> ${literal}::vector))::float8 AS score
      FROM catalog_chunk c
      JOIN catalog_document d ON d.id = c.document_id
      WHERE d.embedding_model = ${embeddingModel}
      ORDER BY c.embedding <=> ${literal}::vector, c.id
      LIMIT ${limit}`;
    return rows.map(toHit);
  }

  async searchByTerms(terms: string[], vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]> {
    if (terms.length === 0) return [];
    const literal = toVectorLiteral(vector);
    const patterns = terms.map((term) => `%${escapeLike(term)}%`);
    const rows = await this.prisma.$queryRaw<HitRow[]>`
      SELECT c.id::text AS chunk_id, d.id::text AS document_id, d.catalog_name, d.source_name,
             c.page_number, c.text, (1 - (c.embedding <=> ${literal}::vector))::float8 AS score
      FROM catalog_chunk c
      JOIN catalog_document d ON d.id = c.document_id
      WHERE d.embedding_model = ${embeddingModel}
        AND c.text ILIKE ANY (${patterns}::text[])
      ORDER BY score DESC, c.id
      LIMIT ${limit}`;
    return rows.map(toHit);
  }
}
