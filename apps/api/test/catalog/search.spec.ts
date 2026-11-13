import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildSampleCatalog, SAMPLE_CATALOG_FILE_NAME } from '../../scripts/generate-sample-catalog.js';
import { CatalogIngestionService } from '../../src/catalog/catalog-ingestion.service.js';
import { escapeLike, toVectorLiteral } from '../../src/catalog/catalog.repository.js';
import {
  CatalogSearchService,
  CatalogSearchValidationError,
  extractSkuTokens,
  parseSearchParams,
} from '../../src/catalog/catalog-search.service.js';
import { FakeEmbedder } from '../../src/catalog/embedding/fake.embedder.js';
import { InMemoryCatalogRepository, tempDir } from './helpers.js';

describe('parseSearchParams', () => {
  it('accepts valid input with a default limit of 5', () => {
    expect(parseSearchParams(' oak worktop ', undefined)).toEqual({ query: 'oak worktop', limit: 5 });
    expect(parseSearchParams('x', '20')).toEqual({ query: 'x', limit: 20 });
    expect(parseSearchParams('x', '1')).toEqual({ query: 'x', limit: 1 });
  });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['a'.repeat(501), undefined],
    ['oak', '0'],
    ['oak', '21'],
    ['oak', '2.5'],
    ['oak', 'abc'],
    ['oak', ['1', '2']],
    [['a', 'b'], undefined],
  ])('rejects q=%j limit=%j', (q, limit) => {
    expect(() => parseSearchParams(q, limit)).toThrow(CatalogSearchValidationError);
  });

  it('accepts exactly 500 characters', () => {
    expect(parseSearchParams('a'.repeat(500), undefined).query).toHaveLength(500);
  });
});

describe('extractSkuTokens', () => {
  it('finds SKU-like tokens with a digit only', () => {
    expect(extractSkuTokens('price of BM-SYN-WTP-300, please')).toEqual(['BM-SYN-WTP-300']);
    expect(extractSkuTokens('OAK LAMINATE worktop 300 cm')).toEqual([]);
    expect(extractSkuTokens('bm-syn-wtp-300')).toEqual([]);
    expect(extractSkuTokens('A1B2 and A1B2')).toEqual(['A1B2']);
  });
});

describe('repository SQL helpers', () => {
  it('escapes LIKE wildcards and builds pgvector literals', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(toVectorLiteral([0.5, -1, 0])).toBe('[0.5,-1,0]');
    expect(() => toVectorLiteral([Number.NaN])).toThrow();
  });
});

describe('CatalogSearchService ranking', () => {
  let dir: string;
  const repo = new InMemoryCatalogRepository();
  const embedder = new FakeEmbedder();
  const search = new CatalogSearchService(repo, embedder);

  beforeAll(async () => {
    dir = await tempDir();
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), await buildSampleCatalog());
    await new CatalogIngestionService(repo, embedder).ingestDirectory(dir);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty list for an empty index', async () => {
    const empty = new CatalogSearchService(new InMemoryCatalogRepository(), embedder);
    await expect(empty.search({ query: 'oak', limit: 5 })).resolves.toEqual({ query: 'oak', results: [] });
  });

  it('ranks the page 3 chunk first for an English description query', async () => {
    const { results } = await search.search({ query: 'oak laminate worktop', limit: 5 });
    expect(results[0]).toMatchObject({ pageNumber: 3, fileName: SAMPLE_CATALOG_FILE_NAME, matchedSku: false });
    expect(results[0].text).toContain('BM-SYN-WTP-300');
    expect(results[0].text).toContain('189.90');
  });

  it('boosts exact SKU matches to the top with matchedSku and de-duplicates', async () => {
    const { results } = await search.search({ query: 'BM-SYN-WTP-300', limit: 5 });
    expect(results[0]).toMatchObject({ pageNumber: 3, matchedSku: true });
    expect(typeof results[0].score).toBe('number');
    expect(new Set(results.map((r) => r.chunkId)).size).toBe(results.length);
    expect(results.length).toBeLessThanOrEqual(5);
    const sku = results.filter((r) => r.matchedSku);
    expect(results.slice(0, sku.length)).toEqual(sku);
  });

  it('honours the limit', async () => {
    const { results } = await search.search({ query: 'cabinet', limit: 1 });
    expect(results).toHaveLength(1);
  });
});
