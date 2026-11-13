import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { open } from '../src/lib/auth/db/crypto';
import { createSchemaGuard, migrate, MIGRATION_LOCK_KEY, MIGRATIONS, type MigrationClient } from '../src/lib/auth/db/migrations';
import {
  CLEANUP_INTERVAL_MS,
  createPgSessionRepository,
  MAX_OPEN_TRANSACTIONS,
  TooManyTransactionsError,
  type Queryable,
  type StoredSession,
} from '../src/lib/auth/db/session-repository';
import { hashId } from '../src/lib/auth/session';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1In0.sig';

/** Minimal stand-in for the web_session tables: dispatches on the repository's SQL. */
function fakeDb() {
  const sessions = new Map<string, unknown[]>();
  const transactions = new Map<string, unknown[]>();
  const log: string[] = [];
  let openTransactions = 0;
  let txLive = true;
  const db: Queryable = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      log.push(sql);
      const id = params[0] instanceof Buffer ? params[0].toString('hex') : '';
      if (sql.startsWith('SELECT count(*)')) return { rows: [{ open: openTransactions }] };
      if (sql.startsWith('INSERT INTO web_session.auth_transactions')) {
        transactions.set(id, params);
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM web_session.auth_transactions WHERE id_hash')) {
        const p = transactions.get(id);
        transactions.delete(id);
        if (!p) return { rows: [] };
        return { rows: [{ state: p[1], nonce: p[2], code_verifier_enc: p[3], return_to: p[4], locale: p[5], expires_at: p[6], live: txLive }] };
      }
      if (sql.startsWith('INSERT INTO web_session.sessions')) {
        sessions.set(id, params);
        return { rows: [] };
      }
      if (sql.startsWith('SELECT sub')) {
        const p = sessions.get(id);
        if (!p) return { rows: [] };
        return {
          rows: [{ sub: p[1], username: p[2], display_name: p[3], access_token_enc: p[4], access_expires_at: p[5], refresh_token_enc: p[6], refresh_expires_at: p[7] }],
        };
      }
      if (sql.startsWith('UPDATE web_session.sessions')) {
        const p = sessions.get(id);
        if (p) sessions.set(id, [p[0], p[1], p[2], p[3], params[1], params[2], params[3], params[4]]);
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM web_session.sessions WHERE id_hash')) {
        sessions.delete(id);
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
  return {
    db,
    sessions,
    transactions,
    log,
    setOpenTransactions: (n: number) => (openTransactions = n),
    setTxLive: (live: boolean) => (txLive = live),
  };
}

function session(): StoredSession {
  return {
    sub: 'u1',
    username: 'bm-homeowner',
    displayName: 'Hugo',
    accessToken: TOKEN,
    accessExpiresAt: new Date(2_000_000_000_000),
    refreshToken: `${TOKEN}.refresh`,
    refreshExpiresAt: new Date(2_000_000_100_000),
  };
}

function setup(key = randomBytes(32)) {
  const fake = fakeDb();
  const ensureSchema = vi.fn(async () => undefined);
  const logError = vi.fn();
  let now = 1_000_000;
  const repo = createPgSessionRepository({ db: fake.db, key: () => key, ensureSchema, now: () => now, logError });
  return { ...fake, repo, key, ensureSchema, logError, advance: (ms: number) => (now += ms) };
}

describe('Postgres session repository', () => {
  it('stores the id hash and AES-GCM ciphertext only, bound to the row', async () => {
    const { repo, sessions, key } = setup();
    const idHash = hashId('cookie-value');
    await repo.insertSession(idHash, session());
    const params = sessions.get(idHash.toString('hex'));
    expect(params?.[0]).toEqual(idHash);
    for (const index of [4, 6]) {
      const sealed = params?.[index] as Buffer;
      expect(sealed).toBeInstanceOf(Buffer);
      expect(sealed.toString('latin1')).not.toContain('eyJ');
    }
    expect(params?.some((p) => typeof p === 'string' && p.includes('eyJ'))).toBe(false);
    // The AAD includes the row id: the ciphertext does not open for another row.
    expect(() => open(key, params?.[4] as Buffer, Buffer.concat([Buffer.from('access:'), hashId('other')]))).toThrow();
  });

  it('round-trips a session and its refreshed tokens', async () => {
    const { repo } = setup();
    const idHash = hashId('c');
    await repo.insertSession(idHash, session());
    expect(await repo.findSession(idHash)).toEqual(session());
    const tokens = { accessToken: 'a2', accessExpiresAt: new Date(3), refreshToken: 'r2', refreshExpiresAt: new Date(4) };
    await repo.updateTokens(idHash, tokens);
    expect(await repo.findSession(idHash)).toMatchObject(tokens);
    await repo.deleteSession(idHash);
    expect(await repo.findSession(idHash)).toBeNull();
  });

  it('drops a row that no longer decrypts (WEB_SESSION_KEY changed) and treats it as absent', async () => {
    const first = setup();
    const idHash = hashId('c');
    await first.repo.insertSession(idHash, session());
    const logError = vi.fn();
    const rotated = createPgSessionRepository({ db: first.db, key: () => randomBytes(32), ensureSchema: async () => undefined, logError });
    expect(await rotated.findSession(idHash)).toBeNull();
    expect(first.sessions.has(idHash.toString('hex'))).toBe(false);
    expect(logError).toHaveBeenCalledWith('web session: stored tokens do not decrypt (DecryptError); session dropped');
  });

  it('login transactions are single use, expire, and keep the PKCE verifier encrypted', async () => {
    const { repo, transactions, setTxLive } = setup();
    const idHash = hashId('tx');
    const tx = { state: 's', nonce: 'n', codeVerifier: 'verifier-secret', returnTo: '/x', locale: 'de', expiresAt: new Date(5) };
    await repo.insertTransaction(idHash, tx);
    const stored = transactions.get(idHash.toString('hex'));
    expect((stored?.[3] as Buffer).toString('latin1')).not.toContain('verifier-secret');
    expect(await repo.takeTransaction(idHash)).toEqual(tx);
    expect(await repo.takeTransaction(idHash)).toBeNull();
    await repo.insertTransaction(idHash, tx);
    setTxLive(false);
    expect(await repo.takeTransaction(idHash)).toBeNull();
  });

  it('refuses new transactions above the abuse cap', async () => {
    const { repo, setOpenTransactions } = setup();
    setOpenTransactions(MAX_OPEN_TRANSACTIONS);
    await expect(
      repo.insertTransaction(hashId('t'), { state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/', locale: 'en', expiresAt: new Date() }),
    ).rejects.toBeInstanceOf(TooManyTransactionsError);
  });

  it('cleans expired rows on insert at most once per 10 minutes', async () => {
    const { repo, log, advance } = setup();
    const cleanups = () => log.filter((sql) => sql.includes('< now()')).length;
    await repo.insertSession(hashId('a'), session());
    await repo.insertSession(hashId('b'), session());
    expect(cleanups()).toBe(2);
    advance(CLEANUP_INTERVAL_MS);
    await repo.insertTransaction(hashId('t'), { state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/', locale: 'en', expiresAt: new Date() });
    expect(cleanups()).toBe(4);
    expect(log).toContain('DELETE FROM web_session.auth_transactions WHERE expires_at < now()');
    expect(log).toContain('DELETE FROM web_session.sessions WHERE refresh_expires_at < now()');
  });

  it('lookups ignore expired rows and every query is schema-qualified', async () => {
    const { repo, log, ensureSchema } = setup();
    await repo.findSession(hashId('a'));
    expect(log.at(-1)).toContain('refresh_expires_at > now()');
    expect(ensureSchema).toHaveBeenCalled();
    for (const sql of log) expect(sql).toMatch(/web_session\./);
  });
});

describe('web_session migrations', () => {
  function fakeClient(applied: number[] = [], failOn?: string) {
    const statements: string[] = [];
    const client: MigrationClient = {
      query: vi.fn(async (text: string) => {
        statements.push(text.trim().split('\n')[0] ?? '');
        if (failOn && text.includes(failOn)) throw new Error('boom');
        if (text.startsWith('SELECT version')) return { rows: applied.map((version) => ({ version })) };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    return { pool: { connect: vi.fn(async () => client) }, client, statements };
  }

  it('applies missing versions in one transaction under the advisory lock', async () => {
    const { pool, client, statements } = fakeClient();
    expect(await migrate(pool)).toEqual([1]);
    expect(statements[0]).toBe('BEGIN');
    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    expect(statements).toContain('CREATE SCHEMA IF NOT EXISTS web_session');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('skips applied versions and rolls back on failure', async () => {
    const done = fakeClient([1]);
    expect(await migrate(done.pool)).toEqual([]);
    const failing = fakeClient([], 'CREATE TABLE web_session.sessions');
    await expect(migrate(failing.pool)).rejects.toThrow('boom');
    expect(failing.statements.at(-1)).toBe('ROLLBACK');
    expect(failing.client.release).toHaveBeenCalled();
  });

  it('migration SQL touches only the web_session schema', () => {
    for (const { sql } of MIGRATIONS) {
      for (const match of sql.matchAll(/(?:TABLE|ON)\s+([\w.]+)/g)) expect(match[1]).toMatch(/^web_session\./);
      expect(sql).not.toMatch(/\bpublic\./);
    }
  });

  it('the schema guard runs once per process and retries after a failure', async () => {
    let attempts = 0;
    const ok = fakeClient();
    const pool = {
      connect: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('database down');
        return ok.client;
      }),
    };
    const ensure = createSchemaGuard(pool);
    await expect(ensure()).rejects.toThrow('database down');
    await ensure();
    await ensure();
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });
});
