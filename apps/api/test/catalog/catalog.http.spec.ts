import 'reflect-metadata';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSampleCatalog, SAMPLE_CATALOG_FILE_NAME } from '../../scripts/generate-sample-catalog.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CatalogIngestionService } from '../../src/catalog/catalog-ingestion.service.js';
import { CATALOG_REPOSITORY } from '../../src/catalog/catalog.repository.js';
import { EMBEDDER, EmbeddingUnavailableError } from '../../src/catalog/embedding/embedder.js';
import { FakeEmbedder } from '../../src/catalog/embedding/fake.embedder.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { InMemoryCatalogRepository, tempDir } from './helpers.js';

// DB-free, model-free HTTP tests: fake embedder + in-memory repository.
describe('HTTP GET /catalog/search', () => {
  let app: INestApplication;
  const embedder = new FakeEmbedder();
  const repo = new InMemoryCatalogRepository();

  beforeAll(async () => {
    const dir = await tempDir();
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), await buildSampleCatalog());
    await new CatalogIngestionService(repo, embedder).ingestDirectory(dir);
    await rm(dir, { recursive: true, force: true });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
      .overrideProvider(EMBEDDER)
      .useValue(embedder)
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(repo)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('200 with document and page references', async () => {
    const res = await request(app.getHttpServer()).get('/catalog/search').query({ q: 'oak laminate worktop', limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('oak laminate worktop');
    const [top] = res.body.results;
    expect(top).toMatchObject({ pageNumber: 3, fileName: SAMPLE_CATALOG_FILE_NAME, matchedSku: false });
    expect(top.text).toContain('BM-SYN-WTP-300');
    expect(top.text).toContain('189.90');
    expect(Object.keys(top).sort()).toEqual(
      ['catalogName', 'chunkId', 'documentId', 'fileName', 'matchedSku', 'pageNumber', 'score', 'text'],
    );
    expect(typeof top.score).toBe('number');
  });

  it('200 with the SKU chunk first for a SKU query', async () => {
    const res = await request(app.getHttpServer()).get('/catalog/search?q=BM-SYN-WTP-300');
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ pageNumber: 3, matchedSku: true });
    expect(res.body.results.length).toBeLessThanOrEqual(5);
  });

  it.each(['/catalog/search', '/catalog/search?q=%20%20', '/catalog/search?q=oak&limit=0', '/catalog/search?q=oak&limit=21', `/catalog/search?q=${'a'.repeat(501)}`])(
    '400 for %s',
    async (url) => {
      const res = await request(app.getHttpServer()).get(url);
      expect(res.status).toBe(400);
    },
  );

  it('503 with a generic message when the embedder is down', async () => {
    vi.spyOn(embedder, 'embedQuery').mockRejectedValueOnce(
      new EmbeddingUnavailableError('embedding endpoint unreachable (http://embedder:8080 secret)'),
    );
    const res = await request(app.getHttpServer()).get('/catalog/search?q=oak');
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Catalog search is temporarily unavailable');
    expect(res.text).not.toMatch(/embedder:8080|secret/);
  });

  it('503 when the database is unreachable', async () => {
    vi.spyOn(repo, 'searchByVector').mockRejectedValueOnce(new Error('connect ECONNREFUSED postgres:5432 password=x'));
    const res = await request(app.getHttpServer()).get('/catalog/search?q=oak');
    expect(res.status).toBe(503);
    expect(res.text).not.toContain('ECONNREFUSED');
  });

  it('/docs-json documents /catalog/search with 200, 400 and 503', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    const op = res.body.paths['/catalog/search'].get;
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '400', '503']));
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['q', 'limit']));
  });
});
