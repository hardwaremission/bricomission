/** Base URLs of the AI backends. */
export interface AiEndpoints {
  llmBaseUrl: string;
  comfyuiBaseUrl: string;
}

/**
 * Source of the current AI endpoints. Adapters call `get()` on every request,
 * so a provider backed by Platform Settings (`admin-service-endpoints`) can
 * swap endpoints without a restart.
 */
export interface AiEndpointsProvider {
  get(): AiEndpoints;
}

/** Defaults are the compose service URLs. */
export const DEFAULT_AI_ENDPOINTS: AiEndpoints = {
  llmBaseUrl: 'http://llama-server:8080',
  comfyuiBaseUrl: 'http://comfyui:8188',
};

/** Reads `LLM_BASE_URL` / `COMFYUI_BASE_URL` once, falling back to the compose defaults. */
export class EnvAiEndpointsProvider implements AiEndpointsProvider {
  private readonly endpoints: AiEndpoints;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.endpoints = {
      llmBaseUrl: nonEmpty(env.LLM_BASE_URL) ?? DEFAULT_AI_ENDPOINTS.llmBaseUrl,
      comfyuiBaseUrl: nonEmpty(env.COMFYUI_BASE_URL) ?? DEFAULT_AI_ENDPOINTS.comfyuiBaseUrl,
    };
  }

  get(): AiEndpoints {
    return { ...this.endpoints };
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
