import { describe, expect, it } from 'vitest';
import { FakeImageAdapter } from '../src/ai/adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from '../src/ai/adapters/fake-llm.adapter.js';
import sharp from 'sharp';
import { Gate, imageRequest, TINY_JPEG } from './gpu-test-helpers.js';

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

  it('FakeImageAdapter is a deterministic, visible transform of the input (same input, same PNG of the request size)', async () => {
    const req = imageRequest({ seed: 7 });
    const a = await new FakeImageAdapter().render(req, signal());
    const b = await new FakeImageAdapter().render({ ...req }, signal());
    expect(a.image.equals(b.image)).toBe(true);
    const meta = await sharp(a.image).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 160, height: 120 });
    // The border is the tint colour: the output differs visibly from the input.
    const { data } = await sharp(a.image).raw().toBuffer({ resolveWithObject: true });
    [41, 104, 236].forEach((channel, i) => expect(Math.abs((data[i] ?? 0) - channel)).toBeLessThanOrEqual(2));
    const other = await new FakeImageAdapter().render(imageRequest({ image: await sharp(TINY_JPEG).negate().jpeg().toBuffer() }), signal());
    expect(other.image.equals(a.image)).toBe(false);
  });

  it('fakes track concurrent calls and record requests', async () => {
    const gate = new Gate();
    const fake = new FakeImageAdapter({ gate: gate.wait });
    const req = imageRequest({ mode: 'canny' });
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
    await expect(new FakeImageAdapter().render(imageRequest(), already.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
