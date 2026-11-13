import { describe, expect, it } from 'vitest';
import { createApiClient } from '@bricomission/api-client';
import { checkApiHealth } from '../src/lib/api-status';

const client = (impl: typeof fetch) => createApiClient('http://localhost:3100/api', impl);
const json = (body: unknown, status: number) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('checkApiHealth (Home service status)', () => {
  it('200 database up -> online', async () => {
    expect(await checkApiHealth(client(json({ status: 'ok', database: 'up' }, 200)))).toBe('online');
  });

  it('503 database down -> degraded', async () => {
    expect(await checkApiHealth(client(json({ status: 'error', database: 'down' }, 503)))).toBe('degraded');
  });

  it('proxy 502 -> offline', async () => {
    expect(await checkApiHealth(client(json({ status: 'error' }, 502)))).toBe('offline');
  });

  it('network error -> offline', async () => {
    expect(await checkApiHealth(client(async () => { throw new TypeError('Failed to fetch'); }))).toBe('offline');
  });

  it('timeout -> offline', async () => {
    const hang: typeof fetch = (input) =>
      new Promise((_, reject) => {
        const signal = input instanceof Request ? input.signal : undefined;
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    expect(await checkApiHealth(client(hang), 50)).toBe('offline');
  });

  it('calls GET /api/health on the page origin', async () => {
    const urls: string[] = [];
    await checkApiHealth(
      client(async (input) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return new Response('{"status":"ok","database":"up"}', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    expect(urls).toEqual(['http://localhost:3100/api/health']);
  });
});
