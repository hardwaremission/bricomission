import type { ApiClient } from '@bricomission/api-client';

export type ApiState = 'checking' | 'online' | 'degraded' | 'offline';

export const HEALTH_TIMEOUT_MS = 5000;

/**
 * Reads GET /health through the generated client (same-origin proxy at /api).
 * 200 -> online; 503 `database: down` -> degraded; anything else (network error,
 * timeout, proxy 502, other statuses) -> offline. Never throws.
 */
export async function checkApiHealth(client: ApiClient, timeoutMs = HEALTH_TIMEOUT_MS): Promise<Exclude<ApiState, 'checking'>> {
  try {
    const { data, error, response } = await client.GET('/health', { signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 200 && data?.database === 'up') return 'online';
    if (response.status === 503 && error?.database === 'down') return 'degraded';
    return 'offline';
  } catch {
    return 'offline';
  }
}
