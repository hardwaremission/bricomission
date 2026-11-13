import type { RealmRole } from '@bricomission/shared-types';

/** Every BricoMission realm role; anything else in `realm_access.roles` is ignored. */
export const REALM_ROLES: readonly RealmRole[] = ['user', 'professional', 'admin'];

/** The caller, built from a verified Keycloak access token. */
export interface AuthenticatedUser {
  sub: string;
  username: string;
  email: string | null;
  roles: RealmRole[];
}

/** Minimal HTTP request shape the guards read and enrich. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}
