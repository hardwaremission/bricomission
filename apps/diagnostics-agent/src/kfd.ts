// KFD sysfs (`/sys/class/kfd/kfd/proc/<pid>/`) helpers and the approximate GPU % attribution (spike A1).
import type { Sys } from './sys.js';

export const KFD_PROC = '/sys/class/kfd/kfd/proc';

/** Sum of the `vram_<gpu_id>` files of one PID in bytes; `null` when the PID has no KFD entry. */
export function readKfdVramBytes(sys: Sys, pid: number): number | null {
  const names = sys.readdir(`${KFD_PROC}/${pid}`);
  if (!Array.isArray(names)) return null;
  let total: number | null = null;
  for (const name of names) {
    if (!/^vram_\d+$/.test(name)) continue;
    const value = Number((sys.readFile(`${KFD_PROC}/${pid}/${name}`) ?? '').trim());
    if (Number.isFinite(value)) total = (total ?? 0) + value;
  }
  return total;
}

/** Sum of `stats_<gpu_id>/cu_occupancy` of one PID (instantaneous compute units in use); `null` without a KFD entry. */
export function readCuOccupancy(sys: Sys, pid: number): number | null {
  const names = sys.readdir(`${KFD_PROC}/${pid}`);
  if (!Array.isArray(names)) return null;
  let total: number | null = null;
  for (const name of names) {
    if (!/^stats_\d+$/.test(name)) continue;
    const text = sys.readFile(`${KFD_PROC}/${pid}/${name}/cu_occupancy`);
    const value = text == null ? NaN : Number(text.trim());
    if (Number.isFinite(value)) total = (total ?? 0) + value;
  }
  return total;
}

/** Card busy % below which an occupancy-less card is treated as idle (desktop noise is 3-4 %). */
export const GPU_BUSY_SPLIT_MIN = 10;

export type GpuShareSource = 'occupancy' | 'held' | 'vram' | 'idle';

export interface GpuShareInput {
  /** Card-wide `gpu_busy_percent`. */
  busyPct: number;
  /** Per container: `cu_occupancy` summed over the sampling window (4 Hz, 2 s). */
  occupancy: Record<string, number>;
  /** Last non-zero occupancy shares, still fresh; `null` when none or expired. */
  held: Record<string, number> | null;
  /** Per container VRAM in MiB (the fallback split). */
  vramMiB: Record<string, number>;
}

/**
 * Splits the card-wide busy % between the GPU containers. The result is an attribution, never a
 * measurement: callers always flag it `approx`. Order: compute-unit occupancy share; the last
 * occupancy share while it is fresh (`cu_occupancy` is a spiky snapshot, 0 in most samples of a
 * busy card) and then VRAM share, both only when the card is at least `GPU_BUSY_SPLIT_MIN` % busy;
 * otherwise 0.
 */
export function attributeGpu(input: GpuShareInput): { source: GpuShareSource; pct: Record<string, number> } {
  const names = Object.keys(input.vramMiB);
  const split = (weights: Record<string, number>, source: GpuShareSource) => {
    const sum = names.reduce((total, name) => total + (weights[name] ?? 0), 0);
    const pct: Record<string, number> = {};
    for (const name of names) pct[name] = sum > 0 ? (input.busyPct * (weights[name] ?? 0)) / sum : 0;
    return { source, pct, sum };
  };
  // Below the threshold only live occupancy counts: desktop noise is never pinned on a container.
  const busy = input.busyPct >= GPU_BUSY_SPLIT_MIN;
  const candidates: [Record<string, number> | null, GpuShareSource][] = [
    [input.occupancy, 'occupancy'],
    [busy ? input.held : null, 'held'],
    [busy ? input.vramMiB : null, 'vram'],
  ];
  for (const [weights, source] of candidates) {
    if (!weights) continue;
    const result = split(weights, source);
    if (result.sum > 0) return { source: result.source, pct: result.pct };
  }
  return { source: 'idle', pct: Object.fromEntries(names.map((name) => [name, 0])) };
}

export interface CardInfo {
  device: string;
  vramTotalBytes: number;
}

/** The amdgpu card with the most VRAM (`mem_info_vram_total` of each `cardN/device` directory), or `null`. */
export function findCard(sys: Sys, root = '/sys/class/drm'): CardInfo | null {
  const names = sys.readdir(root);
  if (!Array.isArray(names)) return null;
  let best: CardInfo | null = null;
  for (const name of names) {
    if (!/^card\d+$/.test(name)) continue;
    const device = `${root}/${name}/device`;
    const total = Number((sys.readFile(`${device}/mem_info_vram_total`) ?? '').trim() || NaN);
    if (Number.isFinite(total) && (!best || total > best.vramTotalBytes)) best = { device, vramTotalBytes: total };
  }
  return best;
}

/** `mem_info_vram_used` (bytes) and `gpu_busy_percent` of a card; each `null` when unreadable. */
export function readCard(sys: Sys, card: CardInfo): { vramUsedBytes: number | null; busyPct: number | null } {
  const number = (file: string): number | null => {
    const text = sys.readFile(`${card.device}/${file}`);
    const value = text == null ? NaN : Number(text.trim());
    return Number.isFinite(value) && text!.trim() !== '' ? value : null;
  };
  return { vramUsedBytes: number('mem_info_vram_used'), busyPct: number('gpu_busy_percent') };
}
