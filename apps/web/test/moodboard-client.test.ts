import { createApiClient } from '@bricomission/api-client';
import { describe, expect, it } from 'vitest';
import { addGalleryItem, loadStyleGallery, removeMoodboardItem } from '../src/lib/kitchen-draft/moodboard-client';

function fakeFetch(status: number, body: unknown = null, calls: Request[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const BASE = 'http://localhost:3100/api';

describe('moodboard-client', () => {
  it('loads the Style Gallery from /api/style-gallery', async () => {
    const calls: Request[] = [];
    const result = await loadStyleGallery(createApiClient(BASE, fakeFetch(200, { styles: [] }, calls)));
    expect(result).toEqual({ kind: 'ok', value: { styles: [] } });
    expect(calls[0]?.url).toBe(`${BASE}/style-gallery`);
  });

  it('adds a gallery item: 201 and 200 are both ok', async () => {
    const item = { id: 'i1', source: 'gallery', galleryImageId: 'modern-01' };
    for (const status of [201, 200]) {
      const calls: Request[] = [];
      const result = await addGalleryItem(createApiClient(BASE, fakeFetch(status, item, calls)), 'modern-01');
      expect(result).toEqual({ kind: 'ok', value: item });
      expect(calls[0]?.method).toBe('POST');
      expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/drafts/current/moodboard/gallery-items`);
      expect(await calls[0]?.json()).toEqual({ galleryImageId: 'modern-01' });
    }
  });

  it('maps failures: 404 missing, 502 and network offline, others error', async () => {
    expect(await addGalleryItem(createApiClient(BASE, fakeFetch(404)), 'modern-01')).toEqual({ kind: 'missing' });
    expect(await addGalleryItem(createApiClient(BASE, fakeFetch(502)), 'modern-01')).toEqual({ kind: 'offline' });
    expect(await addGalleryItem(createApiClient(BASE, fakeFetch(409, { code: 'moodboard_limit_reached' })), 'modern-01')).toEqual({ kind: 'error', status: 409 });
    const throwing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await loadStyleGallery(createApiClient(BASE, throwing))).toEqual({ kind: 'offline' });
  });

  it('removes an item with DELETE (204)', async () => {
    const calls: Request[] = [];
    const result = await removeMoodboardItem(createApiClient(BASE, fakeFetch(204, null, calls)), '0b6f0000-0000-4000-8000-000000000001');
    expect(result).toEqual({ kind: 'ok', value: null });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/drafts/current/moodboard/items/0b6f0000-0000-4000-8000-000000000001`);
    expect(await removeMoodboardItem(createApiClient(BASE, fakeFetch(503, { code: 'storage_unavailable' })), 'x')).toEqual({ kind: 'error', status: 503 });
  });
});
