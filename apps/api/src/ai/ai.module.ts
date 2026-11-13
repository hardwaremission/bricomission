import { type DynamicModule, Logger, Module, type Provider } from '@nestjs/common';
import { AI_ENDPOINTS, GPU_BROKER_OPTIONS, IMAGE_ADAPTER, LLM_ADAPTER } from './ai.tokens.js';
import { type AiEndpointsProvider, EnvAiEndpointsProvider } from './ai-endpoints.provider.js';
import { FakeImageAdapter } from './adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from './adapters/fake-llm.adapter.js';
import type { ImageAdapter } from './adapters/image-adapter.js';
import { LlamaServerLlmAdapter } from './adapters/llama-server-llm.adapter.js';
import type { LlmAdapter } from './adapters/llm-adapter.js';
import { gpuBrokerOptionsFromEnv } from './jobs/gpu-broker.options.js';
import { GpuJobBrokerService } from './jobs/gpu-job-broker.service.js';
import { GpuJobsDebugController } from './jobs/gpu-jobs-debug.controller.js';
import { GpuJobsController } from './jobs/gpu-jobs.controller.js';
import { GpuResidencyHook } from './jobs/gpu-residency.hook.js';

export interface AiModuleOptions {
  /** Mount the debug `POST /ai/jobs`. Default: `GPU_BROKER_DEBUG_ENDPOINTS === 'true'`. */
  debugEndpoints?: boolean;
}

/** Simulated work time of the fakes in the running API, so queueing is observable over SSE. */
const FAKE_IMAGE_DELAY_MS = 3000;
const FAKE_LLM_DELAY_MS = 500;

/**
 * AI layer: GPU job broker, adapters (selected by `AI_ADAPTERS=fake|local`, default fake)
 * and the job status endpoints.
 */
@Module({})
export class AiModule {
  static register(options: AiModuleOptions = {}): DynamicModule {
    const env = process.env;
    const debugEndpoints = options.debugEndpoints ?? env.GPU_BROKER_DEBUG_ENDPOINTS === 'true';
    const useLocal = env.AI_ADAPTERS === 'local';
    const providers: Provider[] = [
      { provide: GPU_BROKER_OPTIONS, useFactory: () => gpuBrokerOptionsFromEnv(env) },
      { provide: AI_ENDPOINTS, useFactory: (): AiEndpointsProvider => new EnvAiEndpointsProvider(env) },
      {
        provide: LLM_ADAPTER,
        inject: [AI_ENDPOINTS],
        useFactory: (endpoints: AiEndpointsProvider): LlmAdapter =>
          useLocal
            ? new LlamaServerLlmAdapter(endpoints)
            : new FakeLlmAdapter({ delayMs: delayFromEnv(env.AI_FAKE_LLM_DELAY_MS, FAKE_LLM_DELAY_MS) }),
      },
      {
        provide: IMAGE_ADAPTER,
        useFactory: (): ImageAdapter => {
          if (useLocal) {
            new Logger(AiModule.name).warn('AI_ADAPTERS=local: image adapter is still the fake (real one arrives with controlnet-render)');
          }
          return new FakeImageAdapter({ delayMs: delayFromEnv(env.AI_FAKE_IMAGE_DELAY_MS, FAKE_IMAGE_DELAY_MS) });
        },
      },
      GpuResidencyHook,
      GpuJobBrokerService,
    ];
    return {
      module: AiModule,
      controllers: debugEndpoints ? [GpuJobsController, GpuJobsDebugController] : [GpuJobsController],
      providers,
      exports: [GpuJobBrokerService, LLM_ADAPTER, IMAGE_ADAPTER, AI_ENDPOINTS],
    };
  }
}

function delayFromEnv(raw: string | undefined, fallback: number): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : fallback;
}
