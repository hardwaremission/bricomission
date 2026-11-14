-- feature moodboard-selection. Generated with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`,
-- then hand-edited: the CHECK constraints below are not modeled by Prisma. The catalog HNSW
-- index (20261113000000_catalog_rag) is untouched: this migration must never drop it.

-- CreateEnum
CREATE TYPE "moodboard_item_source" AS ENUM ('gallery', 'upload');

-- CreateTable
CREATE TABLE "moodboard_item" (
    "id" UUID NOT NULL,
    "kitchen_project_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "moodboard_item_source" NOT NULL,
    "gallery_image_id" TEXT,
    "full_key" TEXT,
    "thumb_key" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moodboard_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moodboard_item_kitchen_project_id_position_idx" ON "moodboard_item"("kitchen_project_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "moodboard_item_kitchen_project_id_gallery_image_id_key" ON "moodboard_item"("kitchen_project_id", "gallery_image_id");

-- AddForeignKey
ALTER TABLE "moodboard_item" ADD CONSTRAINT "moodboard_item_kitchen_project_id_fkey" FOREIGN KEY ("kitchen_project_id") REFERENCES "kitchen_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a gallery item references a Style Gallery image id and has no stored objects;
-- an upload item has both object keys and a byte size and no gallery image id. Plus sanity checks.
ALTER TABLE "moodboard_item" ADD CONSTRAINT "moodboard_item_source_columns" CHECK (
    ("source" = 'gallery' AND "gallery_image_id" IS NOT NULL AND "full_key" IS NULL AND "thumb_key" IS NULL AND "byte_size" IS NULL)
    OR ("source" = 'upload' AND "gallery_image_id" IS NULL AND "full_key" IS NOT NULL AND "thumb_key" IS NOT NULL AND "byte_size" > 0)
);
ALTER TABLE "moodboard_item" ADD CONSTRAINT "moodboard_item_gallery_image_id_format" CHECK ("gallery_image_id" ~ '^[a-z0-9-]{1,64}$');
ALTER TABLE "moodboard_item" ADD CONSTRAINT "moodboard_item_position_nonneg" CHECK ("position" >= 0);
ALTER TABLE "moodboard_item" ADD CONSTRAINT "moodboard_item_dimensions_positive" CHECK ("width" > 0 AND "height" > 0);
