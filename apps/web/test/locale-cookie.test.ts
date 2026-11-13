import { describe, expect, it } from 'vitest';
import { handleSetLocale } from '../src/lib/locale-cookie';

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3100/locale', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'localhost:3100', ...headers },
  });
}

describe('POST /locale (cookie setter)', () => {
  it('sets NEXT_LOCALE for 1 year, path /, SameSite=Lax and redirects 303 to /', async () => {
    const res = await handleSetLocale(post('locale=de'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toBe('NEXT_LOCALE=de; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it.each(['locale=xx', 'locale=nb', 'locale=', 'other=de', ''])('rejects %j with 400 and no cookie', async (body) => {
    const res = await handleSetLocale(post(body));
    expect(res.status).toBe(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a cross-origin form post with 403', async () => {
    const res = await handleSetLocale(post('locale=de', { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('accepts a same-origin post', async () => {
    const res = await handleSetLocale(post('locale=fr', { origin: 'http://localhost:3100' }));
    expect(res.status).toBe(303);
  });
});
