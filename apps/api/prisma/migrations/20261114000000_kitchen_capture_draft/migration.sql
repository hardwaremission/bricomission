-- feature kitchen-capture-draft. Generated with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`,
-- then hand-edited: the CHECK constraints below are not modeled by Prisma. The catalog HNSW
-- index (20261113000000_catalog_rag) is untouched: this migration must never drop it.

-- CreateEnum
CREATE TYPE "kitchen_project_status" AS ENUM ('draft');

-- CreateTable
CREATE TABLE "kitchen_project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "kitchen_project_status" NOT NULL DEFAULT 'draft',
    "draft_token_hash" BYTEA,
    "length_cm" INTEGER,
    "width_cm" INTEGER,
    "height_cm" INTEGER,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_photo" (
    "id" UUID NOT NULL,
    "kitchen_project_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "full_key" TEXT NOT NULL,
    "thumb_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_project_draft_token_hash_key" ON "kitchen_project"("draft_token_hash");

-- CreateIndex
CREATE INDEX "kitchen_project_expires_at_idx" ON "kitchen_project"("expires_at");

-- CreateIndex
CREATE INDEX "kitchen_photo_kitchen_project_id_position_idx" ON "kitchen_photo"("kitchen_project_id", "position");

-- AddForeignKey
ALTER TABLE "kitchen_photo" ADD CONSTRAINT "kitchen_photo_kitchen_project_id_fkey" FOREIGN KEY ("kitchen_project_id") REFERENCES "kitchen_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: measurement ranges in whole centimetres (NULL = not entered yet), the 32-byte
-- SHA-256 draft token hash, and photo sanity checks.
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_length_cm_range" CHECK ("length_cm" BETWEEN 100 AND 2000);
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_width_cm_range" CHECK ("width_cm" BETWEEN 100 AND 2000);
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_height_cm_range" CHECK ("height_cm" BETWEEN 180 AND 600);
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_draft_token_hash_len" CHECK (octet_length("draft_token_hash") = 32);
ALTER TABLE "kitchen_photo" ADD CONSTRAINT "kitchen_photo_position_nonneg" CHECK ("position" >= 0);
ALTER TABLE "kitchen_photo" ADD CONSTRAINT "kitchen_photo_dimensions_positive" CHECK ("width" > 0 AND "height" > 0 AND "byte_size" > 0);
