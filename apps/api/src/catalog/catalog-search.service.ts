import { Inject, Injectable } from '@nestjs/common';
import type { CatalogSearchResponse, CatalogSearchResult } from '@bricomission/shared-types';
import { CATALOG_REPOSITORY, type CatalogChunkHit, type CatalogRepository } from './catalog.repository.js';
import { EMBEDDER, type Embedder } from './embedding/embedder.js';

export const SEARCH_QUERY_MAX_CHARS = 500;
export const SEARCH_LIMIT_DEFAULT = 5;
export const SEARCH_LIMIT_MIN = 1;
export const SEARCH_LIMIT_MAX = 20;

/** Invalid search input (HTTP 400). The message is safe to return to clients. */
export class CatalogSearchValidationError extends Error {
  override readonly name = 'CatalogSearchValidationError';
}

export interface CatalogSearchParams {
  query: string;
  limit: number;
}

/** Validates raw query-string values: `q` 1-500 characters and not blank, `limit` an integer 1-20 (default 5). */
export function parseSearchParams(q: unknown, limit: unknown): CatalogSearchParams {
  if (typeof q !== 'string' || q.trim() === '') {
    throw new CatalogSearchValidationError('q is required and must not be blank');
  }
  if (q.length > SEARCH_QUERY_MAX_CHARS) {
    throw new CatalogSearchValidationError(`q must be at most ${SEARCH_QUERY_MAX_CHARS} characters`);
  }
  let parsedLimit = SEARCH_LIMIT_DEFAULT;
  if (limit !== undefined) {
    if (typeof limit !== 'string' && typeof limit !== 'number') {
      throw new CatalogSearchValidationError('limit must be an integer');
    }
    const text = String(limit).trim();
    if (!/^\d+$/.test(text)) {
      throw new CatalogSearchValidationError(`limit must be an integer between ${SEARCH_LIMIT_MIN} and ${SEARCH_LIMIT_MAX}`);
    }
    parsedLimit = Number(text);
  }
  if (parsedLimit < SEARCH_LIMIT_MIN || parsedLimit > SEARCH_LIMIT_MAX) {
    throw new CatalogSearchValidationError(`limit must be an integer between ${SEARCH_LIMIT_MIN} and ${SEARCH_LIMIT_MAX}`);
  }
  return { query: q.trim(), limit: parsedLimit };
}

const SKU_TOKEN = /^[A-Z0-9][A-Z0-9-]{3,}$/;

/**
 * SKU-like tokens of a query: `[A-Z0-9][A-Z0-9-]{3,}` (case-sensitive, as printed in
 * Catalogs) that also contain a digit, so plain upper-case words are not boosted.
 */
export function extractSkuTokens(query: string): string[] {
  const tokens = query.split(/[^A-Za-z0-9-]+/).map((token) => token.replace(/^-+|-+$/g, ''));
  return [...new Set(tokens.filter((token) => SKU_TOKEN.test(token) && /\d/.test(token)))];
}

/**
 * Semantic search over the Catalog RAG index. Used in-process by the budget engine
 * and by `GET /catalog/search`. The query is embedded with the instruction prefix
 * and matched by cosine similarity; chunks containing a SKU-like query token verbatim
 * rank first (`matchedSku: true`). Results are de-duplicated and cut at `limit`.
 * Embedder or database failures propagate to the caller (the controller maps them to 503).
 */
@Injectable()
export class CatalogSearchService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  async search(params: CatalogSearchParams): Promise<CatalogSearchResponse> {
    const { query, limit } = params;
    const vector = await this.embedder.embedQuery(query);
    const skuTokens = extractSkuTokens(query);
    const [skuHits, vectorHits] = await Promise.all([
      this.repository.searchByTerms(skuTokens, vector, this.embedder.model, limit),
      this.repository.searchByVector(vector, this.embedder.model, limit),
    ]);
    const seen = new Set<string>();
    const results: CatalogSearchResult[] = [];
    const add = (hit: CatalogChunkHit, matchedSku: boolean): void => {
      if (seen.has(hit.chunkId) || results.length >= limit) return;
      seen.add(hit.chunkId);
      results.push({ ...hit, matchedSku });
    };
    skuHits.forEach((hit) => add(hit, true));
    vectorHits.forEach((hit) => add(hit, false));
    return { query, results };
  }
}
