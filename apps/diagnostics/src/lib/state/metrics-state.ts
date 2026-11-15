import type { DiagnosticsContainerMetrics, DiagnosticsHostMetrics, DiagnosticsMetricsSample } from '@bricomission/shared-types';

/** No `metrics` frame for this long means the agent is gone (widgets dash, NO AGENT tag). */
export const AGENT_STALE_MS = 5000;
export const HIGH_LOAD = 0.9;

export type Metric = 'cpu' | 'ram' | 'vram' | 'gpu';
export type TileTone = 'normal' | 'high' | 'na' | 'noagent';

export interface Tile {
  metric: Metric;
  label: string;
  text: string;
  tone: TileTone;
  /** Bar fill 0 to 1 (0 for n/a and no agent). */
  fill: number;
  tag: 'APPROX' | 'NO AGENT' | null;
}

const LABEL: Record<Metric, string> = { cpu: 'CPU', ram: 'RAM', vram: 'VRAM', gpu: 'GPU' };
export const NO_AGENT_TEXT = '—';
export const NA_TEXT = 'n/a';

export function formatPct(value: number, approx = false): string {
  return `${approx ? '~' : ''}${Math.round(value)}%`;
}

/** MiB as the design prints it: `180 MB` under 1 GB, `5.6 GB` from there. */
export function formatMem(mib: number): string {
  if (Math.round(mib) < 1000) return `${Math.round(mib)} MB`;
  return `${(mib / 1024).toFixed(1)} GB`;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function tile(metric: Metric, value: number | null, text: (v: number) => string, fraction: (v: number) => number, approx = false): Tile {
  if (value === null) return { metric, label: LABEL[metric], text: NA_TEXT, tone: 'na', fill: 0, tag: null };
  const fill = clamp01(fraction(value));
  return { metric, label: LABEL[metric], text: text(value), tone: fill >= HIGH_LOAD ? 'high' : 'normal', fill, tag: approx ? 'APPROX' : null };
}

/**
 * The four tiles of a container widget. `null` is "not measurable" (n/a), never a number; without agent data
 * every tile is a dash with the NO AGENT tag. GPU % of a container is an attribution of the card-wide busy %
 * (`approx`), shown with a `~` prefix.
 */
export function containerTiles(container: DiagnosticsContainerMetrics | null | undefined, host: DiagnosticsHostMetrics | null | undefined, agentUp: boolean): Tile[] {
  const metrics: Metric[] = ['cpu', 'ram', 'vram', 'gpu'];
  if (!agentUp || !container) {
    return metrics.map((metric) => ({ metric, label: LABEL[metric], text: agentUp ? NA_TEXT : NO_AGENT_TEXT, tone: agentUp ? 'na' : 'noagent', fill: 0, tag: agentUp ? null : 'NO AGENT' }) as Tile);
  }
  const ramTotal = host?.ramTotalMiB ?? null;
  const vramTotal = host?.vramTotalMiB ?? null;
  return [
    tile('cpu', container.cpuPct, (v) => formatPct(v), (v) => v / 100),
    tile('ram', container.ramMiB, formatMem, (v) => (ramTotal ? v / ramTotal : 0)),
    tile('vram', container.vramMiB, formatMem, (v) => (vramTotal ? v / vramTotal : 0)),
    tile('gpu', container.gpuPct, (v) => formatPct(v, container.approx === true), (v) => v / 100, container.approx === true),
  ];
}

export interface HostTile {
  metric: Metric;
  label: string;
  text: string;
  fill: number;
  tone: TileTone;
}

const gb = (mib: number): string => {
  const value = mib / 1024;
  return value >= 10 && Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
};

/** Header host strip (exact host totals): `23%`, `31.4 / 64 GB`, `12.3 / 16 GB`, `87%`. */
export function hostTiles(host: DiagnosticsHostMetrics | null | undefined, agentUp: boolean): HostTile[] {
  const none = (metric: Metric): HostTile => ({ metric, label: LABEL[metric], text: agentUp ? NA_TEXT : NO_AGENT_TEXT, fill: 0, tone: agentUp ? 'na' : 'noagent' });
  if (!agentUp || !host) return (['cpu', 'ram', 'vram', 'gpu'] as Metric[]).map(none);
  const pct = (metric: Metric, value: number | null): HostTile => {
    if (value === null) return none(metric);
    const fill = clamp01(value / 100);
    return { metric, label: LABEL[metric], text: formatPct(value), fill, tone: fill >= HIGH_LOAD ? 'high' : 'normal' };
  };
  const pair = (metric: Metric, used: number | null, total: number | null): HostTile => {
    if (used === null || total === null || total <= 0) return none(metric);
    const fill = clamp01(used / total);
    const totalText = total >= 1024 ? String(Math.round(total / 1024)) : gb(total);
    return { metric, label: LABEL[metric], text: `${gb(used)} / ${totalText} GB`, fill, tone: fill >= HIGH_LOAD ? 'high' : 'normal' };
  };
  return [pct('cpu', host.cpuPct), pair('ram', host.ramUsedMiB, host.ramTotalMiB), pair('vram', host.vramUsedMiB, host.vramTotalMiB), pct('gpu', host.gpuBusyPct)];
}

export interface MetricsState {
  sample: DiagnosticsMetricsSample | null;
  /** Client clock of the last sample. */
  receivedAt: number | null;
}

export const EMPTY_METRICS: MetricsState = { sample: null, receivedAt: null };

export function agentUp(state: MetricsState, now: number): boolean {
  return state.receivedAt !== null && now - state.receivedAt < AGENT_STALE_MS;
}

export type AiChip = 'LOADED' | 'UNLOADED' | 'WARM' | 'BUSY' | 'ERROR' | 'OFFLINE' | null;

/** A model is resident when the container holds at least this much VRAM. */
export const RESIDENT_VRAM_MIB = 1024;

/**
 * State chip of an AI node from measured values only: OFFLINE (no container), ERROR, BUSY (a call is in
 * flight), then residency by VRAM: llama-server LOADED or UNLOADED, ComfyUI WARM or UNLOADED. Without a
 * VRAM reading (agent down, CPU-only embedder) there is no residency chip.
 */
export function aiChip(node: 'llama-server' | 'comfyui' | 'embedder', phase: string, container: DiagnosticsContainerMetrics | null | undefined, up: boolean): AiChip {
  if (phase === 'offline') return 'OFFLINE';
  if (phase === 'error') return 'ERROR';
  if (phase === 'working') return 'BUSY';
  if (node === 'embedder' || !up || !container || container.vramMiB === null) return null;
  if (container.vramMiB >= RESIDENT_VRAM_MIB) return node === 'comfyui' ? 'WARM' : 'LOADED';
  return 'UNLOADED';
}
