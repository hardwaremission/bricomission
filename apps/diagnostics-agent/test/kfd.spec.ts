import { describe, expect, it } from 'vitest';
import { attributeGpu, findCard, readCard, readCuOccupancy, readKfdVramBytes } from '../src/kfd.js';
import { loadRecord, MemSys, records } from './support.js';

describe('KFD sysfs and card files', () => {
  it('reads per-PID kfd VRAM and the card totals of a recorded second', () => {
    const sys = new MemSys();
    const record = records()[0]!;
    loadRecord(sys, record);
    expect(readKfdVramBytes(sys, 1208225)).toBe(4796510208);
    expect(readKfdVramBytes(sys, 1185602)).toBe(0);
    expect(readKfdVramBytes(sys, 42)).toBeNull();
    const card = findCard(sys)!;
    expect(card.vramTotalBytes).toBe(17095983104);
    expect(readCard(sys, card)).toEqual({ vramUsedBytes: 15331475456, busyPct: 37 });
  });

  it('no card and unreadable files give null, never zero', () => {
    const sys = new MemSys();
    expect(findCard(sys)).toBeNull();
    sys.files.set('/sys/class/drm/card0/device/mem_info_vram_total', '100\n');
    const card = findCard(sys)!;
    expect(readCard(sys, card)).toEqual({ vramUsedBytes: null, busyPct: null });
  });

  it('cu_occupancy sums the stats_<gpu> directories of a PID', () => {
    const sys = new MemSys();
    sys.files.set('/sys/class/kfd/kfd/proc/7/stats_18895/cu_occupancy', '56\n');
    sys.files.set('/sys/class/kfd/kfd/proc/7/stats_2/cu_occupancy', '4\n');
    sys.files.set('/sys/class/kfd/kfd/proc/7/vram_18895', '10\n');
    expect(readCuOccupancy(sys, 7)).toBe(60);
    expect(readCuOccupancy(sys, 8)).toBeNull();
  });
});

describe('attributeGpu (approximate split of the card busy %)', () => {
  const vramMiB = { 'llama-server': 4458, comfyui: 8196 };

  it('splits by compute-unit occupancy share', () => {
    const result = attributeGpu({ busyPct: 38, occupancy: { 'llama-server': 112, comfyui: 0 }, held: null, vramMiB });
    expect(result).toEqual({ source: 'occupancy', pct: { 'llama-server': 38, comfyui: 0 } });
    const both = attributeGpu({ busyPct: 80, occupancy: { 'llama-server': 16, comfyui: 48 }, held: null, vramMiB });
    expect(both.pct).toEqual({ 'llama-server': 20, comfyui: 60 });
  });

  it('keeps the last occupancy share while the window reads zero', () => {
    const result = attributeGpu({ busyPct: 40, occupancy: { 'llama-server': 0, comfyui: 0 }, held: { 'llama-server': 1, comfyui: 0 }, vramMiB });
    expect(result).toEqual({ source: 'held', pct: { 'llama-server': 40, comfyui: 0 } });
    // An idle card (desktop noise) is never pinned on the last active container.
    const idle = attributeGpu({ busyPct: 5, occupancy: { 'llama-server': 0, comfyui: 0 }, held: { 'llama-server': 1, comfyui: 0 }, vramMiB });
    expect(idle).toEqual({ source: 'idle', pct: { 'llama-server': 0, comfyui: 0 } });
  });

  it('falls back to VRAM share only when the card is at least 10 % busy', () => {
    const busy = attributeGpu({ busyPct: 50, occupancy: {}, held: null, vramMiB: { a: 3000, b: 1000 } });
    expect(busy).toEqual({ source: 'vram', pct: { a: 37.5, b: 12.5 } });
    const idle = attributeGpu({ busyPct: 4, occupancy: {}, held: null, vramMiB: { a: 3000, b: 1000 } });
    expect(idle).toEqual({ source: 'idle', pct: { a: 0, b: 0 } });
    const noVram = attributeGpu({ busyPct: 90, occupancy: {}, held: null, vramMiB: { a: 0 } });
    expect(noVram).toEqual({ source: 'idle', pct: { a: 0 } });
  });

  it('never attributes more than the card busy %', () => {
    const result = attributeGpu({ busyPct: 99, occupancy: { a: 64, b: 3, c: 1 }, held: null, vramMiB: { a: 1, b: 1, c: 1 } });
    const total = Object.values(result.pct).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(99, 6);
  });
});
