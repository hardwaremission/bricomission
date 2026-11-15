import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DiagnosticsAgentTopology, DiagnosticsMetricsSample } from '@bricomission/shared-types';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentServer, tokenMatches } from '../src/server.js';

const TOKEN = 'unit-test-token-0123456789';
const topology: DiagnosticsAgentTopology = {
  bootId: 'boot-1',
  project: 'demo',
  intervalMs: 1000,
  capabilities: { cgroupV2: true, amdgpuFdinfo: false, kfdSysfs: false, dockerSocket: true },
  models: [],
};
const sample = (ts: number): DiagnosticsMetricsSample => ({
  ts,
  host: { cpuPct: 1, threads: 32, ramUsedMiB: 2, ramTotalMiB: 3, vramUsedMiB: null, vramTotalMiB: null, gpuBusyPct: null },
  containers: {},
});

describe('agent HTTP server', () => {
  let server: Server | undefined;
  let last: DiagnosticsMetricsSample | null = null;
  const listeners = new Set<(sample: DiagnosticsMetricsSample) => void>();
  const start = async (now = () => 1000): Promise<string> => {
    server = createAgentServer(
      {
        last: () => last,
        topology: () => topology,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      TOKEN,
      { now },
    );
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  };
  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
    server = undefined;
    last = null;
    listeners.clear();
  });

  it('refuses to start with a short token', () => {
    expect(() => createAgentServer({ last: () => null, topology: () => topology, subscribe: () => () => undefined }, 'short')).toThrow('at least 16');
  });

  it('compares the token header in constant time and never accepts an empty or array value', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
    expect(tokenMatches([TOKEN, TOKEN], TOKEN)).toBe(false);
  });

  it('every data route is 401 without the header, with a wrong one and with the token in the query string', async () => {
    const base = await start();
    last = sample(1000);
    for (const path of ['/metrics', '/metrics/stream', '/topology']) {
      expect((await fetch(base + path)).status, path).toBe(401);
      expect((await fetch(base + path, { headers: { 'x-diagnostics-token': 'wrong-token-0123456789' } })).status, path).toBe(401);
      expect((await fetch(`${base}${path}?token=${TOKEN}`)).status, path).toBe(401);
      expect((await fetch(base + path, { headers: { authorization: `Bearer ${TOKEN}` } })).status, path).toBe(401);
    }
    const body = await (await fetch(`${base}/metrics`)).text();
    expect(body).not.toContain(TOKEN);
  });

  it('serves the last sample and the topology with the token; only GET exists', async () => {
    const base = await start();
    const headers = { 'x-diagnostics-token': TOKEN };
    expect((await fetch(`${base}/metrics`, { headers })).status).toBe(503);
    last = sample(1000);
    expect(await (await fetch(`${base}/metrics`, { headers })).json()).toEqual(last);
    expect(await (await fetch(`${base}/topology`, { headers })).json()).toEqual(topology);
    expect((await fetch(`${base}/metrics`, { method: 'POST', headers })).status).toBe(405);
    expect((await fetch(`${base}/metrics`, { method: 'DELETE', headers })).status).toBe(405);
    expect((await fetch(`${base}/other`, { headers })).status).toBe(404);
  });

  it('healthz needs no token, exposes no data and turns 503 when samples stop', async () => {
    let now = 1000;
    const base = await start(() => now);
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
    last = sample(1000);
    const ok = await fetch(`${base}/healthz`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok' });
    now = 7001;
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
  });

  it('streams hello, the last sample and every new sample as SSE', async () => {
    const base = await start();
    last = sample(1000);
    const controller = new AbortController();
    const response = await fetch(`${base}/metrics/stream`, { headers: { 'x-diagnostics-token': TOKEN }, signal: controller.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (marker: string): Promise<void> => {
      while (!text.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        text += decoder.decode(value, { stream: true });
      }
    };
    await readUntil('"ts":1000');
    expect(text.startsWith('retry: 500\n\n')).toBe(true);
    expect(text).toContain(`event: hello\ndata: ${JSON.stringify(topology)}\n\n`);
    expect(text).toContain(`event: metrics\ndata: ${JSON.stringify(sample(1000))}\n\n`);
    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener(sample(2000));
    await readUntil('"ts":2000');
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listeners.size).toBe(0);
  });
});
