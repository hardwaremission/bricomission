import { DecryptError, open, seal } from './crypto';

/**
 * Storage of web sessions and in-flight login transactions (schema web_session).
 * Rows are keyed by the SHA-256 of the opaque cookie value (never the value itself).
 * Tokens and PKCE verifiers are AES-256-GCM sealed with the row's id hash as AAD.
 * Expired rows are invisible to lookups and deleted by a periodic cleanup on insert.
 */
export interface SessionTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface StoredSession extends SessionTokens {
  sub: string;
  username: string;
  displayName: string;
}

export interface StoredTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  locale: string;
  expiresAt: Date;
}

export interface SessionRepository {
  /** Throws TooManyTransactionsError above the abuse cap. */
  insertTransaction(idHash: Buffer, transaction: StoredTransaction): Promise<void>;
  /** Deletes and returns the transaction (single use); null when unknown, expired or unreadable. */
  takeTransaction(idHash: Buffer): Promise<StoredTransaction | null>;
  insertSession(idHash: Buffer, session: StoredSession): Promise<void>;
  /** Null when unknown or expired. A row that fails to decrypt (key changed) is deleted. */
  findSession(idHash: Buffer): Promise<StoredSession | null>;
  updateTokens(idHash: Buffer, tokens: SessionTokens): Promise<void>;
  deleteSession(idHash: Buffer): Promise<void>;
}

export class TooManyTransactionsError extends Error {}

/** Unexpired login transactions allowed at once (abuse cap). */
export const MAX_OPEN_TRANSACTIONS = 5000;
/** Minimum interval between expired-row cleanups per process. */
export const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export interface PgRepositoryOptions {
  db: Queryable;
  key: () => Buffer;
  ensureSchema: () => Promise<void>;
  now?: () => number;
  logError?: (message: string) => void;
}

const TX_AAD = Buffer.from('tx:');
const ACCESS_AAD = Buffer.from('access:');
const REFRESH_AAD = Buffer.from('refresh:');

function aad(prefix: Buffer, idHash: Buffer): Buffer {
  return Buffer.concat([prefix, idHash]);
}

export function createPgSessionRepository({ db, key, ensureSchema, now = Date.now, logError = console.error }: PgRepositoryOptions): SessionRepository {
  let lastCleanup = Number.NEGATIVE_INFINITY;

  async function cleanup() {
    if (now() - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now();
    await db.query('DELETE FROM web_session.auth_transactions WHERE expires_at < now()');
    await db.query('DELETE FROM web_session.sessions WHERE refresh_expires_at < now()');
  }

  function sealTokens(idHash: Buffer, tokens: SessionTokens) {
    const k = key();
    return {
      access: seal(k, tokens.accessToken, aad(ACCESS_AAD, idHash)),
      refresh: seal(k, tokens.refreshToken, aad(REFRESH_AAD, idHash)),
    };
  }

  return {
    async insertTransaction(idHash, tx) {
      await ensureSchema();
      await cleanup();
      const { rows } = await db.query('SELECT count(*)::int AS open FROM web_session.auth_transactions WHERE expires_at > now()');
      if (Number(rows[0]?.open ?? 0) >= MAX_OPEN_TRANSACTIONS) throw new TooManyTransactionsError('too many open login transactions');
      await db.query(
        `INSERT INTO web_session.auth_transactions (id_hash, state, nonce, code_verifier_enc, return_to, locale, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idHash, tx.state, tx.nonce, seal(key(), tx.codeVerifier, aad(TX_AAD, idHash)), tx.returnTo, tx.locale, tx.expiresAt],
      );
    },

    async takeTransaction(idHash) {
      await ensureSchema();
      const { rows } = await db.query(
        `DELETE FROM web_session.auth_transactions WHERE id_hash = $1
         RETURNING state, nonce, code_verifier_enc, return_to, locale, expires_at, expires_at > now() AS live`,
        [idHash],
      );
      const row = rows[0];
      if (!row || row.live !== true) return null;
      try {
        return {
          state: String(row.state),
          nonce: String(row.nonce),
          codeVerifier: open(key(), row.code_verifier_enc as Buffer, aad(TX_AAD, idHash)),
          returnTo: String(row.return_to),
          locale: String(row.locale),
          expiresAt: row.expires_at as Date,
        };
      } catch (error) {
        if (error instanceof DecryptError) {
          logError('web session: login transaction does not decrypt (DecryptError)');
          return null;
        }
        throw error;
      }
    },

    async insertSession(idHash, session) {
      await ensureSchema();
      await cleanup();
      const sealed = sealTokens(idHash, session);
      await db.query(
        `INSERT INTO web_session.sessions
           (id_hash, sub, username, display_name, access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [idHash, session.sub, session.username, session.displayName, sealed.access, session.accessExpiresAt, sealed.refresh, session.refreshExpiresAt],
      );
    },

    async findSession(idHash) {
      await ensureSchema();
      const { rows } = await db.query(
        `SELECT sub, username, display_name, access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at
         FROM web_session.sessions WHERE id_hash = $1 AND refresh_expires_at > now()`,
        [idHash],
      );
      const row = rows[0];
      if (!row) return null;
      try {
        const k = key();
        return {
          sub: String(row.sub),
          username: String(row.username),
          displayName: String(row.display_name),
          accessToken: open(k, row.access_token_enc as Buffer, aad(ACCESS_AAD, idHash)),
          accessExpiresAt: row.access_expires_at as Date,
          refreshToken: open(k, row.refresh_token_enc as Buffer, aad(REFRESH_AAD, idHash)),
          refreshExpiresAt: row.refresh_expires_at as Date,
        };
      } catch (error) {
        if (!(error instanceof DecryptError)) throw error;
        logError('web session: stored tokens do not decrypt (DecryptError); session dropped');
        await db.query('DELETE FROM web_session.sessions WHERE id_hash = $1', [idHash]);
        return null;
      }
    },

    async updateTokens(idHash, tokens) {
      await ensureSchema();
      const sealed = sealTokens(idHash, tokens);
      await db.query(
        `UPDATE web_session.sessions
         SET access_token_enc = $2, access_expires_at = $3, refresh_token_enc = $4, refresh_expires_at = $5, updated_at = now()
         WHERE id_hash = $1`,
        [idHash, sealed.access, tokens.accessExpiresAt, sealed.refresh, tokens.refreshExpiresAt],
      );
    },

    async deleteSession(idHash) {
      await ensureSchema();
      await db.query('DELETE FROM web_session.sessions WHERE id_hash = $1', [idHash]);
    },
  };
}

/** In-memory repository for unit tests (same contract, plaintext, no database). */
export function createMemorySessionRepository(now: () => number = Date.now) {
  const sessions = new Map<string, StoredSession>();
  const transactions = new Map<string, StoredTransaction>();
  const hex = (b: Buffer) => b.toString('hex');
  const repo: SessionRepository = {
    async insertTransaction(idHash, tx) {
      const open = [...transactions.values()].filter((t) => t.expiresAt.getTime() > now()).length;
      if (open >= MAX_OPEN_TRANSACTIONS) throw new TooManyTransactionsError('too many open login transactions');
      transactions.set(hex(idHash), { ...tx });
    },
    async takeTransaction(idHash) {
      const tx = transactions.get(hex(idHash));
      transactions.delete(hex(idHash));
      return tx && tx.expiresAt.getTime() > now() ? tx : null;
    },
    async insertSession(idHash, session) {
      sessions.set(hex(idHash), { ...session });
    },
    async findSession(idHash) {
      const s = sessions.get(hex(idHash));
      return s && s.refreshExpiresAt.getTime() > now() ? { ...s } : null;
    },
    async updateTokens(idHash, tokens) {
      const s = sessions.get(hex(idHash));
      if (s) sessions.set(hex(idHash), { ...s, ...tokens });
    },
    async deleteSession(idHash) {
      sessions.delete(hex(idHash));
    },
  };
  return { repo, sessions, transactions };
}
