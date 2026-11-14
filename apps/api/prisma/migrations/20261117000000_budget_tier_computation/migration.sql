-- feature budget-tier-computation. Generated with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`,
-- then hand-edited: the CHECK constraints at the end are not modeled by Prisma. The catalog HNSW
-- index (20261113000000_catalog_rag) is untouched: this migration must never drop it.
-- budget_line_item has no foreign key to catalog_chunk on purpose: re-ingesting a Catalog replaces
-- its chunks, and the citation (catalog name, page, quote) is stored as data.

-- CreateEnum
CREATE TYPE "budget_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "budget_tier_name" AS ENUM ('luxury', 'high', 'medium', 'low');

-- CreateTable
CREATE TABLE "budget" (
    "id" UUID NOT NULL,
    "kitchen_project_id" UUID NOT NULL,
    "status" "budget_status" NOT NULL DEFAULT 'queued',
    "error_code" TEXT,
    "currency" CHAR(3) NOT NULL,
    "vat_bps" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "gpu_job_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_tier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "tier" "budget_tier_name" NOT NULL,
    "subtotal_cents" BIGINT NOT NULL,
    "vat_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,

    CONSTRAINT "budget_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "tier" "budget_tier_name" NOT NULL,
    "position" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "catalog_name" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "source_quote" VARCHAR(200) NOT NULL,
    "quoted_price" TEXT NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "quantity" TEXT NOT NULL,
    "quantity_h" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "subtotal_cents" BIGINT NOT NULL,

    CONSTRAINT "budget_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_kitchen_project_id_created_at_idx" ON "budget"("kitchen_project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "budget_tier_budget_id_tier_key" ON "budget_tier"("budget_id", "tier");

-- CreateIndex
CREATE INDEX "budget_line_item_budget_id_tier_position_idx" ON "budget_line_item"("budget_id", "tier", "position");

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_kitchen_project_id_fkey" FOREIGN KEY ("kitchen_project_id") REFERENCES "kitchen_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_tier" ADD CONSTRAINT "budget_tier_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_item" ADD CONSTRAINT "budget_line_item_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a `succeeded` Budget has a finish time and no error code, a `failed` one a public
-- error code and a finish time, an active one neither. Codes are the public BudgetErrorCode list.
-- Amounts are never negative and a tier's subtotal + VAT equals its total; items cite a real page.
ALTER TABLE "budget" ADD CONSTRAINT "budget_status_columns" CHECK (
    ("status" = 'succeeded' AND "finished_at" IS NOT NULL AND "error_code" IS NULL)
    OR ("status" = 'failed' AND "error_code" IS NOT NULL AND "finished_at" IS NOT NULL)
    OR ("status" IN ('queued', 'running') AND "error_code" IS NULL AND "finished_at" IS NULL)
);
ALTER TABLE "budget" ADD CONSTRAINT "budget_error_code" CHECK (
    "error_code" IS NULL OR "error_code" IN ('adapter_error', 'timeout', 'interrupted', 'verification_failed')
);
ALTER TABLE "budget" ADD CONSTRAINT "budget_vat_bps" CHECK ("vat_bps" BETWEEN 0 AND 10000 AND "attempts" >= 0);
ALTER TABLE "budget_tier" ADD CONSTRAINT "budget_tier_amounts" CHECK (
    "subtotal_cents" >= 0 AND "vat_cents" >= 0 AND "subtotal_cents" + "vat_cents" = "total_cents"
);
ALTER TABLE "budget_line_item" ADD CONSTRAINT "budget_line_item_amounts" CHECK (
    "unit_price_cents" >= 0 AND "subtotal_cents" >= 0 AND "quantity_h" > 0 AND "page_number" >= 1 AND "position" >= 0
);
