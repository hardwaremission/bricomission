import type { DiagnosticsEvent } from '@bricomission/shared-types';
import { afterEach, describe, expect, it } from 'vitest';
import { createKitchenApp, type KitchenApp } from '../support/kitchen-app.js';
import { runFakeSimulationAndBudget } from './flow.js';

let k: KitchenApp | undefined;
afterEach(async () => {
  await k?.app.close();
  k = undefined;
});

function eventsOf(app: KitchenApp): DiagnosticsEvent[] {
  return (app.diagnostics?.replay(0) ?? []).map((entry) => entry.value);
}

const has = (events: DiagnosticsEvent[], from: string, to: string, kind: string) => events.some((e) => e.from === from && e.to === to && e.kind === kind);

describe('diagnostics demo path (fake adapters, kitchen test app)', () => {
  it('emits every applicable Event Catalog row with a correlation id, simulated AI hops, real prompts and thumbnails', async () => {
    k = await createKitchenApp({ diagnostics: true });
    await runFakeSimulationAndBudget(k);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const events = eventsOf(k);
    const rows: Array<[string, string, string]> = [
      ['api-guards', 'project-service', 'guard'],
      ['api-guards', 'simulation-runner', 'guard'],
      ['api-guards', 'budget-engine', 'guard'],
      ['image-pipeline', 'storage-client', 'object'],
      ['storage-client', 'minio', 'object'],
      ['simulation-runner', 'style-engine', 'compute'],
      ['style-engine', 'simulation-runner', 'compute'],
      ['simulation-runner', 'simulation-runner', 'step'],
      ['simulation-runner', 'gpu-broker', 'queue'],
      ['gpu-broker', 'ai-adapters', 'queue'],
      ['gpu-broker', 'residency-hook', 'residency'],
      ['residency-hook', 'llama-server', 'http'],
      ['ai-adapters', 'llama-server', 'llm'],
      ['ai-adapters', 'comfyui', 'image'],
      ['budget-engine', 'catalog-search', 'step'],
      ['catalog-search', 'budget-engine', 'step'],
      ['budget-engine', 'gpu-broker', 'queue'],
      ['budget-engine', 'budget-math', 'compute'],
      ['budget-math', 'budget-engine', 'compute'],
      ['llama-server', 'llama-server', 'step'],
    ];
    for (const [from, to, kind] of rows) expect(has(events, from, to, kind), `${from} > ${to} (${kind})`).toBe(true);

    // sequence order and a correlation id everywhere
    expect(events.map((e) => Number(e.id))).toEqual([...events.map((e) => Number(e.id))].sort((a, b) => a - b));
    for (const e of events) expect(e.correlationId).toMatch(/^[0-9a-f]{16}$|^system$/);

    // fake adapters: the llama-server and comfyui hops are simulated
    for (const e of events.filter((x) => x.to === 'llama-server' || x.to === 'comfyui' || x.from === 'comfyui')) expect(e.simulated, `${e.from}>${e.to} ${e.summary}`).toBe(true);

    // one correlation id per request: the Simulation POST thread reaches the adapters
    const simStart = events.find((e) => e.from === 'api-guards' && e.to === 'simulation-runner' && e.span?.phase === 'start' && e.summary.startsWith('POST '));
    expect(simStart).toBeDefined();
    const thread = events.filter((e) => e.correlationId === simStart?.correlationId);
    expect(thread.some((e) => e.to === 'comfyui')).toBe(true);
    expect(thread.some((e) => e.to === 'llama-server' && e.kind === 'llm')).toBe(true);
    const budgetStart = events.find((e) => e.to === 'budget-engine' && e.from === 'api-guards' && e.span?.phase === 'start' && e.summary.startsWith('POST '));
    const budgetThread = events.filter((e) => e.correlationId === budgetStart?.correlationId);
    expect(budgetThread.some((e) => e.from === 'budget-engine' && e.to === 'budget-math')).toBe(true);
    expect(budgetThread.some((e) => e.kind === 'llm' && JSON.stringify(e.payload).includes('"task":"budget"'))).toBe(true);

    // the real prompts: budget prompt carries the catalog lines, the ComfyUI request the style text
    const budgetLlm = events.find((e) => e.kind === 'llm' && e.span?.phase === 'start' && JSON.stringify(e.payload).includes('"task":"budget"'));
    expect(JSON.stringify(budgetLlm?.payload)).toContain('BM-SYN-WTP-300');
    const comfy = events.find((e) => e.to === 'comfyui' && e.span?.phase === 'start');
    const comfyPayload = comfy?.payload as { positivePrompt?: string; negativePrompt?: string; controlNet?: { mode?: string }; references?: unknown[] };
    expect(typeof comfyPayload.positivePrompt).toBe('string');
    expect((comfyPayload.positivePrompt ?? '').length).toBeGreaterThan(20);
    expect(comfyPayload.negativePrompt).toBeTruthy();
    expect(comfyPayload.controlNet?.mode).toBeDefined();
    expect(comfyPayload.references?.length).toBe(2);

    // thumbnails present
    expect(events.some((e) => JSON.stringify(e.payload).includes('data:image/jpeg;base64,'))).toBe(true);

    // verify-and-compute shows accepted items and ordered tiers; end events repeat from/to and carry ok
    const verify = events.find((e) => e.to === 'budget-math');
    expect(verify?.payload).toMatchObject({ isStrictlyOrdered: true });
    for (const e of events.filter((x) => x.span?.phase === 'end')) expect(e.durationMs).toBeTypeOf('number');
  });
});
