import { describe, expect, it, vi } from 'vitest';
import { FakeImageAdapter } from '../src/ai/adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from '../src/ai/adapters/fake-llm.adapter.js';
import type { ImageRequest } from '../src/ai/adapters/image-adapter.js';
import { GpuJobFailedError, GpuQueueFullError } from '../src/ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../src/ai/jobs/gpu-job-broker.service.js';
import type { GpuBrokerOptions } from '../src/ai/jobs/gpu-broker.options.js';
import { GpuResidencyHook } from '../src/ai/jobs/gpu-residency.hook.js';
import { collectEvents, flush, GateQueue, imageRequest, testOptions } from './gpu-test-helpers.js';

const renderReq = (seed: number): ImageRequest => imageRequest({ seed });
const chatReq = (content: string) => ({ messages: [{ role: 'user' as const, content }] });

function setup(overrides: Partial<GpuBrokerOptions> = {}, hook = new GpuResidencyHook()) {
  const options = testOptions(overrides);
  const imageGates = new GateQueue();
  const llmGates = new GateQueue();
  const image = new FakeImageAdapter({ gate: imageGates.next, echo: true });
  const llm = new FakeLlmAdapter({ gate: llmGates.next });
  const broker = new GpuJobBrokerService(options, hook);
  const submitImage = (seed: number) => broker.submit('image', ({ signal }) => image.render(renderReq(seed), signal));
  const submitLlm = (content: string) => broker.submit('llm', ({ signal }) => llm.complete(chatReq(content), signal));
  return { options, broker, image, llm, imageGates, llmGates, submitImage, submitLlm };
}

describe('GpuJobBrokerService', () => {
  it('two image jobs never overlap', async () => {
    const { broker, image, imageGates, submitImage } = setup();
    const finished: string[] = [];
    const a = submitImage(1);
    const b = submitImage(2);
    a.result.then(() => finished.push(a.jobId));
    b.result.then(() => finished.push(b.jobId));
    await flush();

    expect(broker.get(a.jobId)?.status).toBe('running');
    expect(broker.get(b.jobId)).toMatchObject({ status: 'queued', position: 1, waitingFor: 'image' });
    expect(image.calls).toHaveLength(1);

    imageGates.open(0);
    await flush();
    expect(broker.get(a.jobId)?.status).toBe('done');
    expect(broker.get(b.jobId)?.status).toBe('running');

    imageGates.open(1);
    await flush();
    expect(broker.get(b.jobId)?.status).toBe('done');
    expect(image.maxActive).toBe(1);
    expect(finished).toEqual([a.jobId, b.jobId]);
    expect(image.calls.map((c) => c.seed)).toEqual([1, 2]);
  });

  it('llm submitted during image is queued with waitingFor image, then served', async () => {
    const { broker, llm, imageGates, llmGates, submitImage, submitLlm } = setup();
    const img = submitImage(1);
    await flush();
    const chat = submitLlm('hello');
    await flush();

    expect(broker.get(img.jobId)?.status).toBe('running');
    expect(broker.get(chat.jobId)).toMatchObject({ status: 'queued', position: 1, waitingFor: 'image' });
    expect(llm.calls).toHaveLength(0);

    imageGates.open(0);
    await flush();
    expect(broker.get(img.jobId)?.status).toBe('done');
    expect(broker.get(chat.jobId)?.status).toBe('running');
    expect(llm.calls).toHaveLength(1);

    llmGates.open(0);
    const expected = await new FakeLlmAdapter().complete(chatReq('hello'), new AbortController().signal);
    await expect(chat.result).resolves.toEqual(expected);
    expect(broker.get(chat.jobId)?.status).toBe('done');
  });

  it('queued image blocks later llm (FIFO)', async () => {
    const { broker, image, llm, imageGates, llmGates, submitImage, submitLlm } = setup({ llmConcurrency: 2 });
    const chat1 = submitLlm('one');
    await flush();
    const img = submitImage(1);
    const chat2 = submitLlm('two');
    await flush();

    // A free LLM slot exists, but the image at the head blocks chat2 (no look-ahead).
    expect(broker.get(chat1.jobId)?.status).toBe('running');
    expect(broker.get(img.jobId)).toMatchObject({ status: 'queued', position: 1, waitingFor: 'llm' });
    expect(broker.get(chat2.jobId)).toMatchObject({ status: 'queued', position: 2, waitingFor: 'image' });
    expect(llm.calls).toHaveLength(1);

    llmGates.open(0);
    await flush();
    expect(broker.get(img.jobId)?.status).toBe('running');
    expect(broker.get(chat2.jobId)).toMatchObject({ status: 'queued', position: 1, waitingFor: 'image' });

    imageGates.open(0);
    await flush();
    expect(broker.get(chat2.jobId)?.status).toBe('running');
    llmGates.open(1);
    await flush();
    expect(broker.get(chat2.jobId)?.status).toBe('done');
    expect(image.maxActive).toBe(1);
  });

  it('llm concurrency 2 runs two llm jobs together but never with image', async () => {
    const { broker, image, llm, imageGates, llmGates, submitImage, submitLlm } = setup({ llmConcurrency: 2 });
    let overlap = false;
    const check = () => {
      if (image.active > 0 && llm.active > 0) overlap = true;
    };
    const c1 = submitLlm('a');
    const c2 = submitLlm('b');
    const c3 = submitLlm('c');
    const img = submitImage(1);
    await flush();
    check();
    expect(broker.get(c1.jobId)?.status).toBe('running');
    expect(broker.get(c2.jobId)?.status).toBe('running');
    expect(broker.get(c3.jobId)).toMatchObject({ status: 'queued', position: 1, waitingFor: 'llm' });
    expect(llm.active).toBe(2);

    llmGates.open(0);
    await flush();
    check();
    expect(broker.get(c3.jobId)?.status).toBe('running');
    expect(broker.get(img.jobId)?.status).toBe('queued');

    llmGates.open(1);
    await flush();
    check();
    expect(broker.get(img.jobId)?.status).toBe('queued');
    llmGates.open(2);
    await flush();
    check();
    expect(broker.get(img.jobId)?.status).toBe('running');
    imageGates.open(0);
    await flush();
    expect(broker.get(img.jobId)?.status).toBe('done');
    expect(llm.maxActive).toBe(2);
    expect(overlap).toBe(false);
  });

  it('adapter error -> failed adapter_error, next job starts', async () => {
    const { broker, imageGates, submitImage } = setup();
    const warn = vi.spyOn((broker as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    const bad = broker.submit('image', async () => {
      throw new Error('ECONNREFUSED http://comfyui:8188/prompt secret-body');
    });
    const next = submitImage(2);
    await expect(bad.result).rejects.toEqual(expect.objectContaining({ name: 'GpuJobFailedError', code: 'adapter_error' }));
    await expect(bad.result).rejects.toBeInstanceOf(GpuJobFailedError);
    await flush();
    expect(broker.get(bad.jobId)).toMatchObject({ status: 'failed', errorCode: 'adapter_error' });
    expect(JSON.stringify(broker.get(bad.jobId))).not.toMatch(/comfyui|secret|ECONNREFUSED/);
    expect(broker.get(next.jobId)?.status).toBe('running');
    const logged = warn.mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('(Error)');
    expect(logged).not.toMatch(/comfyui|secret|ECONNREFUSED/);
    imageGates.open(0);
    await expect(next.result).resolves.toBeDefined();
  });

  it('timeout aborts signal -> failed timeout, slot freed, late settle ignored', async () => {
    const { broker, submitImage, imageGates } = setup({ imageTimeoutMs: 10 });
    let seenSignal: AbortSignal | undefined;
    let settleLate!: (v: string) => void;
    const slow = broker.submit('image', ({ signal }) => {
      seenSignal = signal;
      // Ignores the abort on purpose and settles late.
      return new Promise<string>((resolve) => {
        settleLate = resolve;
      });
    });
    const next = submitImage(2);
    await expect(slow.result).rejects.toMatchObject({ code: 'timeout' });
    expect(seenSignal?.aborted).toBe(true);
    expect(broker.get(slow.jobId)).toMatchObject({ status: 'failed', errorCode: 'timeout' });
    await flush();
    expect(broker.get(next.jobId)?.status).toBe('running');

    settleLate('late');
    await flush();
    expect(broker.get(slow.jobId)).toMatchObject({ status: 'failed', errorCode: 'timeout' });
    const events = await collectEvents(broker, slow.jobId);
    expect(events.filter((e) => e.status === 'done' || e.status === 'failed')).toHaveLength(1);
    imageGates.open(0);
    await next.result;
  });

  it('timeout aborts a fake adapter through its signal', async () => {
    const { broker, llm } = setup({ llmTimeoutMs: 5 });
    const chat = broker.submit('llm', ({ signal }) => llm.complete(chatReq('x'), signal));
    await expect(chat.result).rejects.toMatchObject({ code: 'timeout' });
    await flush();
    expect(llm.active).toBe(0);
  });

  it('queue full throws', async () => {
    const { broker, submitImage } = setup({ maxQueued: 2 });
    submitImage(1); // running
    submitImage(2); // queued 1
    const third = submitImage(3); // queued 2
    await flush();
    expect(broker.get(third.jobId)).toMatchObject({ status: 'queued', position: 2 });
    expect(() => submitImage(4)).toThrow(GpuQueueFullError);
  });

  it('retention evicts finished jobs', async () => {
    const { broker, options, imageGates, submitImage } = setup({ retentionMs: 1000 });
    const job = submitImage(1);
    await flush();
    imageGates.open(0);
    await job.result;
    options.clock.t += 999;
    broker.prune();
    expect(broker.get(job.jobId)?.status).toBe('done');
    options.clock.t += 1;
    submitImage(2); // submit prunes too
    expect(broker.get(job.jobId)).toBeUndefined();
    expect(broker.events(job.jobId)).toBeUndefined();
  });

  it('events have strictly increasing seq and end with one terminal event', async () => {
    const { broker, imageGates, llmGates, submitImage, submitLlm } = setup();
    submitImage(1);
    submitImage(2);
    const chat = submitLlm('hi');
    const live = collectEvents(broker, chat.jobId);
    await flush();
    imageGates.open(0);
    await flush();
    imageGates.open(1);
    await flush();
    llmGates.open(0);
    const events = await live;

    expect(events.map((e) => e.status)).toEqual(['queued', 'queued', 'running', 'done']);
    expect(events[0]).toMatchObject({ position: 2, waitingFor: 'image' });
    expect(events[1]).toMatchObject({ position: 1, waitingFor: 'image' });
    events.forEach((e, i) => {
      expect(e.seq).toBe(i + 1);
      expect(e.jobId).toBe(chat.jobId);
    });
    expect(events.filter((e) => e.status === 'done' || e.status === 'failed')).toHaveLength(1);

    // Late subscribers get the replay; afterSeq skips earlier events.
    expect(await collectEvents(broker, chat.jobId)).toEqual(events);
    expect((await collectEvents(broker, chat.jobId, 2)).map((e) => e.seq)).toEqual([3, 4]);
  });

  it('residency hook wraps every image job and holds the GPU until afterImage resolves', async () => {
    const calls: string[] = [];
    let releaseAfter!: () => void;
    const hook = new GpuResidencyHook();
    hook.beforeImage = async () => {
      calls.push('before');
    };
    hook.afterImage = () =>
      new Promise<void>((resolve) => {
        calls.push('after');
        releaseAfter = resolve;
      });
    const { broker, llm, imageGates, submitImage, submitLlm } = setup({}, hook);
    submitImage(1);
    const chat = submitLlm('x');
    await flush();
    expect(calls).toEqual(['before']);
    imageGates.open(0);
    await flush();
    expect(calls).toEqual(['before', 'after']);
    expect(broker.get(chat.jobId)?.status).toBe('queued');
    expect(llm.calls).toHaveLength(0);
    releaseAfter();
    await flush();
    expect(broker.get(chat.jobId)?.status).toBe('running');
  });
});
