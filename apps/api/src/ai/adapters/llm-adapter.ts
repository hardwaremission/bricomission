/** One chat message sent to the LLM. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Non-streaming chat completion request. */
export interface LlmRequest {
  messages: LlmMessage[];
  /** JSON Schema the answer must follow (grammar-constrained output). */
  jsonSchema?: object;
  maxTokens?: number;
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
