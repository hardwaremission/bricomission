import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import type { RealmRole } from '@bricomission/shared-types';
import { AUTH_CONFIG } from './auth.config.js';
import type { AuthConfig } from './auth.config.js';
import { REALM_ROLES } from './auth.types.js';
import type { AuthenticatedUser } from './auth.types.js';

/** Injection token for the JWKS key resolver (remote in production, local in tests). */
export const KEY_RESOLVER = Symbol('KEY_RESOLVER');

/** The token is missing, malformed, expired, mis-signed or has wrong claims (HTTP 401). */
export class InvalidTokenError extends Error {
  override readonly name = 'InvalidTokenError';
}

/** The signing keys could not be obtained (JWKS unreachable, timed out or broken; HTTP 503). */
export class KeysUnavailableError extends Error {
  override readonly name = 'KeysUnavailableError';
}

// JOSE errors that describe the key source rather than the token.
const KEY_SOURCE_ERROR_CODES = new Set<string>([
  errors.JWKSTimeout.code, // JWKS request timed out
  errors.JOSEError.code, // generic: JWKS answered non-200 or non-JSON
  errors.JWKSInvalid.code, // JWKS document malformed
]);

/** Verifies Keycloak access tokens (RS256, issuer, audience, expiry) and maps them to users. */
@Injectable()
export class TokenVerifier {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(KEY_RESOLVER) private readonly keyResolver: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
      }));
    } catch (error) {
      // The cause keeps only the class name: messages may echo token contents.
      const cause = error instanceof Error ? error.name : 'unknown';
      if (error instanceof errors.JOSEError && !KEY_SOURCE_ERROR_CODES.has(error.code)) {
        throw new InvalidTokenError(cause);
      }
      throw new KeysUnavailableError(cause);
    }
    return toUser(payload);
  }
}

function toUser(payload: JWTPayload): AuthenticatedUser {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new InvalidTokenError('MissingSubject');
  }
  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const rawRoles = Array.isArray(realmAccess?.roles) ? realmAccess.roles : [];
  const roles = REALM_ROLES.filter((role: RealmRole) => rawRoles.includes(role));
  return {
    sub: payload.sub,
    username: typeof payload.preferred_username === 'string' ? payload.preferred_username : payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    roles,
  };
}
