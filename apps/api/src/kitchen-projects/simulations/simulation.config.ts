import { DEFAULT_LLM_MODEL } from '../../ai/adapters/llama-server-llm.adapter.js';
import { PHOTO_LIMITS } from '../photo-processor.js';

/** Simulation settings from env (compose and `.env.example` hold the same defaults). */
export interface SimulationConfig {
  /** Model id: part of the key of the cached vision descriptions (`LLM_MODEL`, also sent by the LLM adapter). */
  llmModel: string;
  /** Base IP-Adapter weight per reference for blend mode `ip_adapter` (spike A2: 0.6). */
  ipAdapterBase: number;
  /** Reduced base weight for blend mode `both` (the merged traits text carries the rest). */
  bothBase: number;
  /** Photos rendered per Simulation (the project's photo cap). */
  maxPhotos: number;
  /** Wait between submit attempts while the GPU queue is full, and how many attempts before a Render fails. */
  queueRetryMs: number;
  queueRetryMax: number;
}

export const SIMULATION_CONFIG = Symbol('SIMULATION_CONFIG');

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  llmModel: DEFAULT_LLM_MODEL,
  ipAdapterBase: 0.6,
  bothBase: 0.4,
  maxPhotos: PHOTO_LIMITS.maxPhotos,
  queueRetryMs: 2000,
  queueRetryMax: 30,
};

function weight(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

export function readSimulationConfig(env: NodeJS.ProcessEnv = process.env): SimulationConfig {
  return {
    ...DEFAULT_SIMULATION_CONFIG,
    // Fake adapters describe images from a hash: their traits must never be served to the real model
    // (and the other way round), so the cache key carries the adapter kind.
    llmModel: `${env.AI_ADAPTERS?.trim() === 'local' ? '' : 'fake:'}${env.LLM_MODEL?.trim() || DEFAULT_SIMULATION_CONFIG.llmModel}`,
    ipAdapterBase: weight(env.SIMULATION_IPADAPTER_BASE_WEIGHT, DEFAULT_SIMULATION_CONFIG.ipAdapterBase),
    bothBase: weight(env.SIMULATION_BOTH_BASE_WEIGHT, DEFAULT_SIMULATION_CONFIG.bothBase),
  };
}
