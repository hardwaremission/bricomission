import type { DiagnosticsContainerMetrics, DiagnosticsHostMetrics } from '@bricomission/shared-types';
import { describe, expect, it } from 'vitest';
import { AGENT_STALE_MS, agentUp, aiChip, containerTiles, formatMem, formatPct, hostTiles } from '../src/lib/state/metrics-state.ts';

const host: DiagnosticsHostMetrics = { cpuPct: 23.4, threads: 32, ramUsedMiB: 32154, ramTotalMiB: 64204, vramUsedMiB: 12595, vramTotalMiB: 16304, gpuBusyPct: 87 };
const container = (over: Partial<DiagnosticsContainerMetrics> = {}): DiagnosticsContainerMetrics => ({ state: 'running', cpuPct: 41.2, cores: 13.2, ramMiB: 5734, vramMiB: 12595, gpuPct: 87, approx: true, ...over });

describe('widget variant formatting', () => {
  it('formats percentages and memory as the design prints them', () => {
    expect(formatPct(0.4)).toBe('0%');
    expect(formatPct(86.6)).toBe('87%');
    expect(formatPct(61.7, true)).toBe('~62%');
    expect(formatMem(180)).toBe('180 MB');
    expect(formatMem(999.6)).toBe('1.0 GB');
    expect(formatMem(5734)).toBe('5.6 GB');
    expect(formatMem(0)).toBe('0 MB');
  });

  it('normal: exact CPU, RAM and VRAM, bars relative to the host totals', () => {
    const tiles = containerTiles(container({ gpuPct: 30, vramMiB: 4198 }), host, true);
    expect(tiles.map((t) => t.text)).toEqual(['41%', '5.6 GB', '4.1 GB', '~30%']);
    expect(tiles.map((t) => t.tone)).toEqual(['normal', 'normal', 'normal', 'normal']);
    expect(tiles[1].fill).toBeCloseTo(5734 / 64204, 4);
    expect(tiles[2].fill).toBeCloseTo(4198 / 16304, 4);
  });

  it('approx: AI GPU % carries the ~ prefix and the APPROX tag; an exact value has neither', () => {
    expect(containerTiles(container(), host, true)[3]).toMatchObject({ text: '~87%', tag: 'APPROX' });
    const exact = container({ gpuPct: 12 });
    delete exact.approx;
    expect(containerTiles(exact, host, true)[3]).toMatchObject({ text: '12%', tag: null });
  });

  it('90 percent or more: the tile turns red', () => {
    const tiles = containerTiles(container({ cpuPct: 95, vramMiB: 16179, gpuPct: 90 }), host, true);
    expect(tiles[0].tone).toBe('high');
    expect(tiles[2]).toMatchObject({ text: '15.8 GB', tone: 'high' });
    expect(tiles[3].tone).toBe('high');
    expect(containerTiles(container({ gpuPct: 89 }), host, true)[3].tone).toBe('normal');
  });

  it('n/a: null is "not measurable", never a number, with an empty bar', () => {
    const tiles = containerTiles(container({ vramMiB: null, gpuPct: null }), host, true);
    expect(tiles[2]).toMatchObject({ text: 'n/a', tone: 'na', fill: 0, tag: null });
    expect(tiles[3]).toMatchObject({ text: 'n/a', tone: 'na', fill: 0, tag: null });
    expect(containerTiles(container({ vramMiB: 0, gpuPct: 0 }), host, true).map((t) => t.text).slice(2)).toEqual(['0 MB', '~0%']);
  });

  it('no agent: every tile is a dash with the NO AGENT tag', () => {
    const tiles = containerTiles(container(), host, false);
    expect(tiles.map((t) => t.text)).toEqual(['—', '—', '—', '—']);
    expect(tiles.every((t) => t.tone === 'noagent' && t.tag === 'NO AGENT' && t.fill === 0)).toBe(true);
  });

  it('a service the agent does not report is n/a while the agent is up', () => {
    expect(containerTiles(undefined, host, true).map((t) => t.text)).toEqual(['n/a', 'n/a', 'n/a', 'n/a']);
  });

  it('host strip: exact totals, GB pairs, n/a for a missing GPU and dashes without the agent', () => {
    expect(hostTiles(host, true).map((t) => t.text)).toEqual(['23%', '31.4 / 63 GB', '12.3 / 16 GB', '87%']);
    expect(hostTiles({ ...host, vramUsedMiB: null, vramTotalMiB: null, gpuBusyPct: null }, true).map((t) => t.text)).toEqual(['23%', '31.4 / 63 GB', 'n/a', 'n/a']);
    expect(hostTiles(host, false).map((t) => t.text)).toEqual(['—', '—', '—', '—']);
    expect(hostTiles(null, true).map((t) => t.tone)).toEqual(['na', 'na', 'na', 'na']);
    expect(hostTiles({ ...host, cpuPct: 96 }, true)[0].tone).toBe('high');
  });

  it('treats the agent as gone after 5 s without a sample', () => {
    expect(agentUp({ sample: null, receivedAt: null }, 10)).toBe(false);
    expect(agentUp({ sample: null, receivedAt: 1000 }, 1000 + AGENT_STALE_MS - 1)).toBe(true);
    expect(agentUp({ sample: null, receivedAt: 1000 }, 1000 + AGENT_STALE_MS)).toBe(false);
  });

  it('derives the AI state chip from measured values only', () => {
    expect(aiChip('llama-server', 'offline', null, true)).toBe('OFFLINE');
    expect(aiChip('comfyui', 'error', container(), true)).toBe('ERROR');
    expect(aiChip('comfyui', 'working', container(), true)).toBe('BUSY');
    expect(aiChip('llama-server', 'idle', container({ vramMiB: 4292 }), true)).toBe('LOADED');
    expect(aiChip('llama-server', 'recent', container({ vramMiB: 140 }), true)).toBe('UNLOADED');
    expect(aiChip('comfyui', 'idle', container({ vramMiB: 8100 }), true)).toBe('WARM');
    expect(aiChip('llama-server', 'idle', container({ vramMiB: null }), true)).toBeNull();
    expect(aiChip('llama-server', 'idle', container(), false)).toBeNull();
    expect(aiChip('embedder', 'idle', container(), true)).toBeNull();
  });
});
