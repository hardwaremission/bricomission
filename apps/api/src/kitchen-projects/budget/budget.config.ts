/** Budget settings from env (compose and `.env.example` hold the same defaults). */
export interface BudgetConfig {
  /** Non-failed Budgets per project (`BUDGET_MAX_PER_PROJECT`, default 5: OQ-3). */
  maxPerProject: number;
  /** VAT rate in basis points from `BUDGET_VAT_PERCENT` (default 21 % = 2100: OQ-1). Catalog prices are VAT-inclusive. */
  vatBps: number;
  /** LLM attempts in total (`BUDGET_MAX_ATTEMPTS`, default 2: one retry with feedback). */
  maxAttempts: number;
  /** Catalog chunks sent to the LLM at most (`BUDGET_CHUNK_LIMIT`, default 30). */
  chunkLimit: number;
}

export const BUDGET_CONFIG = Symbol('BUDGET_CONFIG');

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = { maxPerProject: 5, vatBps: 2100, maxAttempts: 2, chunkLimit: 30 };

function integer(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  return value >= min && value <= max ? value : fallback;
}

/** `21` or `10.5` percent -> basis points; the fallback for anything else or above 100. */
function vatBps(raw: string | undefined, fallback: number): number {
  if (raw === undefined || !/^\d{1,3}(\.\d{1,2})?$/.test(raw.trim())) return fallback;
  const percent = Number(raw.trim());
  return percent <= 100 ? Math.round(percent * 100) : fallback;
}

export function readBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  return {
    maxPerProject: integer(env.BUDGET_MAX_PER_PROJECT, DEFAULT_BUDGET_CONFIG.maxPerProject, 1, 1000),
    vatBps: vatBps(env.BUDGET_VAT_PERCENT, DEFAULT_BUDGET_CONFIG.vatBps),
    maxAttempts: integer(env.BUDGET_MAX_ATTEMPTS, DEFAULT_BUDGET_CONFIG.maxAttempts, 1, 5),
    chunkLimit: integer(env.BUDGET_CHUNK_LIMIT, DEFAULT_BUDGET_CONFIG.chunkLimit, 1, 100),
  };
}
