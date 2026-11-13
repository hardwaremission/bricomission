// Type-only contracts shared across BricoMission packages.
// Consumers must use `import type`; this package ships no runtime code.

/** Overall API health. */
export type HealthStatus = 'ok' | 'error';

/** Reachability of the PostgreSQL database from the API. */
export type DatabaseStatus = 'up' | 'down';

/** Body of `GET /health`. */
export interface HealthResponse {
  status: HealthStatus;
  database: DatabaseStatus;
}

/** Keycloak realm roles of realm `BricoMission` (`realm_access.roles` in the access token). */
export type RealmRole = 'user' | 'professional' | 'admin';

/** Body of `GET /me`: the authenticated caller as seen by the API. */
export interface MeResponse {
  /** Keycloak user id (`sub`). */
  sub: string;
  /** Keycloak `preferred_username`. */
  username: string;
  /** Account email, or null when the token carries none. */
  email: string | null;
  /** Realm roles of the caller, limited to the BricoMission roles. */
  roles: RealmRole[];
}

/** Body of `GET /admin/ping` (admin-only liveness probe). */
export interface AdminPingResponse {
  status: 'ok';
}
