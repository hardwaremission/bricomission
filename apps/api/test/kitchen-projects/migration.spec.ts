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
