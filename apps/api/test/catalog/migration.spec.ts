import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_EMBEDDING_DIMENSIONS } from '../../src/catalog/embedding/embedder.js';

const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');

describe('catalog RAG migration', () => {
  const dir = readdirSync(migrationsDir).find((name) => name.endsWith('_catalog_rag'));
  const sql = readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');

  it('declares vector columns with CATALOG_EMBEDDING_DIMENSIONS only', () => {
    const dims = [...sql.matchAll(/vector\((\d+)\)/g)].map((match) => Number(match[1]));
    expect(dims.length).toBeGreaterThan(0);
    expect(new Set(dims)).toEqual(new Set([CATALOG_EMBEDDING_DIMENSIONS]));
    expect(readFileSync(join(import.meta.dirname, '../../prisma/schema.prisma'), 'utf8')).toContain(
      `Unsupported("vector(${CATALOG_EMBEDDING_DIMENSIONS})")`,
    );
  });

  it('creates the pgvector extension first and an HNSW cosine index', () => {
    const statements = sql.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('--'));
    expect(statements[0]).toBe('CREATE EXTENSION IF NOT EXISTS vector;');
    expect(sql).toMatch(/USING hnsw \("embedding" vector_cosine_ops\)/);
    expect(readFileSync(join(migrationsDir, 'migration_lock.toml'), 'utf8')).toContain('provider = "postgresql"');
  });
});
