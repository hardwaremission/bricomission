/** Injection token for the resolved {@link AuthConfig}. */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/** Keycloak settings the API needs to validate access tokens. */
export interface AuthConfig {
  /** Expected `iss`: the fixed frontend URL of realm BricoMission (KC_HOSTNAME). */
  issuer: string;
  /** JWKS endpoint, reached over the backchannel (compose network) by the API. */
  jwksUrl: string;
  /** Expected `aud`: the bricomission-api client. */
  audience: string;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  issuer: 'http://localhost:8180/realms/BricoMission',
  jwksUrl: 'http://keycloak:8080/realms/BricoMission/protocol/openid-connect/certs',
  audience: 'bricomission-api',
};

/** Reads KEYCLOAK_ISSUER, KEYCLOAK_JWKS_URL and KEYCLOAK_AUDIENCE, falling back to the defaults. */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    issuer: env.KEYCLOAK_ISSUER || DEFAULT_AUTH_CONFIG.issuer,
    jwksUrl: env.KEYCLOAK_JWKS_URL || DEFAULT_AUTH_CONFIG.jwksUrl,
    audience: env.KEYCLOAK_AUDIENCE || DEFAULT_AUTH_CONFIG.audience,
  };
}
