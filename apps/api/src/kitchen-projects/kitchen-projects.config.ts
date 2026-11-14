/** Kitchen draft settings from env (compose and `.env.example` hold the same defaults). */
export interface KitchenDraftConfig {
  /** Sliding expiry: days after the last change. */
  ttlDays: number;
  /** DraftCleanupService period; 0 disables the timer (the start-up run still happens). */
  cleanupIntervalMs: number;
  /** Global cap of unexpired drafts; above it `POST /kitchen-projects/drafts` gives 429. */
  maxOpen: number;
}

export const KITCHEN_DRAFT_CONFIG = Symbol('KITCHEN_DRAFT_CONFIG');

export const DEFAULT_KITCHEN_DRAFT_CONFIG: KitchenDraftConfig = { ttlDays: 7, cleanupIntervalMs: 3_600_000, maxOpen: 2000 };

function nonNegativeInt(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min ? value : fallback;
}

export function readKitchenDraftConfig(env: NodeJS.ProcessEnv = process.env): KitchenDraftConfig {
  return {
    ttlDays: nonNegativeInt(env.DRAFT_TTL_DAYS, DEFAULT_KITCHEN_DRAFT_CONFIG.ttlDays, 1),
    cleanupIntervalMs: nonNegativeInt(env.DRAFT_CLEANUP_INTERVAL_MS, DEFAULT_KITCHEN_DRAFT_CONFIG.cleanupIntervalMs, 0),
    maxOpen: nonNegativeInt(env.DRAFT_MAX_OPEN, DEFAULT_KITCHEN_DRAFT_CONFIG.maxOpen, 1),
  };
}

/** Injectable clock so expiry and cleanup are testable. */
export const KITCHEN_CLOCK = Symbol('KITCHEN_CLOCK');
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export function expiryFrom(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
