import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RealmRole } from '@bricomission/shared-types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import type { AuthRequest } from './auth.types.js';

/**
 * Global guard that runs after AuthGuard: when a handler or controller declares
 * `@Roles(...)`, the caller needs at least one of those realm roles, otherwise 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<RealmRole[] | undefined>(ROLES_KEY, targets);
    if (!required || required.length === 0) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
