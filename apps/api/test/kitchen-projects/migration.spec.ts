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

describe('controlnet render migration', () => {
  const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
  const dir = names.find((name) => name.endsWith('_controlnet_render'));
  const sql = readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');

  it('creates kitchen_render with its enums, the project index, cascade and SET NULL foreign keys', () => {
    expect(sql).toContain(`CREATE TYPE "kitchen_render_status" AS ENUM ('queued', 'running', 'succeeded', 'failed')`);
    expect(sql).toContain(`CREATE TYPE "kitchen_render_mode" AS ENUM ('canny', 'depth')`);
    expect(sql).toContain('CREATE TABLE "kitchen_render"');
    expect(sql).toMatch(/CREATE INDEX "kitchen_render_kitchen_project_id_created_at_idx" ON "kitchen_render"\("kitchen_project_id", "created_at"\)/);
    expect(sql).toMatch(/FOREIGN KEY \("kitchen_project_id"\) REFERENCES "kitchen_project"\("id"\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \("photo_id"\) REFERENCES "kitchen_photo"\("id"\) ON DELETE SET NULL/);
  });

  it('ties keys, codes and times to the status with hand-written CHECKs', () => {
    expect(sql).toContain('CONSTRAINT "kitchen_render_status_columns" CHECK');
    expect(sql).toMatch(/"status" = 'succeeded' AND "full_key" IS NOT NULL AND "thumb_key" IS NOT NULL AND "finished_at" IS NOT NULL/);
    expect(sql).toMatch(/"status" = 'failed' AND "error_code" IS NOT NULL/);
    expect(sql).toContain(`"error_code" IN ('adapter_error', 'timeout', 'interrupted', 'storage_unavailable')`);
  });

  it('never drops anything (the catalog HNSW index stays) and runs after the login gate migrations', () => {
    expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|EXTENSION|CONSTRAINT)/i);
    expect(sql).not.toMatch(/catalog_chunk/);
    expect(names.indexOf(dir ?? '')).toBeGreaterThan(names.findIndex((name) => name.endsWith('_login_gate_claim')));
  });
});

describe('budget tier computation migration', () => {
  const names = readdirSync(migrationsDir).filter((name) => /^\d+_/.test(name)).sort();
  const dir = names.find((name) => name.endsWith('_budget_tier_computation'));
  const sql = readFileSync(join(migrationsDir, dir ?? 'missing', 'migration.sql'), 'utf8');

  it('creates budget, budget_tier and budget_line_item with enums, indexes and cascading foreign keys', () => {
    expect(sql).toContain(`CREATE TYPE "budget_status" AS ENUM ('queued', 'running', 'succeeded', 'failed')`);
    expect(sql).toContain(`CREATE TYPE "budget_tier_name" AS ENUM ('luxury', 'high', 'medium', 'low')`);
    for (const table of ['budget', 'budget_tier', 'budget_line_item']) expect(sql).toContain(`CREATE TABLE "${table}"`);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "budget_tier_budget_id_tier_key" ON "budget_tier"\("budget_id", "tier"\)/);
    expect(sql).toMatch(/CREATE INDEX "budget_line_item_budget_id_tier_position_idx"/);
    expect(sql).toMatch(/"budget" ADD CONSTRAINT "budget_kitchen_project_id_fkey" FOREIGN KEY \("kitchen_project_id"\) REFERENCES "kitchen_project"\("id"\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"budget_tier" ADD CONSTRAINT "budget_tier_budget_id_fkey" FOREIGN KEY \("budget_id"\) REFERENCES "budget"\("id"\) ON DELETE CASCADE/);
    expect(sql).toContain('"unit_price_cents" BIGINT NOT NULL');
  });

  it('ties the finish time and the error code to the status and keeps tier amounts consistent with CHECKs', () => {
    expect(sql).toContain('CONSTRAINT "budget_status_columns" CHECK');
    expect(sql).toMatch(/"status" = 'succeeded' AND "finished_at" IS NOT NULL AND "error_code" IS NULL/);
    expect(sql).toMatch(/"status" = 'failed' AND "error_code" IS NOT NULL AND "finished_at" IS NOT NULL/);
    expect(sql).toContain(`"error_code" IN ('adapter_error', 'timeout', 'interrupted', 'verification_failed')`);
    expect(sql).toContain('"subtotal_cents" + "vat_cents" = "total_cents"');
  });

  it('has no foreign key to catalog_chunk (citations are data), never drops anything and runs after controlnet_render', () => {
    expect(sql).not.toMatch(/REFERENCES "catalog_chunk"/);
    expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|EXTENSION|CONSTRAINT)/i);
    expect(names.indexOf(dir ?? '')).toBeGreaterThan(names.findIndex((name) => name.endsWith('_controlnet_render')));
  });
});
