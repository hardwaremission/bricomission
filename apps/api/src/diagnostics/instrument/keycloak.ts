import type { JWTVerifyGetKey } from 'jose';
import type { Diagnostics } from '../diagnostics.types.js';
import { errorLabel } from './llm.js';

/** jose's remote key set exposes the cached document through `jwks()` (undefined until fetched). */
type RemoteKeySet = JWTVerifyGetKey & { jwks?: () => unknown };

/**
 * Wraps the remote JWKS resolver: when the key set was not cached (first use or refetch after a
 * cache miss) the call is a network fetch, reported as `api-guards` > `keycloak` (kind `auth`).
 * Cached lookups emit nothing. The wrapper returns exactly what the resolver returns.
 */
export function instrumentKeyResolver(inner: RemoteKeySet, diagnostics: Diagnostics): JWTVerifyGetKey {
  const wrapped: JWTVerifyGetKey = async (protectedHeader, token) => {
    const cached = inner.jwks?.() !== undefined;
    if (cached) return inner(protectedHeader, token);
    const span = diagnostics.span({ from: 'api-guards', to: 'keycloak', kind: 'auth', summary: 'JWKS fetch (cache miss)', payload: { path: 'protocol/openid-connect/certs' } });
    try {
      const key = await inner(protectedHeader, token);
      span.end({ summary: 'JWKS fetch (cache miss): keys cached', ok: true });
      return key;
    } catch (error) {
      span.end({ summary: `JWKS fetch failed (${errorLabel(error)})`, ok: false });
      throw error;
    }
  };
  // Keep the remote key set helpers (`jwks`, `reload`, ...) available to anything that reads them.
  return Object.assign(wrapped, inner);
}
