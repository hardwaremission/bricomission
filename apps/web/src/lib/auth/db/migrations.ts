/**
 * Migrations of the web-owned schema web_session (sessions and login transactions).
 * The API's Prisma owns `public` and never touches this schema; this code never touches
 * `public`. The SQL lives here as string constants so the standalone build needs no files.
 * Applied lazily, once per process, in one transaction under an advisory lock, so
 * concurrent web processes cannot race. Migrations are append-only: never edit a shipped one.
 */
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE web_session.sessions (
  id_hash bytea PRIMARY KEY,
  sub text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  access_token_enc bytea NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_token_enc bytea NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_refresh_expires_at_idx ON web_session.sessions (refresh_expires_at);
CREATE TABLE web_session.auth_transactions (
  id_hash bytea PRIMARY KEY,
  state text NOT NULL,
  nonce text NOT NULL,
  code_verifier_enc bytea NOT NULL,
  return_to text NOT NULL,
  locale text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_transactions_expires_at_idx ON web_session.auth_transactions (expires_at);
`,
  },
];

/** Arbitrary constant key of pg_advisory_xact_lock for web_session migrations ("bmwebses"). */
export const MIGRATION_LOCK_KEY = 0x626d77656273;

export interface MigrationClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

/** Applies the missing migrations in one transaction. Returns the versions applied. */
export async function migrate(pool: MigrationPool, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  const client = await pool.connect();
  const applied: number[] = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query('CREATE SCHEMA IF NOT EXISTS web_session');
    await client.query(
      'CREATE TABLE IF NOT EXISTS web_session.schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT version FROM web_session.schema_migrations');
    const done = new Set(rows.map((row) => Number(row.version)));
    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query('INSERT INTO web_session.schema_migrations (version) VALUES ($1)', [migration.version]);
      applied.push(migration.version);
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Once per process: the first caller runs the migration, later callers share its promise.
 * A failure (database down) is not cached, so the next call retries.
 */
export function createSchemaGuard(pool: MigrationPool, migrations: readonly Migration[] = MIGRATIONS) {
  let pending: Promise<void> | null = null;
  return function ensureWebSessionSchema(): Promise<void> {
    if (!pending) {
      pending = migrate(pool, migrations).then(
        () => undefined,
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
    }
    return pending;
  };
}
