import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import type { AuthRequest } from './auth.types.js';
import { InvalidTokenError, KeysUnavailableError, TokenVerifier } from './token-verifier.service.js';

export const WWW_AUTHENTICATE = 'Bearer realm="BricoMission"';

/**
 * Global default-deny guard: every route needs `Authorization: Bearer <jwt>` unless it is
 * marked `@Public()`. Invalid or missing tokens give 401, unreachable signing keys give 503.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthRequest>();
    const unauthorized = () => {
      http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('WWW-Authenticate', WWW_AUTHENTICATE);
      return new UnauthorizedException();
    };

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw unauthorized();
    }
    try {
      request.user = await this.verifier.verify(token);
      return true;
    } catch (error) {
      // Log class names only, never the token or a library message. The verifier's own
      // errors carry the underlying class name as their message.
      if (error instanceof InvalidTokenError) {
        this.logger.debug(`Rejected token (${error.message})`);
        throw unauthorized();
      }
      const cause = error instanceof KeysUnavailableError ? error.message : error instanceof Error ? error.name : 'unknown';
      this.logger.warn(`Token verification unavailable (${cause})`);
      throw new ServiceUnavailableException();
    }
  }
}

function bearerToken(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') {
    return undefined;
  }
  // RFC 6750 b64token; the scheme name is case-insensitive (RFC 9110).
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i.exec(header.trim());
  return match?.[1];
}
