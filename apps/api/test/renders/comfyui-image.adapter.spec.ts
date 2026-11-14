import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AiBackendError } from '../../src/ai/adapters/ai-backend.error.js';
import { ComfyUiImageAdapter } from '../../src/ai/adapters/comfyui-image.adapter.js';
import { buildRenderWorkflow } from '../../src/ai/adapters/comfyui-workflow.js';
import { DEFAULT_RENDER_CONTROL } from '../../src/ai/adapters/image-adapter.js';
import { imageRequest, TINY_JPEG } from '../gpu-test-helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a-fake-png-bytes');

interface Seen {
  method: string;
  url: string;
  body: Buffer;
}

/** A node:http stub of the ComfyUI API. `historyPolls` pending answers before completion. */
async function stub(options: { promptStatus?: number; historyError?: boolean; neverComplete?: boolean; historyPolls?: number } = {}) {
  const seen: Seen[] = [];
  let polls = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method ?? '', url: req.url ?? '', body });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (req.url === '/upload/image') return json(200, { name: 'bm-uploaded.jpg', subfolder: '', type: 'input' });
      if (req.url === '/prompt') {
        if (options.promptStatus) return json(options.promptStatus, { error: 'secret-node-error prompt text' });
        return json(200, { prompt_id: 'p-1', number: 1, node_errors: {} });
      }
      if (req.url === '/history/p-1') {
        polls++;
        if (options.neverComplete || polls <= (options.historyPolls ?? 1)) return json(200, {});
        if (options.historyError) return json(200, { 'p-1': { status: { status_str: 'error', completed: false, messages: [['execution_error', { exception_message: 'secret' }]] }, outputs: {} } });
        return json(200, { 'p-1': { status: { status_str: 'success', completed: true }, outputs: { '12': { images: [{ filename: 'ComfyUI_temp_0001.png', subfolder: '', type: 'temp' }] } } } });
      }
      if (req.url?.startsWith('/view?')) {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      if (req.url === '/interrupt') return json(200, {});
      json(404, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const adapter = new ComfyUiImageAdapter({ get: () => ({ llmBaseUrl: 'http://unused', comfyuiBaseUrl: `${base}/` }) }, { pollMs: 5 });
  return { server, seen, base, adapter };
}

/** Closes the stub, dropping fetch's keep-alive connections. */
function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('ComfyUiImageAdapter (node:http stub)', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await close(server);
    server = undefined;
  });

  it('uploads the input under a random bm-<uuid>.jpg name, queues the workflow, polls the history and downloads the temp output', async () => {
    const s = await stub({ historyPolls: 2 });
    server = s.server;
    const req = imageRequest({ mode: 'canny', width: 1216, height: 832, prompt: 'photorealistic renovated x', negativePrompt: 'blurry', seed: 12345 });
    const result = await s.adapter.render(req, new AbortController().signal);
    expect(result.image.equals(PNG)).toBe(true);
    expect(result.seconds).toBeGreaterThanOrEqual(0);

    const upload = s.seen.find((r) => r.url === '/upload/image');
    const text = upload!.body.toString('latin1');
    expect(text).toMatch(/filename="bm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg"/);
    expect(upload!.body.includes(TINY_JPEG)).toBe(true);

    const queued = JSON.parse(s.seen.find((r) => r.url === '/prompt')!.body.toString()) as { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>; client_id: string };
    expect(queued.client_id).toMatch(/^[0-9a-f-]{36}$/);
    const wf = queued.prompt;
    expect(wf['4'].inputs.image).toBe('bm-uploaded.jpg');
    expect(wf['2'].inputs.text).toBe('photorealistic renovated x');
    expect(wf['3'].inputs.text).toBe('blurry');
    // Tuned defaults (2026-11-15): canny 0.6/0.95 at 0.8 for the first half, depth assist 0.7 for the whole run.
    expect(wf['6']).toEqual({ class_type: 'Canny', inputs: { image: ['5', 0], low_threshold: 0.6, high_threshold: 0.95 } });
    expect(wf['7'].inputs.control_net_name).toBe('sdxl-canny.safetensors');
    expect(wf['8'].inputs).toMatchObject({ strength: 0.8, start_percent: 0, end_percent: 0.5, image: ['6', 0] });
    expect(wf['13']).toEqual({ class_type: 'DepthAnythingV2Preprocessor', inputs: { image: ['5', 0], ckpt_name: 'depth_anything_v2_vits.pth', resolution: 1024 } });
    expect(wf['14'].inputs.control_net_name).toBe('sdxl-depth.safetensors');
    expect(wf['15'].inputs).toMatchObject({ positive: ['8', 0], negative: ['8', 1], control_net: ['14', 0], image: ['13', 0], strength: 0.7, end_percent: 1 });
    expect(wf['10'].inputs).toMatchObject({ positive: ['15', 0], negative: ['15', 1] });
    expect(wf['9'].inputs).toMatchObject({ width: 1216, height: 832 });
    expect(wf['5'].inputs).toMatchObject({ width: 1216, height: 832 });
    expect(wf['10'].inputs).toMatchObject({ seed: 12345, steps: 25, cfg: 6, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1 });
    expect(wf['12']).toEqual({ class_type: 'PreviewImage', inputs: { images: ['11', 0] } });
    expect(Object.values(wf).some((node) => node.class_type === 'SaveImage')).toBe(false);
    expect(s.seen.filter((r) => r.url === '/history/p-1')).toHaveLength(3);
    expect(s.seen.find((r) => r.url.startsWith('/view?'))!.url).toBe('/view?filename=ComfyUI_temp_0001.png&subfolder=&type=temp');
    expect(s.seen.some((r) => r.url === '/interrupt')).toBe(false);
  });

  it('uploads every style reference and queues the IP-Adapter encoders at their weights (blend modes ip_adapter and both)', async () => {
    const s = await stub({ historyPolls: 0 });
    server = s.server;
    const refA = Buffer.from('ref-a-bytes');
    const refB = Buffer.from('ref-b-bytes');
    await s.adapter.render(imageRequest({ mode: 'canny', references: [{ image: refA, weight: 0.3 }, { image: refB, weight: 0.9 }] }), new AbortController().signal);
    const uploads = s.seen.filter((r) => r.url === '/upload/image');
    expect(uploads).toHaveLength(3); // the photo and two references
    expect(uploads[1]!.body.includes(refA)).toBe(true);
    expect(uploads[2]!.body.includes(refB)).toBe(true);
    for (const upload of uploads) expect(upload.body.toString('latin1')).toMatch(/filename="bm-[0-9a-f-]{36}\.jpg"/);
    const wf = (JSON.parse(s.seen.find((r) => r.url === '/prompt')!.body.toString()) as { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> }).prompt;
    expect(wf['400'].inputs).toMatchObject({ weight: 0.3 });
    expect(wf['401'].inputs).toMatchObject({ weight: 0.9 });
    expect(wf['10'].inputs.model).toEqual(['60', 0]);
    // Without references nothing changes: one upload, no IP-Adapter node.
    s.seen.length = 0;
    await s.adapter.render(imageRequest({ mode: 'canny' }), new AbortController().signal);
    expect(s.seen.filter((r) => r.url === '/upload/image')).toHaveLength(1);
    expect(JSON.parse(s.seen.find((r) => r.url === '/prompt')!.body.toString()).prompt['60']).toBeUndefined();
  });

  it('control values come from the request; no depth assist means the sampler reads the canny ControlNet', () => {
    const control = { strength: 0.9, endPercent: 0.75, cannyLow: 0.4, cannyHigh: 0.8, depthAssist: null };
    const wf = buildRenderWorkflow({ mode: 'canny', inputImage: 'i.jpg', width: 1216, height: 832, prompt: 'p', negativePrompt: 'n', seed: 1, control });
    expect(wf['6'].inputs).toMatchObject({ low_threshold: 0.4, high_threshold: 0.8 });
    expect(wf['8'].inputs).toMatchObject({ strength: 0.9, end_percent: 0.75 });
    expect(wf['10'].inputs).toMatchObject({ positive: ['8', 0], negative: ['8', 1] });
    expect(Object.keys(wf).sort()).toEqual(['1', '10', '11', '12', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('depth mode uses Depth Anything V2 Small at 1024 and the depth ControlNet, never a depth assist', () => {
    const wf = buildRenderWorkflow({ mode: 'depth', inputImage: 'i.jpg', width: 832, height: 1216, prompt: 'p', negativePrompt: 'n', seed: 1, control: DEFAULT_RENDER_CONTROL });
    expect(wf['13']).toBeUndefined();
    expect(wf['10'].inputs).toMatchObject({ positive: ['8', 0] });
    expect(wf['6']).toEqual({ class_type: 'DepthAnythingV2Preprocessor', inputs: { image: ['5', 0], ckpt_name: 'depth_anything_v2_vits.pth', resolution: 1024 } });
    expect(wf['7'].inputs.control_net_name).toBe('sdxl-depth.safetensors');
    expect(wf['1'].inputs.ckpt_name).toBe('RealVisXL_V5.0_fp16.safetensors');
  });

  it('a non-2xx answer or an execution error throws AiBackendError without the URL or the body', async () => {
    for (const options of [{ promptStatus: 400 }, { historyError: true }]) {
      const s = await stub(options);
      server = s.server;
      const error = await s.adapter.render(imageRequest(), new AbortController().signal).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiBackendError);
      expect(String((error as Error).message)).not.toMatch(/secret|127\.0\.0\.1|prompt text/);
      await close(s.server);
      server = undefined;
    }
  });

  it('abort (broker timeout) rejects with AbortError and sends POST /interrupt', async () => {
    const s = await stub({ neverComplete: true });
    server = s.server;
    const controller = new AbortController();
    const pending = s.adapter.render(imageRequest(), controller.signal);
    while (!s.seen.some((r) => r.url === '/history/p-1')) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    for (let i = 0; i < 100 && !s.seen.some((r) => r.url === '/interrupt'); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(s.seen.some((r) => r.method === 'POST' && r.url === '/interrupt')).toBe(true);
  });

  it('reads the endpoint per call (hot swap)', async () => {
    const a = await stub();
    const b = await stub();
    let current = a.base;
    const adapter = new ComfyUiImageAdapter({ get: () => ({ llmBaseUrl: 'x', comfyuiBaseUrl: current }) }, { pollMs: 5 });
    await adapter.render(imageRequest(), new AbortController().signal);
    current = b.base;
    await adapter.render(imageRequest(), new AbortController().signal);
    expect(a.seen.filter((r) => r.url === '/prompt')).toHaveLength(1);
    expect(b.seen.filter((r) => r.url === '/prompt')).toHaveLength(1);
    await close(a.server);
    await close(b.server);
  });
});
