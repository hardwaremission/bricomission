import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { instrumentKeyResolver } from '../diagnostics/instrument/keycloak.js';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config.js';
import type { AuthConfig } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';
import { MeController } from './me.controller.js';
import { RolesGuard } from './roles.guard.js';
import { KEY_RESOLVER, TokenVerifier } from './token-verifier.service.js';

/** Maximum time a JWKS download may take before requests get 503. */
export const JWKS_TIMEOUT_MS = 3000;

/**
 * Keycloak JWT authentication. Registers AuthGuard then RolesGuard globally
 * (APP_GUARD order = registration order), so every route is protected by default.
 */
@Module({
  controllers: [MeController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    {
      // Lazy: the JWKS is fetched on the first verification, so the API boots without Keycloak.
      provide: KEY_RESOLVER,
      useFactory: (config: AuthConfig, diagnostics?: Diagnostics) => {
        const jwks = createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: JWKS_TIMEOUT_MS });
        return diagnostics?.enabled ? instrumentKeyResolver(jwks, diagnostics) : jwks;
      },
      inject: [AUTH_CONFIG, { token: DIAGNOSTICS, optional: true }],
    },
    TokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenVerifier],
})
export class AuthModule {}
