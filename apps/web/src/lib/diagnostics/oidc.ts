import type { OidcClient } from '../auth/oidc';
import type { DiagnosticsEmitter } from './emitter';

/**
 * Reports the token endpoint calls of the BFF (`web` > `keycloak`, kind `auth`): code exchange,
 * refresh and logout, with the endpoint path, grant type, status class and ms. No code, token or secret.
 * Returns the client unchanged when diagnostics are off. These calls happen outside the proxied
 * `/api` request, so they carry the internal correlation id `system`.
 */
export function instrumentOidc(client: OidcClient, diagnostics: DiagnosticsEmitter): OidcClient {
  if (!diagnostics.enabled) return client;
  const traced = async <T>(summary: string, payload: Record<string, unknown>, call: () => Promise<T>): Promise<T> => {
    const end = diagnostics.span({ correlationId: 'system', from: 'web', to: 'keycloak', kind: 'auth', summary, payload });
    try {
      const result = await call();
      end({ summary: `${summary}: ok`, payload: { ...payload, status: 200 }, ok: true });
      return result;
    } catch (error) {
      end({ summary: `${summary}: failed (${error instanceof Error ? error.constructor.name : 'error'})`, payload: { ...payload, status: 'error' }, ok: false });
      throw error;
    }
  };
  return {
    authorizationUrl: (params) => client.authorizationUrl(params),
    exchangeCode: (search, checks) => traced('code exchange', { path: '/protocol/openid-connect/token', grantType: 'authorization_code' }, () => client.exchangeCode(search, checks)),
    refresh: (refreshToken) => traced('refresh token', { path: '/protocol/openid-connect/token', grantType: 'refresh_token' }, () => client.refresh(refreshToken)),
    logout: (refreshToken) => traced('logout backchannel', { path: '/protocol/openid-connect/logout' }, () => client.logout(refreshToken)),
  };
}
