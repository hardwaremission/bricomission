import { errors } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthConfig } from '../src/auth/auth.config.js';
import { InvalidTokenError, KeysUnavailableError, TokenVerifier } from '../src/auth/token-verifier.service.js';
import { createTestKeys, signToken, unsignedToken } from './support/tokens.js';
import type { TestKeys } from './support/tokens.js';

describe('TokenVerifier', () => {
  let keys: TestKeys;
  let foreign: TestKeys;
  let verifier: TokenVerifier;

  beforeAll(async () => {
    keys = await createTestKeys('test-key');
    foreign = await createTestKeys('test-key'); // same kid, different key
    verifier = new TokenVerifier(loadAuthConfig(), keys.resolver);
  });

  it('maps a valid token to the user with only BricoMission realm roles', async () => {
    const token = await signToken(keys, { roles: ['user', 'offline_access', 'default-roles-bricomission'] });
    await expect(verifier.verify(token)).resolves.toEqual({
      sub: 'b0e2a1c4-0000-4000-8000-000000000001',
      username: 'bm-homeowner',
      email: 'homeowner@bricomission.local',
      roles: ['user'],
    });
  });

  it('returns no roles and null email when the claims are absent', async () => {
    const token = await signToken(keys, { claims: { realm_access: undefined, email: undefined } });
    await expect(verifier.verify(token)).resolves.toMatchObject({ email: null, roles: [] });
  });

  it.each([
    ['expired', () => signToken(keys, { expiresIn: -60 })],
    ['wrong issuer', () => signToken(keys, { claims: { iss: 'http://evil.example/realms/BricoMission' } })],
    ['wrong audience', () => signToken(keys, { claims: { aud: 'account' } })],
    ['signed by another key', () => signToken(foreign)],
    ['alg none', () => Promise.resolve(unsignedToken())],
    ['malformed', () => Promise.resolve('not-a-jwt')],
    ['missing sub', () => signToken(keys, { claims: { sub: undefined } })],
  ])('rejects a token that is %s with InvalidTokenError', async (_case, make) => {
    await expect(verifier.verify(await make())).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it.each([
    ['times out (JWKSTimeout)', new errors.JWKSTimeout()],
    ['answers non-200 (generic JOSEError)', new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response')],
    ['is unreachable (fetch TypeError)', new TypeError('fetch failed')],
  ])('reports KeysUnavailableError when the JWKS %s', async (_case, failure) => {
    const failing: JWTVerifyGetKey = () => Promise.reject(failure);
    const token = await signToken(keys, { roles: ['admin'] });
    const error = await new TokenVerifier(loadAuthConfig(), failing).verify(token).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeysUnavailableError);
    expect((error as Error).message).toBe(failure.name);
  });
});
