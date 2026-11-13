import createClient from 'openapi-fetch';
import type { components, paths } from './schema.ts';

export type { components, paths };

/** Typed client for the BricoMission REST API (paths from the committed OpenAPI snapshot). */
export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch) {
  return createClient<paths>({ baseUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export type ApiClient = ReturnType<typeof createApiClient>;
