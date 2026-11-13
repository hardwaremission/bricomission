import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { RealmRole } from '@bricomission/shared-types';
import type { AuthenticatedUser, AuthRequest } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Opts a handler or controller out of the global default-deny AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a handler or controller to callers holding at least one of the realm roles. */
export const Roles = (...roles: RealmRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated caller attached by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthRequest>().user,
);
