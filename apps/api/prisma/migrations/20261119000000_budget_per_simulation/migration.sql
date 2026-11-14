-- feature simulations-ux-overhaul (phase C): one current Budget per Simulation.
-- Hand-written: partial unique indexes are not expressible by Prisma. The catalog HNSW index is untouched.
--   * at most one succeeded Budget per Simulation (a recompute deletes the old one in the success transaction);
--   * at most one active (queued or running) Budget per Simulation.
-- Existing data first: phase B dev data may hold several Budgets per Simulation (the per-project cap
-- allowed up to five), so before the indexes exist an active row becomes failed/interrupted (GPU jobs
-- are in memory and cannot survive a migration) and every succeeded Budget but the newest of its
-- Simulation is deleted (tiers and Line Items cascade; Budgets own no MinIO objects).

UPDATE "budget"
SET "status" = 'failed', "error_code" = 'interrupted', "finished_at" = now()
WHERE "status" IN ('queued', 'running');

DELETE FROM "budget" b
USING (
    SELECT "id", row_number() OVER (PARTITION BY "simulation_id" ORDER BY "created_at" DESC, "id" DESC) AS rn
    FROM "budget" WHERE "status" = 'succeeded'
) ranked
WHERE b."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX "budget_one_succeeded_per_simulation" ON "budget"("simulation_id") WHERE "status" = 'succeeded';
CREATE UNIQUE INDEX "budget_one_active_per_simulation" ON "budget"("simulation_id") WHERE "status" IN ('queued', 'running');
