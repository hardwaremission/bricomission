import pg from 'pg';

/**
 * Lazy PostgreSQL pool of the web server (schema web_session). One pool per process,
 * kept on globalThis so dev hot reloads do not leak connections. Nothing connects until
 * the first sign-in related query, so Home works with the database down.
 */
const KEY = Symbol.for('bricomission.web.pgPool');
type Holder = { [KEY]?: pg.Pool };

export function getPool(databaseUrl: string): pg.Pool {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30_000,
      query_timeout: 5000,
      application_name: 'bricomission-web',
    });
    // An idle client error (database restart) must not crash the server.
    pool.on('error', (error) => console.error(`web session pool: idle client error (${error.constructor.name})`));
    holder[KEY] = pool;
  }
  return holder[KEY];
}
