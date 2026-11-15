import type { Readable } from 'node:stream';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { RenderErrorCode, RenderView } from '@bricomission/shared-types';
import { IMAGE_ADAPTER } from '../../ai/ai.tokens.js';
import type { ImageAdapter, ImageReference } from '../../ai/adapters/image-adapter.js';
import { GpuJobFailedError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../../ai/jobs/gpu-job-broker.service.js';
import { DIAGNOSTICS, type Diagnostics } from '../../diagnostics/diagnostics.types.js';
import { renderEncoded } from '../../diagnostics/narrate/simulation.js';
import { NULL_DIAGNOSTICS } from '../../diagnostics/null-diagnostics.js';
import { OBJECT_STORAGE, ObjectNotFoundError, type ObjectStorage } from '../../storage/object-storage.js';
import { draftError } from '../kitchen-draft.errors.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import type { KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { RENDER_CONFIG, type RenderConfig } from './render.config.js';
import { encodeRender } from './render-geometry.js';
import { RENDER_REPOSITORY, type RenderRecord, type RenderRepository } from './render.repository.js';

export type RenderVariant = 'before' | 'full' | 'thumb';
export const RENDER_VARIANTS: readonly RenderVariant[] = ['before', 'full', 'thumb'];

export function renderKeys(projectId: string, renderId: string): Record<RenderVariant, string> {
  const base = `kitchen-projects/${projectId}/renders/${renderId}`;
  return { before: `${base}/before.jpg`, full: `${base}/full.jpg`, thumb: `${base}/thumb.jpg` };
}

/** A storage failure inside the GPU job (so the Render fails `storage_unavailable`). */
class RenderStorageError extends Error {
  override readonly name = 'RenderStorageError';
}

/** Inputs of one Render job that the Simulation runner supplies. */
export interface RenderJobInput {
  negativePrompt: string;
  /** IP-Adapter style references at their weights; empty for blend mode `vlm_text`. */
  references: ImageReference[];
  ownerSub: string;
}

/**
 * Single Render execution (features controlnet-render and simulations-ux-overhaul). The Simulation
 * runner creates the rows and submits one job per Render with {@link RendersService.submit}: the job
 * reads the stored "before" crop, marks the row `running`, calls the image adapter, stores
 * `full`/`thumb` and marks it `succeeded`. Failures mark it `failed` with a public code and
 * remove any result objects. Logs carry error class names only: never a prompt, seed, job id,
 * URL or backend body.
 */
@Injectable()
export class RendersService {
  private readonly logger = new Logger(RendersService.name);

  constructor(
    @Inject(RENDER_REPOSITORY) private readonly repo: RenderRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(IMAGE_ADAPTER) private readonly image: ImageAdapter,
    @Inject(RENDER_CONFIG) private readonly config: RenderConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly broker: GpuJobBrokerService,
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics: Diagnostics = NULL_DIAGNOSTICS,
  ) {}

  /**
   * Submits the image job of one `queued` Render. Throws `GpuQueueFullError` when the broker queue
   * is full (nothing changed). `done` settles once the Render is `succeeded` or `failed` (it never rejects).
   */
  submit(render: RenderRecord, input: RenderJobInput): { done: Promise<void> } {
    const storageFailed = { value: false };
    const handle = this.broker.submit('image', ({ signal }) => this.run(render, input, signal, storageFailed), { ownerRef: input.ownerSub });
    const done = handle.result.then(
      () => undefined,
      (error: unknown) => this.onFailed(render, error, storageFailed.value),
    );
    void this.repo.setGpuJob(render.id, handle.jobId).catch((error: unknown) => {
      // Provenance only: the job runs anyway.
      this.logger.warn(`Render job id not stored (${error instanceof Error ? error.name : 'unknown'})`);
    });
    return { done };
  }

  async get(project: KitchenProjectRecord, renderId: string): Promise<RenderView> {
    return this.view(await this.findOr404(project, renderId));
  }

  async content(project: KitchenProjectRecord, renderId: string, variant: RenderVariant): Promise<Readable> {
    const render = await this.findOr404(project, renderId);
    const key = variant === 'before' ? render.beforeKey : variant === 'full' ? render.fullKey : render.thumbKey;
    if (!key || (variant !== 'before' && render.status !== 'succeeded')) throw new NotFoundException();
    try {
      const { body } = await this.storage.getStream(key);
      return body;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw new NotFoundException();
      this.logger.warn(`Render read failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
  }

  view(render: RenderRecord): RenderView {
    const base = `/kitchen-projects/${render.kitchenProjectId}/renders/${render.id}/content?variant=`;
    const queued = render.status === 'queued' && render.gpuJobId ? this.broker.get(render.gpuJobId) : undefined;
    const succeeded = render.status === 'succeeded';
    return {
      id: render.id,
      simulationId: render.simulationId,
      status: render.status,
      photoId: render.photoId,
      photoPosition: render.photoPosition,
      attempts: render.attempts,
      mode: render.mode,
      width: render.width,
      height: render.height,
      position: queued?.status === 'queued' ? queued.position : null,
      waitingFor: queued?.status === 'queued' ? queued.waitingFor : null,
      errorCode: render.errorCode,
      createdAt: render.createdAt.toISOString(),
      startedAt: render.startedAt?.toISOString() ?? null,
      finishedAt: render.finishedAt?.toISOString() ?? null,
      beforeUrl: `${base}before`,
      fullUrl: succeeded ? `${base}full` : null,
      thumbUrl: succeeded ? `${base}thumb` : null,
    };
  }

  /** The GPU job: the stored "before" crop, `running`, the adapter call, the result objects, `succeeded`. */
  private async run(render: RenderRecord, input: RenderJobInput, signal: AbortSignal, storageFailed: { value: boolean }): Promise<void> {
    const keys = renderKeys(render.kitchenProjectId, render.id);
    let before: Buffer;
    try {
      before = await this.readObject(render.beforeKey);
    } catch (error) {
      storageFailed.value = true;
      throw new RenderStorageError(error instanceof Error ? error.name : 'unknown');
    }
    await this.repo.markRunning(render.id, this.clock());
    const result = await this.image.render(
      {
        mode: render.mode,
        image: before,
        width: render.width,
        height: render.height,
        prompt: render.prompt,
        negativePrompt: input.negativePrompt,
        seed: render.seed,
        control: this.config.control,
        references: input.references,
      },
      signal,
    );
    const encoded = await encodeRender(result.image, { width: render.width, height: render.height });
    if (signal.aborted) return; // timed out meanwhile: the failure path owns the row
    renderEncoded(this.diagnostics, { fullBytes: encoded.full.length, thumbBytes: encoded.thumb.length, width: render.width, height: render.height, keys: [keys.full, keys.thumb] });
    try {
      await this.storage.put(keys.full, encoded.full, 'image/jpeg');
      await this.storage.put(keys.thumb, encoded.thumb, 'image/jpeg');
    } catch (error) {
      storageFailed.value = true;
      throw new RenderStorageError(error instanceof Error ? error.name : 'unknown');
    }
    const done = await this.repo.markSucceeded(render.id, {
      fullKey: keys.full,
      thumbKey: keys.thumb,
      finishedAt: this.clock(),
      seconds: Math.round(result.seconds * 100) / 100,
    });
    if (!done) await this.deleteQuietly([keys.full, keys.thumb]);
  }

  private async onFailed(render: RenderRecord, error: unknown, storageFailed: boolean): Promise<void> {
    const code: RenderErrorCode = storageFailed ? 'storage_unavailable' : error instanceof GpuJobFailedError ? error.code : 'adapter_error';
    const keys = renderKeys(render.kitchenProjectId, render.id);
    try {
      await this.repo.markFailed(render.id, code, this.clock());
    } catch (dbError) {
      this.logger.warn(`Render failure not stored (${dbError instanceof Error ? dbError.name : 'unknown'})`);
    }
    this.logger.warn(`Render failed (${code})`);
    await this.deleteQuietly([keys.full, keys.thumb]);
  }

  private async findOr404(project: KitchenProjectRecord, renderId: string): Promise<RenderRecord> {
    const render = await this.db(() => this.repo.find(project.id, renderId.toLowerCase()));
    if (!render) throw new NotFoundException();
    return render;
  }

  private async readObject(key: string): Promise<Buffer> {
    const { body } = await this.storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  private async deleteQuietly(keys: string[]): Promise<void> {
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Orphan render objects left (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Render database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
