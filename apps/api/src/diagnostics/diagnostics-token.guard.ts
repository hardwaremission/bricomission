import { createHash, timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { DIAGNOSTICS_OPTIONS, type DiagnosticsOptions } from './diagnostics.types.js';

export const DIAGNOSTICS_TOKEN_HEADER = 'x-diagnostics-token';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Shared-token guard of the diagnostics routes. Reads the `X-Diagnostics-Token` header only (never a
 * query string), compares SHA-256 digests in constant time, and answers a generic 401 without
 * `WWW-Authenticate` and without logging the token.
 */
@Injectable()
export class DiagnosticsTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(DIAGNOSTICS_OPTIONS) options: DiagnosticsOptions) {
    this.expected = digest(options.token);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers[DIAGNOSTICS_TOKEN_HEADER];
    if (typeof header !== 'string' || header.length === 0 || header.length > 512) throw new UnauthorizedException();
    if (!timingSafeEqual(digest(header), this.expected)) throw new UnauthorizedException();
    return true;
  }
}
