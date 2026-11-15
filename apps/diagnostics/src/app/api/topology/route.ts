import { serverConfig } from '../../../server/config.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Proxy of the API topology (node labels, pins, model names read from real configuration). The token is added here. */
export async function GET(): Promise<Response> {
  const config = serverConfig();
  try {
    const response = await fetch(`${config.apiUrl}/diagnostics/topology`, {
      headers: { 'x-diagnostics-token': config.token },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) return Response.json({ error: 'api_disabled' }, { status: 404 });
    if (response.status === 401 || response.status === 403) return Response.json({ error: 'token_mismatch' }, { status: 401 });
    if (!response.ok) return Response.json({ error: 'api_unavailable' }, { status: 502 });
    return Response.json(await response.json(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'api_unavailable' }, { status: 502 });
  }
}
