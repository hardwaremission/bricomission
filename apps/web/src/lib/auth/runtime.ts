import { assertComplete, readAuthConfig, type AuthConfig } from './config';
import { parseSessionKey } from './db/crypto';
import { createSchemaGuard } from './db/migrations';
import { getPool } from './db/pool';
import { createPgSessionRepository, type SessionRepository } from './db/session-repository';
import { createAuthHandlers, type AuthHandlers } from './handlers';
import { instrumentOidc } from '../diagnostics/oidc';
import { sharedDiagnostics } from '../diagnostics/emitter';
import { createOidcClient, type OidcClient } from './oidc';
import { createSessionService, type SessionService } from './session';

/**
 * Process-wide wiring of the web sign-in: config, pool, repository, OIDC client, session
 * service and route handlers. Everything is lazy: nothing reads secrets, connects to the
 * database or calls Keycloak until a sign-in related request needs it. Kept on globalThis
 * so every route bundle shares one instance (and one single-flight refresh map).
 */
export interface AuthRuntime {
  config: () => AuthConfig;
  sessions: SessionService;
  handlers: AuthHandlers;
}

const KEY = Symbol.for('bricomission.web.authRuntime');
type Holder = { [KEY]?: AuthRuntime };

function build(): AuthRuntime {
  let config: AuthConfig | null = null;
  let key: Buffer | null = null;
  let repository: SessionRepository | null = null;
  let oidcClient: OidcClient | null = null;

  const getConfig = () => (config ??= assertComplete(readAuthConfig()));
  const getKey = () => (key ??= parseSessionKey(getConfig().sessionKey));
  const repo = () => {
    if (!repository) {
      getKey(); // a bad key fails here, before any query
      const pool = getPool(getConfig().databaseUrl);
      repository = createPgSessionRepository({ db: pool, key: getKey, ensureSchema: createSchemaGuard(pool) });
    }
    return repository;
  };
  const oidc = () => (oidcClient ??= instrumentOidc(createOidcClient(getConfig()), sharedDiagnostics()));
  const sessions = createSessionService({ repo, oidc });
  return { config: getConfig, sessions, handlers: createAuthHandlers({ config: getConfig, repo, oidc, sessions }) };
}

export function authRuntime(): AuthRuntime {
  const holder = globalThis as Holder;
  return (holder[KEY] ??= build());
}
