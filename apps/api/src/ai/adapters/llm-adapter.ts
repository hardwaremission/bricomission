/** One part of a multimodal message: text, or an image the vision model reads. */
export type LlmContentPart = { type: 'text'; text: string } | { type: 'image'; data: Buffer; mime: string };

/** One chat message sent to the LLM. `content` is plain text or a list of parts (text and images). */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
}

/** The text of a message; images contribute nothing. */
export function contentText(content: LlmMessage['content']): string {
  return typeof content === 'string' ? content : content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/** What a request is for: lets the fake adapter answer deterministically per task. */
export type LlmTask = 'budget' | 'inventory' | 'style_traits';

/** Non-streaming chat completion request. */
export interface LlmRequest {
  messages: LlmMessage[];
  /** JSON Schema the answer must follow (grammar-constrained output). */
  jsonSchema?: object;
  maxTokens?: number;
  /** Purpose of the call (fake adapter dispatch; real backends ignore it). */
  task?: LlmTask;
}

export interface LlmResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

/** LLM backend. Always called through the GPU job broker. */
export interface LlmAdapter {
  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult>;
}
