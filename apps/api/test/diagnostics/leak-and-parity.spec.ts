import type { DiagnosticsEvent } from '@bricomission/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullDiagnostics } from '../../src/diagnostics/null-diagnostics.js';
import { createKitchenApp, DRAFTS, type KitchenApp } from '../support/kitchen-app.js';
import { runFakeSimulationAndBudget } from './flow.js';

let apps: KitchenApp[] = [];
afterEach(async () => {
  await Promise.all(apps.map((a) => a.app.close()));
  apps = [];
  vi.restoreAllMocks();
});

/** Every string leaf with the key path it sits under. */
function leaves(value: unknown, path = ''): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
  return [];
}
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  return [];
}

describe('redaction across a full fake Simulation and Budget run', () => {
  it('no token, cookie, secret, seed or image bytes in any emitted event', async () => {
    const k = await createKitchenApp({ diagnostics: true });
    apps.push(k);
    // a draft token and a bearer token that the requests carry
    const seeded = await k.seedDraft({ photo: true, measurements: true, moodboard: true });
    const bearer = await k.token();
    await k.claim(bearer, seeded.draftToken);
    const flow = await runFakeSimulationAndBudget(k);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const events: DiagnosticsEvent[] = (k.diagnostics?.replay(0) ?? []).map((e) => e.value);
    expect(events.length).toBeGreaterThan(150);
    const json = JSON.stringify(events);

    expect(json).not.toContain(bearer);
    expect(json).not.toContain(seeded.draftToken);
    expect(json).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./); // JWT shape
    expect(json).not.toMatch(/bearer\s+[A-Za-z0-9._~+/-]{8,}/i);
    expect(json).not.toContain('bm_draft');
    expect(json).not.toContain('bm_session');
    expect(json.toLowerCase()).not.toContain('x-draft-token');
    expect(json).not.toContain('styleSeed');

    // seeds: neither as a key nor as a value of the stored Simulations
    const stored = await k.simulations.listByProject(flow.projectId);
    expect(stored.length).toBeGreaterThan(0);
    for (const simulation of stored) {
      expect(json).not.toContain(`"seed":${simulation.styleSeed}`);
      expect(json).not.toContain(`"${simulation.styleSeed}"`);
      for (const render of simulation.renders) expect(json).not.toContain(`"seed":${render.seed}`);
    }
    expect(keysOf(events.map((e) => e.payload)).filter((key) => !/^(max|prompt|completion)Tokens$/.test(key) && /seed|token|secret|password|cookie|authorization/i.test(key))).toEqual([]);

    // images: only registered thumbnails carry a data URI (under `dataUri`, small); no other long base64 run
    expect(json).not.toContain(k.jpeg.toString('base64').slice(300, 380));
    for (const { path, text } of events.flatMap((e) => leaves(e.payload, `#${e.id}`))) {
      if (text.startsWith('data:')) {
        expect(path.endsWith('.dataUri'), path).toBe(true);
        expect(text.length, path).toBeLessThan(9000);
      } else {
        expect(/[A-Za-z0-9+/]{300,}={0,2}/.test(text), `${path} holds a long base64-like run`).toBe(false);
      }
    }
    // prompts stay verbatim
    expect(json).toContain('BM-SYN-WTP-300');
    expect(DRAFTS).toBeDefined();
  });
});

describe('disabled mode', () => {
  it('runs the same flow with the same results and never calls the diagnostics facade', async () => {
    const emit = vi.spyOn(NullDiagnostics.prototype, 'emit');
    const span = vi.spyOn(NullDiagnostics.prototype, 'span');
    const off = await createKitchenApp({});
    apps.push(off);
    expect(off.diagnostics).toBeUndefined();
    const withoutDiagnostics = await runFakeSimulationAndBudget(off);
    expect(emit).not.toHaveBeenCalled();
    expect(span).not.toHaveBeenCalled();

    const on = await createKitchenApp({ diagnostics: true });
    apps.push(on);
    const withDiagnostics = await runFakeSimulationAndBudget(on);
    expect(on.diagnostics?.hello().newestSeq).toBeGreaterThan(100);

    const shape = (r: typeof withDiagnostics) => ({
      simulation: { status: r.simulation.status, renders: r.simulation.renders.map((x) => x.status) },
      budget: { status: r.budget.status, tiers: r.budget.tiers.map((t) => [t.tier, t.totalCents]) },
    });
    expect(shape(withDiagnostics)).toEqual(shape(withoutDiagnostics));
  });
});
