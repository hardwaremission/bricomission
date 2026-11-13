import { describe, expect, it } from 'vitest';
import { FakeImageAdapter } from '../src/ai/adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from '../src/ai/adapters/fake-llm.adapter.js';
import { Gate } from './gpu-test-helpers.js';

const signal = () => new AbortController().signal;

describe('fake AI adapters', () => {
  it('FakeLlmAdapter is deterministic (same input, same output)', async () => {
    const req = { messages: [{ role: 'user' as const, content: 'Budget a kitchen' }], maxTokens: 10 };
    const a = await new FakeLlmAdapter().complete(req, signal());
    const b = await new FakeLlmAdapter().complete(structuredClone(req), signal());
    expect(a).toEqual(b);
    expect(a.text).toMatch(/^fake:[0-9a-f]{16}$/);
    const other = await new FakeLlmAdapter().complete({ ...req, maxTokens: 11 }, signal());
    expect(other.text).not.toBe(a.text);
  });

  it('FakeImageAdapter is deterministic (same input, same output)', async () => {
    const req = { mode: 'depth' as const, sourceImageKey: 'photos/1.jpg', prompt: 'oak', seed: 7 };
    const a = await new FakeImageAdapter().render(req, signal());
    const b = await new FakeImageAdapter().render({ ...req }, signal());
    expect(a).toEqual(b);
    expect(a.imageKey).toMatch(/^fake\/[0-9a-f]{16}\.png$/);
    expect((await new FakeImageAdapter().render({ ...req, seed: 8 }, signal())).imageKey).not.toBe(a.imageKey);
  });

  it('fakes track concurrent calls and record requests', async () => {
    const gate = new Gate();
    const fake = new FakeImageAdapter({ gate: gate.wait });
    const req = { mode: 'canny' as const, sourceImageKey: 'k', prompt: 'p', seed: 1 };
    const p1 = fake.render(req, signal());
    const p2 = fake.render(req, signal());
    expect(fake.active).toBe(2);
    expect(fake.maxActive).toBe(2);
    gate.open();
    await Promise.all([p1, p2]);
    expect(fake.active).toBe(0);
    expect(fake.calls).toHaveLength(2);
  });

  it('fakes honor the abort signal', async () => {
    const controller = new AbortController();
    const fake = new FakeLlmAdapter({ gate: new Gate().wait });
    const pending = fake.complete({ messages: [{ role: 'user', content: 'x' }] }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.active).toBe(0);

    const already = new AbortController();
    already.abort();
    await expect(new FakeImageAdapter().render({ mode: 'depth', sourceImageKey: 'k', prompt: 'p', seed: 1 }, already.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
