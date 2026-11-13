/**
 * CSRF rule for state-changing requests that carry the session cookie: the browser's
 * Origin header must be present and name this host. A missing or foreign Origin fails.
 */
export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || origin === 'null') return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const UNSAFE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
