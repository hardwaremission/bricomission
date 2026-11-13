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

/** Keycloak realm roles of realm `BricoMission` (`realm_access.roles` in the access token). */
export type RealmRole = 'user' | 'professional' | 'admin';

/** Body of `GET /me`: the authenticated caller as seen by the API. */
export interface MeResponse {
  /** Keycloak user id (`sub`). */
  sub: string;
  /** Keycloak `preferred_username`. */
  username: string;
  /** Account email, or null when the token carries none. */
  email: string | null;
  /** Realm roles of the caller, limited to the BricoMission roles. */
  roles: RealmRole[];
}

/** Body of `GET /admin/ping` (admin-only liveness probe). */
export interface AdminPingResponse {
  status: 'ok';
}

/** Kind of GPU work: `image` runs exclusively, `llm` may share the GPU with other LLM jobs only. */
export type GpuJobKind = 'image' | 'llm';

/** Lifecycle of a GPU job: `queued -> running -> done | failed`. */
export type GpuJobStatus = 'queued' | 'running' | 'done' | 'failed';

/** Public failure code of a GPU job. Adapter messages are never exposed. */
export type GpuJobErrorCode = 'adapter_error' | 'timeout';

/** Body of `GET /ai/jobs/:id`. Timestamps are ISO-8601 strings. */
export interface GpuJobView {
  id: string;
  kind: GpuJobKind;
  status: GpuJobStatus;
  /** 1-based position in the queue while `queued`, otherwise null. */
  position: number | null;
  /** Kind of work the job is waiting behind while `queued`, otherwise null. */
  waitingFor: GpuJobKind | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: GpuJobErrorCode | null;
}

/** One SSE status event of `GET /ai/jobs/:id/events` (`seq` is the SSE `id`). */
export interface GpuJobEvent {
  jobId: string;
  seq: number;
  status: GpuJobStatus;
  position: number | null;
  waitingFor: GpuJobKind | null;
  at: string;
  errorCode: GpuJobErrorCode | null;
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
