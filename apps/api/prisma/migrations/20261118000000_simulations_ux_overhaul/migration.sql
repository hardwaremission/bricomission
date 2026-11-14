-- feature simulations-ux-overhaul (phase B). Written by hand against the schema.prisma additions
-- (Simulation, ReferenceStyleTrait, PlatformSetting, KitchenRender and Budget columns): the
-- backfill, the NOT NULL order and the partial unique index are not expressible by Prisma.
-- The catalog HNSW index (20261113000000_catalog_rag) is untouched: this migration never drops it.
-- Existing dev data is migrated, not deleted (spec Decision 13, developer answer OQ-4):
--   * each existing kitchen_render becomes its own one-Render Simulation (the Simulation id is
--     the Render id), ordinal by created_at per project, style_weights NULL, blend_mode
--     'vlm_text', style_degraded true, no selection;
--   * per project the newest succeeded Budget attaches to the Simulation of the newest
--     succeeded Render; every other Budget is deleted (rows only, tiers and Line Items cascade;
--     Budgets own no MinIO objects). No MinIO object is touched by SQL.
-- Deferred to phase C (budget-per-simulation): the two partial unique indexes on budget
-- (one succeeded and one active Budget per Simulation), because the current per-project Budget
-- cap code would violate them.

-- CreateEnum
CREATE TYPE "simulation_blend_mode" AS ENUM ('ip_adapter', 'vlm_text', 'both');

-- CreateEnum
CREATE TYPE "simulation_stage" AS ENUM ('describing', 'rendering', 'finished');

-- CreateEnum
CREATE TYPE "budget_stage" AS ENUM ('inventory', 'pricing');

-- CreateTable
CREATE TABLE "simulation" (
    "id" UUID NOT NULL,
    "kitchen_project_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "style_seed" INTEGER NOT NULL,
    "blend_mode" "simulation_blend_mode" NOT NULL,
    "style_weights" JSONB,
    "style_text" TEXT NOT NULL DEFAULT '',
    "style_keywords" JSONB NOT NULL DEFAULT '[]',
    "style_degraded" BOOLEAN NOT NULL DEFAULT false,
    "stage" "simulation_stage" NOT NULL DEFAULT 'describing',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_style_trait" (
    "image_hash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "traits" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_style_trait_pkey" PRIMARY KEY ("image_hash", "model")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulation_kitchen_project_id_ordinal_key" ON "simulation"("kitchen_project_id", "ordinal");

-- AddForeignKey
ALTER TABLE "simulation" ADD CONSTRAINT "simulation_kitchen_project_id_fkey" FOREIGN KEY ("kitchen_project_id") REFERENCES "kitchen_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: at most one selected Simulation per project, and only a finished one can be selected.
CREATE UNIQUE INDEX "simulation_one_selected_per_project" ON "simulation"("kitchen_project_id") WHERE "selected";
ALTER TABLE "simulation" ADD CONSTRAINT "simulation_columns" CHECK ("ordinal" >= 1 AND "style_seed" >= 0 AND (NOT "selected" OR "stage" = 'finished'));

-- AlterTable kitchen_render: new columns first (simulation_id nullable until the backfill).
ALTER TABLE "kitchen_render"
    ADD COLUMN "simulation_id" UUID,
    ADD COLUMN "photo_position" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "inventory" JSONB;

-- Backfill 1: one Simulation per existing Render (Simulation id = Render id).
INSERT INTO "simulation" ("id", "kitchen_project_id", "ordinal", "style_seed", "blend_mode", "style_weights", "style_text", "style_keywords", "style_degraded", "stage", "selected", "created_at", "updated_at")
SELECT r."id",
       r."kitchen_project_id",
       ROW_NUMBER() OVER (PARTITION BY r."kitchen_project_id" ORDER BY r."created_at", r."id"),
       r."seed",
       'vlm_text',
       NULL,
       '',
       '[]'::jsonb,
       true,
       CASE WHEN r."status" IN ('queued', 'running') THEN 'rendering'::"simulation_stage" ELSE 'finished'::"simulation_stage" END,
       false,
       r."created_at",
       COALESCE(r."finished_at", r."created_at")
FROM "kitchen_render" r;

-- Backfill 2: link each Render to its Simulation and keep the source Photo position.
UPDATE "kitchen_render" SET "simulation_id" = "id";
UPDATE "kitchen_render" r SET "photo_position" = p."position" FROM "kitchen_photo" p WHERE p."id" = r."photo_id";

ALTER TABLE "kitchen_render" ALTER COLUMN "simulation_id" SET NOT NULL;
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "kitchen_render_simulation_id_photo_position_idx" ON "kitchen_render"("simulation_id", "photo_position");
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_attempt_columns" CHECK ("attempts" >= 1 AND "photo_position" >= 0);

-- AlterTable budget: new columns (stage, progress and relabeled are used from phase C).
ALTER TABLE "budget"
    ADD COLUMN "simulation_id" UUID,
    ADD COLUMN "stage" "budget_stage" NOT NULL DEFAULT 'pricing',
    ADD COLUMN "progress_done" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "progress_total" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "relabeled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill 3: the newest succeeded Budget of a project joins the Simulation of its newest
-- succeeded Render; every other Budget is deleted (tiers and Line Items cascade).
UPDATE "budget" b
SET "simulation_id" = nr."id"
FROM (
    SELECT DISTINCT ON ("kitchen_project_id") "id", "kitchen_project_id"
    FROM "budget" WHERE "status" = 'succeeded'
    ORDER BY "kitchen_project_id", "created_at" DESC, "id" DESC
) nb
JOIN (
    SELECT DISTINCT ON ("kitchen_project_id") "id", "kitchen_project_id"
    FROM "kitchen_render" WHERE "status" = 'succeeded'
    ORDER BY "kitchen_project_id", "created_at" DESC, "id" DESC
) nr ON nr."kitchen_project_id" = nb."kitchen_project_id"
WHERE b."id" = nb."id";
DELETE FROM "budget" WHERE "simulation_id" IS NULL;

ALTER TABLE "budget" ALTER COLUMN "simulation_id" SET NOT NULL;
ALTER TABLE "budget" ADD CONSTRAINT "budget_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "budget_simulation_id_idx" ON "budget"("simulation_id");
ALTER TABLE "budget" ADD CONSTRAINT "budget_progress" CHECK ("progress_done" >= 0 AND "progress_total" >= 0);
