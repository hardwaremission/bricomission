import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');

describe('kitchen capture draft migration', () => {
  const dir = readdirSync(migrationsDir).find((name) => name.endsWith('_kitchen_capture_draft'));
  const sql = readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');

  it('adds the measurement range and token hash CHECK constraints', () => {
    expect(sql).toContain('CHECK ("length_cm" BETWEEN 100 AND 2000)');
    expect(sql).toContain('CHECK ("width_cm" BETWEEN 100 AND 2000)');
    expect(sql).toContain('CHECK ("height_cm" BETWEEN 180 AND 600)');
    expect(sql).toContain('CHECK (octet_length("draft_token_hash") = 32)');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "kitchen_project_draft_token_hash_key"/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });

  it('never drops anything (the catalog HNSW index stays)', () => {
    expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|EXTENSION)/i);
    expect(sql).not.toMatch(/catalog_chunk/);
  });

  it('runs after the catalog migration', () => {
    const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
    expect(names.indexOf(dir ?? '')).toBeGreaterThan(names.findIndex((name) => name.endsWith('_catalog_rag')));
  });
});

describe('moodboard selection migration', () => {
  const dir = readdirSync(migrationsDir).find((name) => name.endsWith('_moodboard_selection'));
  const sql = readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');

  it('creates moodboard_item with the source CHECK, the per-draft unique gallery id and cascade', () => {
    expect(sql).toContain('CREATE TABLE "moodboard_item"');
    expect(sql).toContain('CONSTRAINT "moodboard_item_source_columns" CHECK');
    expect(sql).toMatch(/"source" = 'gallery' AND "gallery_image_id" IS NOT NULL AND "full_key" IS NULL/);
    expect(sql).toMatch(/"source" = 'upload' AND "gallery_image_id" IS NULL AND "full_key" IS NOT NULL AND "thumb_key" IS NOT NULL AND "byte_size" > 0/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "moodboard_item_kitchen_project_id_gallery_image_id_key"/);
    expect(sql).toMatch(/REFERENCES "kitchen_project"\("id"\) ON DELETE CASCADE/);
  });

  it('never drops anything (the catalog HNSW index stays)', () => {
    expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|EXTENSION|CONSTRAINT)/i);
    expect(sql).not.toMatch(/catalog_chunk/);
  });

  it('runs after the kitchen capture draft migration', () => {
    const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
    expect(names.indexOf(dir ?? '')).toBeGreaterThan(names.findIndex((name) => name.endsWith('_kitchen_capture_draft')));
  });
});

describe('login gate claim migrations', () => {
  const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
  const enumDir = names.find((name) => name.endsWith('_kitchen_project_claimed_status'));
  const claimDir = names.find((name) => name.endsWith('_login_gate_claim'));
  const read = (dir: string | undefined) => readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');
  const statements = (sql: string) =>
    sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

  it('adds the enum value alone, in its own migration that runs first', () => {
    expect(statements(read(enumDir))).toEqual([`ALTER TYPE "kitchen_project_status" ADD VALUE 'claimed'`]);
    expect(names.indexOf(enumDir ?? '')).toBeGreaterThan(names.findIndex((name) => name.endsWith('_moodboard_selection')));
    expect(names.indexOf(claimDir ?? '')).toBeGreaterThan(names.indexOf(enumDir ?? ''));
  });

  it('adds owner_sub, claimed_at, nullable expires_at, the owner index and the status CHECK', () => {
    const sql = read(claimDir);
    expect(sql).toMatch(/ADD COLUMN\s+"owner_sub" TEXT/);
    expect(sql).toMatch(/ADD COLUMN\s+"claimed_at" TIMESTAMPTZ\(3\)/);
    expect(sql).toMatch(/ALTER COLUMN "expires_at" DROP NOT NULL/);
    expect(sql).toMatch(/CREATE INDEX "kitchen_project_owner_sub_idx" ON "kitchen_project"\("owner_sub"\)/);
    expect(sql).toContain('CONSTRAINT "kitchen_project_status_columns" CHECK');
    expect(sql).toMatch(/"status" = 'draft' AND "owner_sub" IS NULL AND "claimed_at" IS NULL AND "expires_at" IS NOT NULL AND "draft_token_hash" IS NOT NULL/);
    expect(sql).toMatch(/"status" = 'claimed' AND "owner_sub" IS NOT NULL AND "claimed_at" IS NOT NULL AND "expires_at" IS NULL/);
    expect(sql).toContain('CHECK (char_length("owner_sub") BETWEEN 1 AND 255)');
    expect(sql).not.toMatch(/ADD VALUE/);
  });

  it('never drops anything (the catalog HNSW index stays)', () => {
    for (const sql of [read(enumDir), read(claimDir)]) {
      expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|EXTENSION|CONSTRAINT|COLUMN)/i);
      expect(sql).not.toMatch(/catalog_chunk/);
    }
  });
});
