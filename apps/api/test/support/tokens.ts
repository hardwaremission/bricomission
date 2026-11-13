import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { loadAuthConfig } from '../../src/auth/auth.config.js';

/** An RS256 key pair with its public JWKS, standing in for Keycloak in DB-free tests. */
export interface TestKeys {
  kid: string;
  privateKey: CryptoKey;
  resolver: JWTVerifyGetKey;
}

export async function createTestKeys(kid: string): Promise<TestKeys> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { kid, privateKey, resolver: createLocalJWKSet({ keys: [jwk] }) };
}

export interface TokenOptions {
  /** Claims merged over the Keycloak-like defaults (set a claim to undefined to drop it). */
  claims?: JWTPayload;
  /** Realm roles placed in realm_access.roles. */
  roles?: string[];
  /** Lifetime in seconds from now; negative values give an expired token. */
  expiresIn?: number;
  kid?: string;
}

/** Signs a Keycloak-shaped access token with the configured issuer and audience. */
export async function signToken(keys: TestKeys, options: TokenOptions = {}): Promise<string> {
  const { issuer, audience } = loadAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTPayload = {
    iss: issuer,
    aud: [audience, 'account'],
    sub: 'b0e2a1c4-0000-4000-8000-000000000001',
    preferred_username: 'bm-homeowner',
    email: 'homeowner@bricomission.local',
    realm_access: { roles: options.roles ?? ['user'] },
    iat: now - 5,
    exp: now + (options.expiresIn ?? 300),
    ...options.claims,
  };
  const payload = Object.fromEntries(Object.entries(claims).filter(([, value]) => value !== undefined));
  return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: options.kid ?? keys.kid }).sign(keys.privateKey);
}

/** An unsigned `alg: none` token with otherwise valid claims. */
export function unsignedToken(roles: string[] = ['admin']): string {
  const { issuer, audience } = loadAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: issuer, aud: audience, sub: 'x', realm_access: { roles }, exp: now + 300 })}.`;
}
