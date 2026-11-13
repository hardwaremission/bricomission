import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { AuthConfig } from '../../src/lib/auth/config';

/** Test doubles for the OIDC layer: a local RSA key, JWKS and ID token signer. */
export const CONFIG: AuthConfig = {
  webPublicUrl: 'http://localhost:3100',
  keycloakPublicUrl: 'http://localhost:8180',
  keycloakInternalUrl: 'http://keycloak:8080',
  realm: 'BricoMission',
  clientId: 'bricomission-web',
  clientSecret: 'test-secret',
  sessionKey: Buffer.alloc(32, 7).toString('base64'),
  databaseUrl: 'postgresql://unused',
};

export const ISSUER = 'http://localhost:8180/realms/BricoMission';
export const INTERNAL = 'http://keycloak:8080/realms/BricoMission/protocol/openid-connect';

export function newSigningKey(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

export function signJwt(privateKey: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${enc({ alg: 'RS256', typ: 'JWT', kid })}.${enc(claims)}`;
  return `${input}.${sign('sha256', Buffer.from(input), privateKey).toString('base64url')}`;
}

export function idTokenClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: 'bricomission-web',
    azp: 'bricomission-web',
    sub: 'user-123',
    iat: now,
    exp: now + 300,
    nonce: 'nonce-1',
    preferred_username: 'bm-homeowner',
    name: 'Hugo Homeowner',
    ...overrides,
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
