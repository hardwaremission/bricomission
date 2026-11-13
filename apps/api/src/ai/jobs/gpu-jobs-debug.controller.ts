import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { IMAGE_ADAPTER, LLM_ADAPTER } from '../ai.tokens.js';
import type { ImageAdapter } from '../adapters/image-adapter.js';
import type { LlmAdapter } from '../adapters/llm-adapter.js';
import { GpuQueueFullError } from './gpu-job-broker.errors.js';
import { GpuJobBrokerService } from './gpu-job-broker.service.js';
import { CreateGpuJobDto, GpuJobViewDto } from './gpu-jobs.dto.js';

const MAX_PROMPT_LENGTH = 2000;

/**
 * Debug/test endpoint that runs one adapter call through the broker.
 * Registered only when `GPU_BROKER_DEBUG_ENDPOINTS=true`.
 */
@ApiTags('ai-jobs')
@Controller('ai/jobs')
export class GpuJobsDebugController {
  private readonly logger = new Logger(GpuJobsDebugController.name);

  constructor(
    private readonly broker: GpuJobBrokerService,
    @Inject(LLM_ADAPTER) private readonly llm: LlmAdapter,
    @Inject(IMAGE_ADAPTER) private readonly image: ImageAdapter,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Debug: submit a GPU job (only with GPU_BROKER_DEBUG_ENDPOINTS=true)' })
  @ApiAcceptedResponse({ type: GpuJobViewDto })
  @ApiBadRequestResponse({ description: 'Invalid kind or prompt' })
  @ApiTooManyRequestsResponse({ description: 'GPU queue full' })
  create(@Body() body: CreateGpuJobDto | undefined): GpuJobViewDto {
    const kind = body?.kind;
    const prompt = body?.prompt;
    if (kind !== 'image' && kind !== 'llm') throw new BadRequestException('kind must be image or llm');
    if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH)) {
      throw new BadRequestException(`prompt must be a string of at most ${MAX_PROMPT_LENGTH} characters`);
    }
    try {
      const handle =
        kind === 'llm'
          ? this.broker.submit('llm', ({ signal }) =>
              this.llm.complete({ messages: [{ role: 'user', content: prompt ?? 'Say OK' }], maxTokens: 64 }, signal),
            )
          : this.broker.submit('image', ({ signal }) =>
              this.image.render(
                { mode: 'depth', sourceImageKey: 'debug/source.jpg', prompt: prompt ?? 'debug render', seed: 1 },
                signal,
              ),
            );
      handle.result.then(
        () => this.logger.log(`Debug GPU job ${handle.jobId} done`),
        () => undefined, // the broker already logged the failure class
      );
      return this.broker.get(handle.jobId) as GpuJobViewDto;
    } catch (error) {
      if (error instanceof GpuQueueFullError) {
        throw new HttpException('GPU queue full', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }
}
