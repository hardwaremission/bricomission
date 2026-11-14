-- feature login-gate-claim, part 1 of 2. PostgreSQL rejects a new enum value that is used in
-- the same transaction ("unsafe use of new value"), so the value is added alone here and only
-- used by the next migration (20261115000100_login_gate_claim).
-- The catalog HNSW index (20261113000000_catalog_rag) is untouched.

-- AlterEnum
ALTER TYPE "kitchen_project_status" ADD VALUE 'claimed';
