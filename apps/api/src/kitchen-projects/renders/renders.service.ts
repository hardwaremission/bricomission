import { randomInt, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { CreateRenderResponse, RenderErrorCode, RenderListResponse, RenderView } from '@bricomission/shared-types';
import { IMAGE_ADAPTER } from '../../ai/ai.tokens.js';
import type { ImageAdapter } from '../../ai/adapters/image-adapter.js';
import { GpuJobFailedError, GpuQueueFullError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../../ai/jobs/gpu-job-broker.service.js';
import { OBJECT_STORAGE, ObjectNotFoundError, type ObjectStorage } from '../../storage/object-storage.js';
import { StyleGalleryService } from '../../style-gallery/style-gallery.service.js';
import { draftError } from '../kitchen-draft.errors.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import type { KitchenPhotoRecord, KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { isReadyForGeneration } from '../readiness.js';
import { RENDER_CONFIG, type RenderConfig } from './render.config.js';
import { cropBefore, encodeRender, renderBucket } from './render-geometry.js';
import { buildRenderPrompt } from './render-prompt.js';
import { RENDER_REPOSITORY, type RenderRecord, type RenderRepository } from './render.repository.js';

export type RenderVariant = 'before' | 'full' | 'thumb';
export const RENDER_VARIANTS: readonly RenderVariant[] = ['before', 'full', 'thumb'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderKeys(projectId: string, renderId: string): Record<RenderVariant, string> {
  const base = `kitchen-projects/${projectId}/renders/${renderId}`;
  return { before: `${base}/before.jpg`, full: `${base}/full.jpg`, thumb: `${base}/thumb.jpg` };
}

/** A storage failure inside the GPU job (so the Render fails `storage_unavailable`). */
class RenderStorageError extends Error {
  override readonly name = 'RenderStorageError';
}

/**
 * Renders of claimed Kitchen Projects (feature controlnet-render). The POST runs outside the GPU
 * slot: readiness, photo pick, the active/limit checks with the `queued` insert under the project
 * row lock, the "before" crop, then `broker.submit('image', ...)`. The job marks the row
 * `running`, calls the image adapter, stores `full`/`thumb` and marks it `succeeded`. Failures
 * mark it `failed` with a public code and remove any result objects. Logs carry error class
 * names only: never a prompt, seed, job id, URL or backend body.
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
    private readonly gallery: StyleGalleryService,
  ) {}

  async create(project: KitchenProjectRecord, body: unknown, ownerSub: string): Promise<CreateRenderResponse> {
    if (!isReadyForGeneration(project)) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
    const photo = this.pickPhoto(project, body);
    const size = renderBucket(photo.width, photo.height);
    const prompt = buildRenderPrompt(project.moodboard, this.gallery);
    const id = randomUUID();
    const keys = renderKeys(project.id, id);

    const created = await this.db(() =>
      this.repo.createQueued(
        {
          id,
          kitchenProjectId: project.id,
          photoId: photo.id,
          mode: this.config.mode,
          styleId: prompt.styleId,
          prompt: prompt.positive,
          seed: randomInt(0, 2 ** 31),
          width: size.width,
          height: size.height,
          beforeKey: keys.before,
          createdAt: this.clock(),
        },
        this.config.maxPerProject,
      ),
    );
    if (created === 'in_progress') throw draftError(HttpStatus.CONFLICT, 'render_in_progress');
    if (created === 'limit_reached') throw draftError(HttpStatus.CONFLICT, 'render_limit_reached');

    let before: Buffer;
    try {
      const source = await this.readObject(photo.fullKey);
      before = await cropBefore(source, size);
      await this.storage.put(keys.before, before, 'image/jpeg');
    } catch (error) {
      this.logger.warn(`Render before image failed (${error instanceof Error ? error.name : 'unknown'})`);
      await this.discard(created, [keys.before]);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }

    const storageFailed = { value: false };
    let handle;
    try {
      handle = this.broker.submit('image', ({ signal }) => this.run(created, before, prompt.negative, signal, storageFailed), { ownerRef: ownerSub });
    } catch (error) {
      await this.discard(created, [keys.before]);
      if (error instanceof GpuQueueFullError) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'gpu_queue_full');
      throw error;
    }
    created.gpuJobId = handle.jobId;
    handle.result.catch((error: unknown) => this.onFailed(created, error, storageFailed.value));
    try {
      await this.repo.setGpuJob(id, handle.jobId);
    } catch (error) {
      // Provenance only: the job runs anyway.
      this.logger.warn(`Render job id not stored (${error instanceof Error ? error.name : 'unknown'})`);
    }
    return { render: this.view(created) };
  }

  async list(project: KitchenProjectRecord): Promise<RenderListResponse> {
    const renders = await this.db(() => this.repo.listByProject(project.id));
    return { renders: renders.map((render) => this.view(render)), maxRenders: this.config.maxPerProject };
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
      status: render.status,
      photoId: render.photoId,
      styleId: render.styleId,
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

  /** The GPU job: `running`, the adapter call, the result objects, `succeeded`. */
  private async run(render: RenderRecord, before: Buffer, negativePrompt: string, signal: AbortSignal, storageFailed: { value: boolean }): Promise<void> {
    const keys = renderKeys(render.kitchenProjectId, render.id);
    await this.repo.markRunning(render.id, this.clock());
    const result = await this.image.render(
      { mode: render.mode, image: before, width: render.width, height: render.height, prompt: render.prompt, negativePrompt, seed: render.seed, control: this.config.control },
      signal,
    );
    const encoded = await encodeRender(result.image, { width: render.width, height: render.height });
    if (signal.aborted) return; // timed out meanwhile: the failure path owns the row
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

  private pickPhoto(project: KitchenProjectRecord, body: unknown): KitchenPhotoRecord {
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) throw draftError(HttpStatus.BAD_REQUEST, 'render_photo_unknown');
    const photoId = (body as { photoId?: unknown } | null | undefined)?.photoId;
    if (photoId === undefined || photoId === null) {
      const first = project.photos.find((photo) => photo.position === 0) ?? project.photos[0];
      if (!first) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
      return first;
    }
    const photo = typeof photoId === 'string' && UUID.test(photoId) ? project.photos.find((candidate) => candidate.id === photoId.toLowerCase()) : undefined;
    if (!photo) throw draftError(HttpStatus.BAD_REQUEST, 'render_photo_unknown');
    return photo;
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

  /** Removes a Render that never reached the GPU (no row, no objects). */
  private async discard(render: RenderRecord, keys: string[]): Promise<void> {
    await this.deleteQuietly(keys);
    try {
      await this.repo.delete(render.id);
    } catch (error) {
      this.logger.warn(`Render row not removed (${error instanceof Error ? error.name : 'unknown'})`);
    }
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
