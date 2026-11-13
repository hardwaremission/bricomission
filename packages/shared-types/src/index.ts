// Type-only contracts shared across BricoMission packages.
// Consumers must use `import type`; this package ships no runtime code.

/** Overall API health. */
export type HealthStatus = 'ok' | 'error';

/** Reachability of the PostgreSQL database from the API. */
export type DatabaseStatus = 'up' | 'down';

/** Body of `GET /health`. */
export interface HealthResponse {
  status: HealthStatus;
  database: DatabaseStatus;
}

/** One chunk returned by `GET /catalog/search`, with its Catalog source reference. */
export interface CatalogSearchResult {
  chunkId: string;
  documentId: string;
  /** PDF Title metadata, else the file name without `.pdf`. */
  catalogName: string;
  /** Source PDF file name (basename). */
  fileName: string;
  /** 1-based page number in the source PDF. */
  pageNumber: number;
  text: string;
  /** Cosine similarity between the query and the chunk (higher is closer). */
  score: number;
  /** True when the chunk contains a SKU-like token of the query verbatim (ranked first). */
  matchedSku: boolean;
}

/** Body of `GET /catalog/search`. */
export interface CatalogSearchResponse {
  query: string;
  results: CatalogSearchResult[];
}
