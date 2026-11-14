-- feature login-gate-claim, part 2 of 2. Generated with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`,
-- then hand-edited: the CHECK constraints below are not modeled by Prisma. The catalog HNSW
-- index (20261113000000_catalog_rag) is untouched: this migration must never drop it.

-- AlterTable
ALTER TABLE "kitchen_project" ADD COLUMN     "claimed_at" TIMESTAMPTZ(3),
ADD COLUMN     "owner_sub" TEXT,
ALTER COLUMN "expires_at" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "kitchen_project_owner_sub_idx" ON "kitchen_project"("owner_sub");


-- Hand-written: a `draft` is anonymous (no owner, no claim time) and expires (expiry and token
-- hash present); a `claimed` project has an owner and a claim time and never expires (it keeps
-- its token hash, so a repeated claim is idempotent). The owner is a Keycloak `sub`, 1-255 chars.
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_status_columns" CHECK (
    ("status" = 'draft' AND "owner_sub" IS NULL AND "claimed_at" IS NULL AND "expires_at" IS NOT NULL AND "draft_token_hash" IS NOT NULL)
    OR ("status" = 'claimed' AND "owner_sub" IS NOT NULL AND "claimed_at" IS NOT NULL AND "expires_at" IS NULL)
);
ALTER TABLE "kitchen_project" ADD CONSTRAINT "kitchen_project_owner_sub_length" CHECK (char_length("owner_sub") BETWEEN 1 AND 255);
