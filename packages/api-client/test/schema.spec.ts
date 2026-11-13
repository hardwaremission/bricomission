import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderSchema, SCHEMA_PATH } from '../scripts/schema.ts';
import { createApiClient } from '../src/index.ts';

describe('@bricomission/api-client', () => {
  it('src/schema.ts is up to date with openapi.json', async () => {
    const committed = readFileSync(SCHEMA_PATH, 'utf8');
    expect(committed, 'stale schema: run `pnpm --filter @bricomission/api-client generate`').toBe(await renderSchema());
  });

  it('GET /health is typed and hits the configured base URL', async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ status: 'ok', database: 'up' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = createApiClient('http://web.test/api', fakeFetch);
    const { data, response } = await client.GET('/health');
    expect(response.status).toBe(200);
    expect(data?.database).toBe('up');
    expect(calls).toEqual(['http://web.test/api/health']);
  });

  it('a 503 body lands in error, not data', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ status: 'error', database: 'down' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    const { data, error, response } = await createApiClient('http://web.test/api', fakeFetch).GET('/health');
    expect(response.status).toBe(503);
    expect(data).toBeUndefined();
    expect(error).toEqual({ status: 'error', database: 'down' });
  });
});
