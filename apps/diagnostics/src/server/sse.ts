/** Minimal server-sent-events codec (WHATWG framing): enough for the API stream, the agent stream and our own output. */

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export function frame(event: string, data: unknown, id?: string | number): string {
  return `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Incremental parser: feed text chunks, get complete messages. Comments (`: ping`) and `retry:` lines are dropped. */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseMessage[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const out: SseMessage[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const message = parseBlock(block);
      if (message) out.push(message);
      end = this.buffer.indexOf('\n\n');
    }
    return out;
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }
  return data.length === 0 ? null : { event, data: data.join('\n'), id };
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const message of parser.push(decoder.decode(value, { stream: true }))) yield message;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
