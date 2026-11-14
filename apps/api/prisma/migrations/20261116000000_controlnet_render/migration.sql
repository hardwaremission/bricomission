-- feature controlnet-render. Generated with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`,
-- then hand-edited: the CHECK constraints below are not modeled by Prisma. The catalog HNSW
-- index (20261113000000_catalog_rag) is untouched: this migration must never drop it.

-- CreateEnum
CREATE TYPE "kitchen_render_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "kitchen_render_mode" AS ENUM ('canny', 'depth');

-- CreateTable
CREATE TABLE "kitchen_render" (
    "id" UUID NOT NULL,
    "kitchen_project_id" UUID NOT NULL,
    "photo_id" UUID,
    "status" "kitchen_render_status" NOT NULL DEFAULT 'queued',
    "mode" "kitchen_render_mode" NOT NULL,
    "style_id" TEXT,
    "prompt" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "before_key" TEXT NOT NULL,
    "full_key" TEXT,
    "thumb_key" TEXT,
    "error_code" TEXT,
    "gpu_job_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "seconds" REAL,

    CONSTRAINT "kitchen_render_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_render_kitchen_project_id_created_at_idx" ON "kitchen_render"("kitchen_project_id", "created_at");

-- AddForeignKey
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_kitchen_project_id_fkey" FOREIGN KEY ("kitchen_project_id") REFERENCES "kitchen_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "kitchen_photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: a `succeeded` Render has both result objects and a finish time; a `failed` one
-- has a public error code; only `succeeded` has result keys. Codes are the public RenderErrorCode
-- list. Sizes are SDXL buckets (positive); the seed fits the sampler range.
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_status_columns" CHECK (
    ("status" = 'succeeded' AND "full_key" IS NOT NULL AND "thumb_key" IS NOT NULL AND "finished_at" IS NOT NULL AND "error_code" IS NULL)
    OR ("status" = 'failed' AND "error_code" IS NOT NULL AND "full_key" IS NULL AND "thumb_key" IS NULL AND "finished_at" IS NOT NULL)
    OR ("status" IN ('queued', 'running') AND "full_key" IS NULL AND "thumb_key" IS NULL AND "error_code" IS NULL AND "finished_at" IS NULL)
);
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_error_code" CHECK (
    "error_code" IS NULL OR "error_code" IN ('adapter_error', 'timeout', 'interrupted', 'storage_unavailable')
);
ALTER TABLE "kitchen_render" ADD CONSTRAINT "kitchen_render_size" CHECK ("width" > 0 AND "height" > 0 AND "seed" >= 0);
