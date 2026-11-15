import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { AI_ENDPOINTS, GPU_BROKER_OPTIONS, IMAGE_ADAPTER, LLM_ADAPTER } from './ai.tokens.js';
import { type AiEndpointsProvider, EnvAiEndpointsProvider } from './ai-endpoints.provider.js';
import { ComfyUiImageAdapter } from './adapters/comfyui-image.adapter.js';
import { FakeImageAdapter } from './adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from './adapters/fake-llm.adapter.js';
import type { ImageAdapter } from './adapters/image-adapter.js';
import { DEFAULT_LLM_MODEL, LlamaServerLlmAdapter } from './adapters/llama-server-llm.adapter.js';
import type { LlmAdapter } from './adapters/llm-adapter.js';
import { DIAGNOSTICS } from '../diagnostics/diagnostics.types.js';
import type { Diagnostics } from '../diagnostics/diagnostics.types.js';
import { InstrumentedImageAdapter } from '../diagnostics/instrument/image.js';
import { InstrumentedLlmAdapter } from '../diagnostics/instrument/llm.js';
import { gpuBrokerOptionsFromEnv } from './jobs/gpu-broker.options.js';
import { GpuJobBrokerService } from './jobs/gpu-job-broker.service.js';
import { GpuJobsDebugController } from './jobs/gpu-jobs-debug.controller.js';
import { GpuJobsController } from './jobs/gpu-jobs.controller.js';
import { GpuResidencyHook } from './jobs/gpu-residency.hook.js';
import { LLM_UNLOADER, type LlmUnloader, LlamaRouterUnloader, NoopLlmUnloader } from './jobs/llm-unloader.js';

export interface AiModuleOptions {
  /** Mount the debug `POST /ai/jobs`. Default: `GPU_BROKER_DEBUG_ENDPOINTS === 'true'`. */
  debugEndpoints?: boolean;
}

/** Simulated work time of the fakes in the running API, so queueing is observable over SSE. */
const FAKE_IMAGE_DELAY_MS = 3000;
const FAKE_LLM_DELAY_MS = 500;

/**
 * AI layer: GPU job broker, adapters (selected by `AI_ADAPTERS=fake|local`, default fake;
 * local = llama-server and ComfyUI) and the job status endpoints. Global, so product modules
 * (kitchen-projects Renders) share the one broker without re-registering the module.
 */
@Module({})
export class AiModule {
  static register(options: AiModuleOptions = {}): DynamicModule {
    const env = process.env;
    const debugEndpoints = options.debugEndpoints ?? env.GPU_BROKER_DEBUG_ENDPOINTS === 'true';
    const useLocal = env.AI_ADAPTERS === 'local';
    const llmModel = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
    const providers: Provider[] = [
      { provide: GPU_BROKER_OPTIONS, useFactory: () => gpuBrokerOptionsFromEnv(env) },
      { provide: AI_ENDPOINTS, useFactory: (): AiEndpointsProvider => new EnvAiEndpointsProvider(env) },
      {
        provide: LLM_ADAPTER,
        inject: [AI_ENDPOINTS, { token: DIAGNOSTICS, optional: true }],
        useFactory: (endpoints: AiEndpointsProvider, diagnostics?: Diagnostics): LlmAdapter => {
          const adapter: LlmAdapter = useLocal
            ? new LlamaServerLlmAdapter(endpoints, llmModel)
            : new FakeLlmAdapter({ delayMs: delayFromEnv(env.AI_FAKE_LLM_DELAY_MS, FAKE_LLM_DELAY_MS), budgetOrder: env.AI_FAKE_BUDGET_ORDER === 'misordered' ? 'misordered' : 'ordered' });
          return diagnostics?.enabled ? new InstrumentedLlmAdapter(adapter, diagnostics, { simulated: !useLocal, model: llmModel }) : adapter;
        },
      },
      {
        provide: IMAGE_ADAPTER,
        inject: [AI_ENDPOINTS, { token: DIAGNOSTICS, optional: true }],
        useFactory: (endpoints: AiEndpointsProvider, diagnostics?: Diagnostics): ImageAdapter => {
          const adapter: ImageAdapter = useLocal
            ? new ComfyUiImageAdapter(endpoints)
            : new FakeImageAdapter({ delayMs: delayFromEnv(env.AI_FAKE_IMAGE_DELAY_MS, FAKE_IMAGE_DELAY_MS) });
          return diagnostics?.enabled ? new InstrumentedImageAdapter(adapter, diagnostics, !useLocal) : adapter;
        },
      },
      {
        provide: LLM_UNLOADER,
        inject: [AI_ENDPOINTS],
        useFactory: (endpoints: AiEndpointsProvider): LlmUnloader => (useLocal ? new LlamaRouterUnloader(endpoints, llmModel) : new NoopLlmUnloader()),
      },
      GpuResidencyHook,
      GpuJobBrokerService,
    ];
    return {
      module: AiModule,
      global: true,
      controllers: debugEndpoints ? [GpuJobsController, GpuJobsDebugController] : [GpuJobsController],
      providers,
      exports: [GpuJobBrokerService, LLM_ADAPTER, IMAGE_ADAPTER, AI_ENDPOINTS],
    };
  }
}

function delayFromEnv(raw: string | undefined, fallback: number): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : fallback;
}
