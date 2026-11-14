import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runs the migrations against a real PostgreSQL with rows inserted before the last migration, so the
 * backfill of 20261118000000_simulations_ux_overhaul (spec Decision 13, Scenario 7) is proven on data.
 * Needs a pgvector PostgreSQL: set MIGRATION_TEST_PSQL to a command that runs `psql` as a superuser,
 * e.g. `docker exec -i bm-migtest psql -U postgres -v ON_ERROR_STOP=1 -q -t -A`. Skipped otherwise
 * (`pnpm -r test` stays database-free); the feature evidence records a run.
 */
const PSQL = process.env.MIGRATION_TEST_PSQL?.trim();
const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');
const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
const LAST = '_simulations_ux_overhaul';
const NEXT = '_budget_per_simulation';
const before = names.slice(0, names.findIndex((n) => n.endsWith(LAST)));

function psql(database: string | null, input: string): string {
  const [cmd, ...args] = PSQL!.split(/\s+/);
  return execFileSync(cmd as string, [...args, ...(database ? ['-d', database] : [])], { input, encoding: 'utf8' }).trim();
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe.skipIf(!PSQL)('simulations ux overhaul migration on a real database', () => {
  it('migrates old Renders to one-Render Simulations, keeps the newest succeeded Budget and the HNSW index', () => {
    const db = `mig_${randomBytes(4).toString('hex')}`;
    psql(null, `CREATE DATABASE ${db};`);
    try {
      for (const name of before) psql(db, readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
      const P1 = uuid(1);
      const P2 = uuid(2);
      const hash = (n: number) => `decode('${String(n).padStart(2, '0').repeat(32)}', 'hex')`;
      const render = (n: number, project: string, status: string, at: string, photo: string | null = null) =>
        `INSERT INTO kitchen_render (id, kitchen_project_id, photo_id, status, mode, prompt, seed, width, height, before_key, full_key, thumb_key, error_code, created_at, finished_at)
         VALUES ('${uuid(n)}', '${project}', ${photo ? `'${photo}'` : 'NULL'}, '${status}', 'canny', 'p', ${n}, 1216, 832, 'k/${n}/before.jpg',
           ${status === 'succeeded' ? `'k/${n}/full.jpg', 'k/${n}/thumb.jpg'` : 'NULL, NULL'}, ${status === 'failed' ? `'timeout'` : 'NULL'}, '${at}', ${status === 'queued' ? 'NULL' : `'${at}'`});`;
      const budget = (n: number, project: string, status: string, at: string) =>
        `INSERT INTO budget (id, kitchen_project_id, status, error_code, currency, vat_bps, prompt, created_at, finished_at)
         VALUES ('${uuid(n)}', '${project}', '${status}', ${status === 'failed' ? `'timeout'` : 'NULL'}, 'EUR', 2100, 'p', '${at}', ${status === 'queued' ? 'NULL' : `'${at}'`});`;
      psql(
        db,
        `
        INSERT INTO kitchen_project (id, status, draft_token_hash, owner_sub, claimed_at, expires_at) VALUES
          ('${P1}', 'claimed', ${hash(11)}, 'sub-1', now(), NULL), ('${P2}', 'claimed', ${hash(12)}, 'sub-1', now(), NULL);
        INSERT INTO kitchen_photo (id, kitchen_project_id, position, full_key, thumb_key, width, height, byte_size)
          VALUES ('${uuid(50)}', '${P1}', 0, 'p/0/full.jpg', 'p/0/thumb.jpg', 800, 600, 1000), ('${uuid(51)}', '${P1}', 1, 'p/1/full.jpg', 'p/1/thumb.jpg', 800, 600, 1000);
        ${render(101, P1, 'succeeded', '2026-11-10 10:00:00+00', uuid(50))}
        ${render(102, P1, 'failed', '2026-11-10 11:00:00+00', uuid(51))}
        ${render(103, P1, 'succeeded', '2026-11-10 12:00:00+00', uuid(51))}
        ${render(104, P1, 'queued', '2026-11-10 13:00:00+00')}
        ${render(201, P2, 'failed', '2026-11-10 10:00:00+00')}
        ${budget(301, P1, 'succeeded', '2026-11-10 10:30:00+00')}
        ${budget(302, P1, 'succeeded', '2026-11-10 12:30:00+00')}
        ${budget(303, P1, 'failed', '2026-11-10 13:30:00+00')}
        ${budget(401, P2, 'succeeded', '2026-11-10 10:30:00+00')}
        INSERT INTO budget_tier (budget_id, tier, subtotal_cents, vat_cents, total_cents) VALUES ('${uuid(302)}', 'luxury', 100, 21, 121), ('${uuid(301)}', 'luxury', 100, 21, 121);
        `,
      );
      const hnswBefore = psql(db, `SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%hnsw%' ORDER BY 1;`);
      expect(hnswBefore).not.toBe('');

      psql(db, readFileSync(join(migrationsDir, names.find((n) => n.endsWith(LAST)) as string, 'migration.sql'), 'utf8'));

      // One Simulation per Render, ordinals by created_at per project, the Simulation id is the Render id.
      expect(psql(db, `SELECT id, ordinal, blend_mode, style_degraded, stage, selected, style_weights IS NULL FROM simulation WHERE kitchen_project_id = '${P1}' ORDER BY ordinal;`).split('\n')).toEqual([
        `${uuid(101)}|1|vlm_text|t|finished|f|t`,
        `${uuid(102)}|2|vlm_text|t|finished|f|t`,
        `${uuid(103)}|3|vlm_text|t|finished|f|t`,
        `${uuid(104)}|4|vlm_text|t|rendering|f|t`,
      ]);
      expect(psql(db, `SELECT ordinal FROM simulation WHERE kitchen_project_id = '${P2}';`)).toBe('1');
      expect(psql(db, `SELECT count(*) FROM kitchen_render WHERE simulation_id <> id OR simulation_id IS NULL;`)).toBe('0');
      expect(psql(db, `SELECT id, photo_position, attempts FROM kitchen_render WHERE kitchen_project_id = '${P1}' ORDER BY id;`).split('\n')).toEqual([
        `${uuid(101)}|0|1`,
        `${uuid(102)}|1|1`,
        `${uuid(103)}|1|1`,
        `${uuid(104)}|0|1`,
      ]);
      // Budgets: P1 keeps its newest succeeded one (302) on the newest succeeded Render's Simulation (103); the rest is deleted. P2 had no succeeded Render.
      expect(psql(db, `SELECT id, simulation_id, stage, relabeled FROM budget ORDER BY id;`)).toBe(`${uuid(302)}|${uuid(103)}|pricing|f`);
      expect(psql(db, `SELECT count(*) FROM budget_tier;`)).toBe('1');
      // Constraints and indexes.
      expect(psql(db, `SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%hnsw%' ORDER BY 1;`)).toBe(hnswBefore);
      expect(() => psql(db, `UPDATE simulation SET selected = true WHERE id = '${uuid(104)}';`)).toThrow();
      psql(db, `UPDATE simulation SET selected = true WHERE id = '${uuid(101)}';`);
      expect(() => psql(db, `UPDATE simulation SET selected = true WHERE id = '${uuid(102)}';`)).toThrow();
      // Deleting a Simulation cascades to its Renders and Budget.
      psql(db, `DELETE FROM simulation WHERE id = '${uuid(103)}';`);
      expect(psql(db, `SELECT (SELECT count(*) FROM kitchen_render WHERE id = '${uuid(103)}') || '|' || (SELECT count(*) FROM budget);`)).toBe('0|0');

      // Phase C migration: phase B data may hold several Budgets per Simulation. Two succeeded on 101, a queued and a running on 102.
      const phaseB = (n: number, simulation: string, status: string, at: string) =>
        `INSERT INTO budget (id, kitchen_project_id, simulation_id, status, error_code, currency, vat_bps, prompt, created_at, finished_at)
         VALUES ('${uuid(n)}', '${P1}', '${simulation}', '${status}', NULL, 'EUR', 2100, 'p', '${at}', ${status === 'succeeded' ? `'${at}'` : 'NULL'});`;
      psql(
        db,
        `${phaseB(501, uuid(101), 'succeeded', '2026-11-11 10:00:00+00')}
         ${phaseB(502, uuid(101), 'succeeded', '2026-11-11 11:00:00+00')}
         ${phaseB(503, uuid(102), 'queued', '2026-11-11 12:00:00+00')}
         ${phaseB(504, uuid(102), 'running', '2026-11-11 12:30:00+00')}`,
      );
      psql(db, readFileSync(join(migrationsDir, names.find((n) => n.endsWith(NEXT)) as string, 'migration.sql'), 'utf8'));
      expect(psql(db, `SELECT id, status, error_code FROM budget ORDER BY id;`).split('\n')).toEqual([`${uuid(502)}|succeeded|`, `${uuid(503)}|failed|interrupted`, `${uuid(504)}|failed|interrupted`]);
      // One succeeded and one active Budget per Simulation, enforced by the database.
      expect(() => psql(db, phaseB(505, uuid(101), 'succeeded', '2026-11-11 13:00:00+00'))).toThrow();
      psql(db, phaseB(506, uuid(102), 'queued', '2026-11-11 14:00:00+00'));
      expect(() => psql(db, phaseB(507, uuid(102), 'running', '2026-11-11 15:00:00+00'))).toThrow();
      psql(db, phaseB(508, uuid(101), 'queued', '2026-11-11 16:00:00+00')); // a recompute beside the current Budget
      expect(psql(db, `SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%hnsw%' ORDER BY 1;`)).toBe(hnswBefore);
    } finally {
      psql(null, `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    }
  });
});
