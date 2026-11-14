import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiBackendError } from '../src/ai/adapters/ai-backend.error.js';
import { LlamaServerLlmAdapter } from '../src/ai/adapters/llama-server-llm.adapter.js';
import { EnvAiEndpointsProvider } from '../src/ai/ai-endpoints.provider.js';

interface Captured {
  url: string | undefined;
  method: string | undefined;
  body: Record<string, unknown>;
}

// Local stub on an ephemeral 127.0.0.1 port: no network, no GPU.
describe('LlamaServerLlmAdapter', () => {
  let server: Server;
  let baseUrl: string;
  let captured: Captured[] = [];
  let reply: { status: number; body: string } = { status: 200, body: '{}' };

  beforeAll(async () => {
    server = createServer(async (req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      captured.push({ url: req.url, method: req.method, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(reply.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const adapter = () => new LlamaServerLlmAdapter(new EnvAiEndpointsProvider({ LLM_BASE_URL: `${baseUrl}/` }));

  it('sends json_schema response_format and maps text and usage', async () => {
    captured = [];
    reply = {
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    };
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    const result = await adapter().complete(
      { messages: [{ role: 'user', content: 'Say OK' }], jsonSchema: schema, maxTokens: 32 },
      new AbortController().signal,
    );
    expect(result).toEqual({ text: '{"ok":true}', promptTokens: 12, completionTokens: 4 });
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].url).toBe('/v1/chat/completions');
    expect(captured[0].body).toMatchObject({
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 32,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } },
    });
  });

  it('router mode: every request names the model (default qwen3-vl, LLM_MODEL override)', async () => {
    captured = [];
    reply = { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) };
    await adapter().complete({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal);
    await new LlamaServerLlmAdapter(new EnvAiEndpointsProvider({ LLM_BASE_URL: baseUrl }), 'other-model').complete({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal);
    expect(captured.map((c) => c.body.model)).toEqual(['qwen3-vl', 'other-model']);
  });

  it('sends image parts as image_url data URIs next to the text and keeps plain strings as they are', async () => {
    captured = [];
    reply = { status: 200, body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) };
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    await adapter().complete(
      {
        task: 'style_traits',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: [{ type: 'image', data: image, mime: 'image/jpeg' }, { type: 'text', text: 'Describe' }] },
        ],
      },
      new AbortController().signal,
    );
    expect(captured[0].body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } }, { type: 'text', text: 'Describe' }] },
    ]);
    // `task` is for the fake adapter only: it never reaches the backend.
    expect(captured[0].body).not.toHaveProperty('task');
  });

  it('omits response_format without a schema', async () => {
    captured = [];
    reply = { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) };
    const result = await adapter().complete({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal);
    expect(result).toEqual({ text: 'OK', promptTokens: 0, completionTokens: 0 });
    expect(captured[0].body).not.toHaveProperty('response_format');
  });

  it('non-2xx throws AiBackendError without leaking the body', async () => {
    reply = { status: 500, body: JSON.stringify({ error: 'secret internal detail' }) };
    const error = await adapter()
      .complete({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiBackendError);
    expect((error as AiBackendError).status).toBe(500);
    expect((error as Error).message).not.toContain('secret');
    expect((error as Error).message).not.toContain('127.0.0.1');
  });

  it('a malformed body throws AiBackendError', async () => {
    reply = { status: 200, body: 'not json' };
    await expect(
      adapter().complete({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal),
    ).rejects.toBeInstanceOf(AiBackendError);
  });
});
