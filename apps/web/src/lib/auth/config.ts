/**
 * Runtime configuration of the web sign-in (BFF, feature homeowner-password-login).
 * Read from the server environment on first use (never baked into the build).
 * The public URLs are what the browser sees; the internal Keycloak URL is the server's
 * backchannel (token, JWKS, logout).
 */
export interface AuthConfig {
  /** Canonical origin of the web app, e.g. http://localhost:3100 (redirect URI base). */
  webPublicUrl: string;
  keycloakPublicUrl: string;
  keycloakInternalUrl: string;
  realm: string;
  clientId: string;
  /** Empty when unset: sign-in routes answer "unavailable". */
  clientSecret: string;
  /** Base64 of 32 bytes (AES-256-GCM); empty when unset. */
  sessionKey: string;
  /** PostgreSQL URL of the shared database; empty when unset. */
  databaseUrl: string;
}

export class AuthConfigError extends Error {}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  return {
    webPublicUrl: trimSlash(env.WEB_PUBLIC_URL || 'http://localhost:3100'),
    keycloakPublicUrl: trimSlash(env.KEYCLOAK_PUBLIC_URL || 'http://localhost:8180'),
    keycloakInternalUrl: trimSlash(env.KEYCLOAK_INTERNAL_URL || 'http://127.0.0.1:8180'),
    realm: env.KEYCLOAK_REALM || 'BricoMission',
    clientId: env.KEYCLOAK_WEB_CLIENT_ID || 'bricomission-web',
    clientSecret: env.KEYCLOAK_WEB_CLIENT_SECRET ?? '',
    sessionKey: env.WEB_SESSION_KEY ?? '',
    databaseUrl: env.WEB_DATABASE_URL ?? '',
  };
}

/** Throws AuthConfigError when a required secret is missing. */
export function assertComplete(config: AuthConfig): AuthConfig {
  if (!config.clientSecret || !config.sessionKey || !config.databaseUrl) {
    throw new AuthConfigError('missing KEYCLOAK_WEB_CLIENT_SECRET, WEB_SESSION_KEY or WEB_DATABASE_URL');
  }
  return config;
}

/** Issuer (public) and endpoints: browser-facing on the public URL, server calls on the internal URL. */
export function oidcEndpoints(config: AuthConfig) {
  const issuer = `${config.keycloakPublicUrl}/realms/${encodeURIComponent(config.realm)}`;
  const internal = `${config.keycloakInternalUrl}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect`;
  return {
    issuer,
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${internal}/token`,
    jwksUri: `${internal}/certs`,
    endSessionEndpoint: `${internal}/logout`,
  };
}

export function callbackUrl(config: AuthConfig): string {
  return `${config.webPublicUrl}/auth/callback`;
}
